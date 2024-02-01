import {InsightDataset, InsightDatasetKind, InsightError, InsightResult, ResultTooLargeError} from "./IInsightFacade";
import {Filter} from "./Filter";
import {Transformation} from "./Transformation";
export interface DataBase {
	[id: string]: DataFile[];
}
export interface DataFile {
	result: DataRecord[];
}
export interface DataRecord {
	[key: string]: string | number;
}
export interface Order {
	dir: string;
	keys: string[];
}
export default class Query {
	private input: unknown;
	private filter?: Filter;
	public columns: string[] = [];
	private order?: string | Order;
	public kind: InsightDatasetKind;
	public mfield = ["avg", "pass", "fail", "audit", "year"];
	public sfield = ["dept", "id", "instructor", "title", "uuid"];
	public sfield_room = ["fullname", "shortname", "number", "name", "address", "type", "furniture", "href"];
	public mfield_room = ["lat", "lon", "seats"];
	public tokens = ["MAX", "MIN", "AVG", "SUM", "COUNT"];
	private datasets: InsightDataset[];
	private idList: string[] = [];
	private idString = "";
	private trans: Transformation;
	constructor(input: unknown, datasets: InsightDataset[]) {
		this.input = input;
		this.datasets = datasets;
		for (let m of datasets) {
			this.idList.push(m.id);
		}
		this.kind = InsightDatasetKind.Rooms;
		this.trans = new Transformation(this);
	}

	public parse(): boolean { // parse the query
		if (this.input == null || typeof this.input !== "object") {
			return false;
		} else {
			if ("WHERE" in this.input && "OPTIONS" in this.input) {
				if (this.parseBody(this.input.WHERE as object)) {
					if (this.parseOptions(this.input.OPTIONS as object)) {
						if ("TRANSFORMATIONS" in this.input) {
							if (!this.trans.parseTransformation(this.input.TRANSFORMATIONS as object)) {
								return false;
							}
						}
						return this.validateColumns();
					} else {
						return false;
					}
				} else {
					return false;
				}
			} else {
				return false;
			}
		}
	}

	public performQuery(records: DataBase): Promise<InsightResult[]> {
		let response: InsightResult[] = [];
		let d = records[this.idString];
		let t = this.trans;
		if (this.idString === "") {
			return Promise.reject(new InsightError("Empty query"));
		}
		if (this.trans.group.length === 0) {
			return this.queryWithoutTrans(records);
		} else {
			for(let record of d) {
				record.result.filter((m)=> {
					return this.filter?.filter(m);
				}).map((m)=> {
					return t.transform(m);
				});
			}
			response = t.getResult();
			if(response.length > 5000) {
				return Promise.reject(new ResultTooLargeError("Result too large"));
			}
			let r = this.sort(response);
			if (r === false) {
				return Promise.reject(new InsightError("Invalid query"));
			} else {
				return Promise.resolve(r);
			}
		}
	}

	private queryWithoutTrans(records: DataBase): Promise<InsightResult[]> {
		let response: InsightResult[] = [];
		let f = this.filter;
		let cols = this.columns;
		let d = records[this.idString];
		let kind = this.kind;
		for (let record of d) {
			if (record.result === undefined) {
				continue;
			}
			for (let m of record.result) {
				if (f?.filter(m)) {
					let tmp: InsightResult = {};
					for (let c of cols) {
						if (c.includes("_")) {
							tmp[c] = m[Filter.parseKey(c)];
						}
					}
					response.push(tmp);
					if (response.length > 5000) {
						return Promise.reject(new ResultTooLargeError("Result too large"));
					}
				}
			}
		}
		let r = this.sort(response);
		if (r === false) {
			return Promise.reject(new InsightError("Invalid query"));
		} else {
			return Promise.resolve(r);
		}
	}


