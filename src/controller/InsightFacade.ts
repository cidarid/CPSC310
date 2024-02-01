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
import AddHelper from "./AddHelper";
import SectionHelper from "./SectionHelper";

/**
 * This is the main programmatic entry point for the project.
 * Method documentation is in IInsightFacade
 *
 */
export default class InsightFacade implements IInsightFacade {
	public async addDataset(id: any, content: string, kind: InsightDatasetKind): Promise<string[]> {
		let addHelper = new AddHelper();
		let sectionHelper = new SectionHelper();
		// Get main database file
		let mainFile = await this.getMainFile();

		// Check that id is valid - Must not be empty, must not include _, must not be only whitespace, and must not already exist
		if (id === "" || id.includes("_") || id.trim() === "" || mainFile[id] !== undefined) {
			return Promise.reject(new InsightError("Invalid id."));
		}
		// Unzip Base 64 string content using JSZip
		let zip = await sectionHelper.unzipContent(content);
		// Parse content if content is valid, otherwise reject
		let parsedFiles: any[] = [];
		if (kind === InsightDatasetKind.Sections) {
			parsedFiles = await sectionHelper.parseSectionContentIfValid(zip).catch((error) => {
				return Promise.reject(error);
			});
			parsedFiles.unshift({kind: "sections"});
		} else if (kind === InsightDatasetKind.Rooms) {
			parsedFiles = await addHelper.parseRoomContentIfValid(zip).catch((error) => {
				return Promise.reject(error);
			});
			parsedFiles.unshift({kind: "rooms"});
		}

		// Write content to disk
		await this.writeContentToDisk(id, parsedFiles, mainFile).catch((error) => {
			return Promise.reject(error);
		});
		let allDatasets = await this.listDatasets().then((datasets) => datasets.map((dataset) => dataset.id));
		return Promise.resolve(allDatasets);
	}

	public async listDatasets(): Promise<InsightDataset[]> {
		let file: any = await this.getMainFile();
		let datasets = Object.keys(file);
		let datasetList: InsightDataset[] = [];
		datasets.forEach(function (key) {
			let kind: InsightDatasetKind;
			if (file[key][0].kind === "sections") {
				kind = InsightDatasetKind.Sections;
			} else {
				kind = InsightDatasetKind.Rooms;
			}
			datasetList.push({
				id: key,
				kind: kind,
				numRows: InsightFacade.getDatasetLength(file[key]),
			});
		});
		// console.log(datasetList);
		return Promise.resolve(datasetList);
	}

	public async removeDataset(id: any): Promise<string> {
		let fileAsJson = await this.getMainFile();
		if (id === "" || id.includes("_") || id.trim() === "") {
			return Promise.reject(new InsightError("Invalid id."));
		} else if (fileAsJson[id] === undefined) {
			return Promise.reject(new NotFoundError("Dataset not found."));
		}
		delete fileAsJson[id];

		await fs.writeFile(InsightFacade.dataFile(), JSON.stringify(fileAsJson), "utf8")
			.catch((error) => {
				console.error(error);
				return Promise.reject(new InsightError("Unable to write file."));
			});

		return Promise.resolve(id);
	}

	public static dataPath(): string {
		return __dirname + "/../../data/";
	}

	public static dataFile(): string {
		return __dirname + "/../../data/data.json";
	}

	public async getMainFile(): Promise<any[]> {
		if (!fs.pathExistsSync(InsightFacade.dataPath())) {
			await fs.mkdir(InsightFacade.dataPath());
		}
		if (!fs.existsSync(InsightFacade.dataFile())) {
			await fs.writeFile(InsightFacade.dataFile(), "{}", "utf8");
		}
		return fs.readFile(InsightFacade.dataFile(), "utf8")
			.then((data) => {
				return Promise.resolve(JSON.parse(data));
			}).catch(async (error) => {
				console.log(error);
				return Promise.reject(new InsightError("Unable to read file."));
			});
	}

	public writeContentToDisk(id: string, courseFiles: any[], file: any): Promise<void> {
		file[id] = courseFiles;

		try {
			fs.writeFileSync(InsightFacade.dataFile(), JSON.stringify(file), "utf8");
		} catch {
			return Promise.reject(new InsightError("Unable to write file."));
		}

		return Promise.resolve();
	}

	public static getDatasetLength(dataset: any): number {
		let result = 0;
		for (let key in dataset) {
			if (dataset[key]["result"] !== undefined) {
				result += dataset[key]["result"].length;
			}
		}
		if (dataset[0].kind === "rooms") {
			result++;
		}
		return result;
	}

	public async performQuery(query: unknown): Promise<InsightResult[]> {
		let datasets = await this.listDatasets();
		let fileAsJson: any = await this.getMainFile();
		let q = new Query(query, datasets);
		if (q.parse()) {
			let response = await q.performQuery(fileAsJson as DataBase);
			return Promise.resolve(response);
		} else {
			return Promise.reject(new InsightError("Invalid query"));
		}
	}
}
