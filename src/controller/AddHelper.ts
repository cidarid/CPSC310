import {
	IInsightFacade,
	InsightDataset,
	InsightDatasetKind,
	InsightError,
	InsightResult,
	NotFoundError, ResultTooLargeError,
} from "./IInsightFacade";

import JSZip from "jszip";
import * as fs from "fs-extra";
import {parse} from "parse5";
import Query, {DataBase} from "./Query";
import * as http from "node:http";
import {Node} from "parse5/dist/tree-adapters/default";


export default class AddHelper {
	public async parseRoomContentIfValid(zip: JSZip): Promise<any[]> {
		let indexFile = zip.files["index.htm"];
		if (indexFile === undefined) {
			return Promise.reject(new InsightError("No index file."));
		}
		let indexString = await indexFile.async("string");
		let indexDocument = parse(indexString);
		let tables = this.getTables(indexDocument);
		if (tables.length === 0) {
			return Promise.reject(new InsightError("No tables."));
		}
		let validTable;
		for (let table of tables) {
			if (this.checkIfValidTable(table)) {
				validTable = table;
				break;
			}
		}
		if (validTable === undefined) {
			return Promise.reject(new InsightError("No building table found."));
		}
		let buildingFiles = this.getBuildingFiles(validTable);
		if (buildingFiles.length === 0) {
			return Promise.reject(new InsightError("No rooms in building table."));
		}
		let buildingsAsJson = await Promise.all(buildingFiles.map(async function (building) {
			let buildingFile = zip.files[building.link];
			if (buildingFile !== undefined) {
				let buildingString = await buildingFile.async("string");
				let buildingDocument = parse(buildingString);
				return {...building, document: buildingDocument};
			}
			return null;
		}));
		buildingsAsJson = buildingsAsJson.filter((building) => building !== null);
		if (buildingsAsJson.length === 0) {
			return Promise.reject(new InsightError("No rooms in building table."));
		}
		let holder: any[] = [];
		await Promise.all(buildingsAsJson.map(async (json) => {
			let buildingAsObject: any = await this.parseBuildingFile(json).catch();
			if (buildingAsObject.error === undefined) {
				holder.push({result: buildingAsObject});
			}
		}));
		if (holder.length === 0) {
			return Promise.reject(new InsightError("Error parsing JSON"));
		}
		return Promise.resolve(holder);
	}

	public getTables(indexDocument: any): any[] {
		let tableNodes: any[] = [];
		let nodesToSearch: any[] = indexDocument.childNodes;
		// While there are still nodes to search
		while (nodesToSearch.length > 0) {
			// Pop the first node off the list
			let node = nodesToSearch.pop();
			// If the node is a table, add it to the list of table nodes
			// Otherwise, if the node has children, add all of its children to the list of nodes to search
			if (node.nodeName === "table") {
				tableNodes.push(node);
			} else if (node.childNodes !== undefined && node.childNodes.length > 0) {
				node.childNodes.forEach(function (childNode: any) {
					nodesToSearch.push(childNode);
				});
			}
		}
		return tableNodes;
	}

	public checkIfValidTable(table: any): boolean {
		let foundValidTable = false;

		let tdNodes = this.getCellsFromTable(table);
		if (tdNodes === null) {
			return false;
		}

		tdNodes.every(function (td: any) {
			// If node has a class of views-field, it's a valid table
			if (td.attrs !== undefined) {
				td.attrs.every(function (attr: any) {
					if (attr.name === "class" && attr.value.includes("views-field")) {
						foundValidTable = true;
					}
					return !foundValidTable;
				});
			}
			return !foundValidTable;
		});

		return foundValidTable;
	}