	private sort(results: InsightResult[]): InsightResult[] | false {
		if (this.order === undefined) {
			return results;
		}
		if (typeof this.order === "string") {
			if (!Object.keys(results[0]).includes(this.order)) {
				return false;
			}
			return results.sort((a, b) => {
				return this.compare(a[this.order as string], b[this.order as string]);
			});
		} else {
			let coefficient = -1;
			if (this.order.dir === "UP") {
				coefficient = 1;
			}
			return results.sort((a, b) => {
				for (let s of (this.order as Order).keys) {
					let r = this.compare(a[s], b[s]);
					if (r !== 0) {
						return r * coefficient;
					}
				}
				return 0;
			});
		}
	}


	private validateColumns(): boolean {
		for (let key of this.columns) {
			if (!this.validateKey(key, "n", true)) {
				return false;
			} else if (this.trans.group.length !== 0) {
				if (!this.trans.group.includes(key) && !Object.keys(this.trans.apply).includes(key)) {
					return false;
				}
			}
		}
		return true;
	}

	private compare(a: any, b: any): number {
		if (a > b) {
			return 1;
		} else if (a < b) {
			return -1;
		} else {
			return 0;
		}
	}

	private parseBody(where: object): boolean { // parse body part
		if (Object.keys(where).length === 0) {
			this.filter = new Filter(this, "NULL");
			return true;
		} else {
			return this.parseFilter(where);
		}
	}

	private parseOptions(options: object): boolean {
		if ("COLUMNS" in options) {
			if (options.COLUMNS === null || typeof options.COLUMNS !== "object") {
				return false;
			}
			this.columns = (options.COLUMNS as string[]);
			if ("ORDER" in options) {
				if (typeof options.ORDER === "string" && this.validateKey(options.ORDER)) {
					this.order = options.ORDER;
				} else if (typeof options.ORDER === "object") {
					if (Object.keys(options.ORDER as object)[0] === "dir" &&
						(Object.values(options.ORDER as object)[0] === "UP" ||
							(Object.values(options.ORDER as object)[0] === "DOWN")) &&
						Object.keys(options.ORDER as object)[1] === "keys" &&
						typeof Object.values(options.ORDER as object)[1] === "object") {
						this.order = options.ORDER as Order;
					} else {
						return false;
					}
				} else {
					return false;
				}
			}
		} else {
			return false;
		}
		return true;
	}

	public validateKey(key: string, type = "n", containMembers = false) {
		if (key == null || key === "") {
			return false;
		}
		let parts = key.split("_");
		if (parts.length === 1 && containMembers) {
			return Object.keys(this.trans.apply).includes(key);
		}
		if (parts.length !== 2 || parts[0] === "" || !(this.idList.includes(parts[0]))) {
			return false;
		}
		if (this.idString === "") {
			this.idString = parts[0];
			for (let d of this.datasets) {
				if (d.id === parts[0]) {
					this.kind = d.kind;
					break;
				}
			}
		} else {
			if (parts[0] !== this.idString) {
				return false;
			}
		}
		return this.validateField(parts[1], type);
	}

	private validateField(field: string, type: string): boolean {
		if (type === "m") {
			if (this.kind === InsightDatasetKind.Sections) {
				if (!(this.mfield.includes(field))) {
					return false;
				}
			} else {
				if (!(this.mfield_room.includes(field))) {
					return false;
				}
			}
		} else if (type === "s") {
			if (this.kind === InsightDatasetKind.Sections) {
				if (!(this.sfield.includes(field))) {
					return false;
				}
			} else {
				if (!(this.sfield_room.includes(field))) {
					return false;
				}
			}
		} else {
			if (this.kind === InsightDatasetKind.Sections) {
				if (!(this.mfield.includes(field)) && !(this.sfield.includes(field))) {
					return false;
				}
			} else {
				if (!(this.mfield_room.includes(field)) && !(this.sfield_room.includes(field))) {
					return false;
				}
			}
		}
		return true;
	}

	private parseFilter(where: object): boolean {
		let f = new Filter(this);
		if (f.parse(where)) {
			this.filter = f;
			return true;
		} else {
			return false;
		}
	}
}