	public getBuildingFiles(table: any): any[] {
		// Get all the td nodes in the table that are of the class views-field views-field-title
		let buildings: any[] = [];
		let rows = this.getRowsFromTable(table);
		rows.forEach(function (row: any) {
			let children = row.childNodes;
			let findNode = ((tag: string) => {
				return children.find((child: any) => child.nodeName === "td" && child.attrs[0].value === tag);
			});

			let findNodeA = ((tag: string) => {
				let node = children.find((child: any) => child.nodeName === "td" && child.attrs[0].value === tag);
				return node.childNodes[1];
			});

			let getText = ((node: any) => node.childNodes[0].value);
			let building = {
				shortname: getText(findNode("views-field views-field-field-building-code")).trim(),
				fullname: getText(findNodeA("views-field views-field-title")).trim(),
				link: findNode("views-field views-field-title").childNodes[1].attrs[0].value.slice(2),
				address: getText(findNode("views-field views-field-field-building-address")).trim(),
			};
			buildings.push(building);
		});
		return buildings;
	}

	public async parseBuildingFile(building: any): Promise<object> {
		let tables = this.getTables(building.document);
		if (tables.length === 0) {
			return {error: "No tables"};
		}
		let buildingTable = tables.find((table: any) => table.attrs[0].value.includes("views-table"));
		let rows = this.getRowsFromTable(buildingTable);
		let rooms: any[] = [];
		await Promise.all(rows.map(async (row: any) => {
			let children = row.childNodes;
			let findNode = ((tag: string) => {
				return children.find((child: any) => child.nodeName === "td" && child.attrs[0].value === tag);
			});
			let findNodeA = ((tag: string) => {
				let node = children.find((child: any) => child.nodeName === "td" && child.attrs[0].value === tag);
				return node.childNodes[1];
			});
			let getText = ((node: any) => node.childNodes[0].value);
			let number = getText(findNodeA("views-field views-field-field-room-number"));
			let furniture = getText(findNode("views-field views-field-field-room-furniture")).trim();
			let seats = getText(findNode("views-field views-field-field-room-capacity")).trim();
			let type = getText(findNode("views-field views-field-field-room-type")).trim();
			let href = findNode("views-field views-field-nothing").childNodes[1].attrs[0].value;
			if (number === "" || furniture === "" || seats === "" || type === "" || href === "") {
				return {};
			}
			let geo: any = await this.fetchGeoData(building.address);
			if (geo.error !== undefined) {
				return Promise.reject(new InsightError("NOT VALID"));
			}
			let object = {
				number, furniture, seats, type, href,
				shortname: building.shortname, fullname: building.fullname,
				address: building.address, name: building.shortname + "_" + number,
				lat: geo.lat, lon: geo.lon
			};
			rooms.push(object);
		}));
		if (rooms.length === 0) {
			return Promise.reject(new InsightError("Something went wrong. Most likely invalid geo"));
		}
		return rooms;
	}

	public getCellsFromTable(table: any): any {
		let trNodes = this.getRowsFromTable(table);
		if (trNodes === null) {
			return null;
		}

		let tdNodes: any[] = [];
		trNodes.forEach(function (rowNode: any) {
			rowNode.childNodes.forEach(function (childNode: any) {
				if (childNode.nodeName === "td") {
					tdNodes.push(childNode);
				}
			});
		});

		return tdNodes;
	}

	public getRowsFromTable(table: any): any {

		let tbody = table.childNodes.find(function (node: any) {
			return node.nodeName === "tbody";
		});
		if (tbody === undefined) {
			return null;
		}
		let trNodes: any[] = [];
		tbody.childNodes.forEach(function (node: any) {
			if (node.nodeName === "tr") {
				trNodes.push(node);
			}
		});

		return trNodes;
	}

	public async fetchGeoData(address: string) {
		return new Promise((resolve, reject) => {
			const url = "http://cs310.students.cs.ubc.ca:11316/api/v1/project_team269/" + encodeURIComponent(address);

			http.get(url, (res: any) => {
				let data = "";

				// A chunk of data has been received.
				res.on("data", (chunk: any) => {
					data += chunk;
				});

				// The whole response has been received.
				res.on("end", () => {
					let geo = JSON.parse(data);
					resolve(geo);
				});

			}).on("error", (err: any) => {
				reject(err);
			});
		});
	}

}
