import {InsightResult} from "./IInsightFacade";
import Query, {DataRecord} from "./Query";

export class Filter {
	private query: Query;
	private type: string = "";
	private key?: Filter | Filter[] | string;
	private value?: number | string;

	constructor(query: Query, type = "") {
		this.query = query;
		this.type = type;
	}

	public parse(where: object): boolean {
		let type = Object.keys(where)[0];
		if (type === "AND" || type === "OR") {
			return this.parseLogic(where);
		} else if (type === "GT" || type === "LT" || type === "EQ") {
			return this.parseMcomp(where);
		} else if (type === "IS") {
			return this.parseScomp(where);
		} else if (type === "NOT") {
			return this.parseNegation(where);
		}
		return false;
	}

	private parseLogic(where: object): boolean {
		this.type = Object.keys(where)[0];
		if (Object.values(where)[0].length === 0) {
			return false;
		}
		(this.key as Filter[]) = [];
		for (let f of Object.values(where)[0]) {
			let r = new Filter(this.query);
			if (r.parse(f)) {
				(this.key as Filter[]).push(r);
			} else {
				return false;
			}
		}
		return true;
	}

	private parseMcomp(where: object): boolean {
		this.type = Object.keys(where)[0];
		if (Object.keys(Object.values(where)[0]).length !== 1) {
			return false;
		}
		if (typeof Object.values(Object.values(where)[0])[0] !== "number" ||
			typeof Object.keys(Object.values(where)[0])[0] !== "string") {
			return false;
		} else {
			if (!this.query.validateKey(Object.keys(Object.values(where)[0])[0], "m")) {
				return false;
			}
			this.key = Object.keys(Object.values(where)[0])[0];
			this.value = Object.values(Object.values(where)[0])[0] as number;
			return true;
		}
	}

	private parseScomp(where: object): boolean {
		this.type = Object.keys(where)[0];
		if (Object.keys(Object.values(where)[0]).length !== 1) {
			return false;
		}
		if (typeof Object.values(Object.values(where)[0])[0] !== "string" ||
			typeof Object.keys(Object.values(where)[0])[0] !== "string") {
			return false;
		} else {
			if (!this.query.validateKey(Object.keys(Object.values(where)[0])[0], "s")) {
				return false;
			}
			if ((Object.values(Object.values(where)[0])[0] as string).slice(1, -1).includes("*")) {
				return false;
			} else {
				this.key = Object.keys(Object.values(where)[0])[0];
				this.value = Object.values(Object.values(where)[0])[0] as string;
				return true;
			}
		}
	}

	private parseNegation(where: object): boolean {
		this.type = Object.keys(where)[0];
		let r = new Filter(this.query);
		if (r.parse(Object.values(where)[0])) {
			this.key = r;
			return true;
		} else {
			return false;
		}
	}

	public filter(record: DataRecord): boolean {
		if (this.type === "AND") {
			let r = true;
			for (let f of (this.key as Filter[])) {
				r = r && f.filter(record);
				if (!r) {
					break;
				}
			}
			return r;
		} else if (this.type === "OR") {
			let r = false;
			for (let f of (this.key as Filter[])) {
				r = r || f.filter(record);
				if (r) {
					break;
				}
			}
			return r;
		} else if (this.type === "LT") {
			if (record[Filter.parseKey(this.key as string)] < (this.value as number)) {
				return true;
			}
		} else if (this.type === "GT") {
			if (record[Filter.parseKey(this.key as string)] > (this.value as number)) {
				return true;
			}
		} else if (this.type === "EQ") {
			if (record[Filter.parseKey(this.key as string)] === (this.value as number)) {
				return true;
			}
		} else if (this.type === "IS") {
			let s: string = record[Filter.parseKey(this.key as string)] as string;
			if ((this.value as string).startsWith("*") && (this.value as string).endsWith("*")) {
				return s.includes((this.value as string).slice(1, -1));
			} else if ((this.value as string).startsWith("*")) {
				return s.endsWith((this.value as string).slice(1));
			} else if ((this.value as string).endsWith("*")) {
				return s.startsWith((this.value as string).slice(0, -1));
			} else {
				return s === (this.value as string);
			}
		} else if (this.type === "NOT") {
			return !(this.key as Filter).filter(record);
		} else if (this.type === "NULL") {
			return true;
		}
		return false;
	}

	public static parseKey(key: string): string {	// key mapping
		let fileKeys = ["id", "Course", "Title", "Professor", "Subject", "Year", "Avg", "Pass", "Fail", "Audit",
			"fullname", "shortname", "number", "name", "address", "type", "furniture", "href", "lat", "lon", "seats"];
		let datasetKeys = ["uuid", "id", "title", "instructor", "dept", "year", "avg", "pass", "fail", "audit",
			"fullname", "shortname", "number", "name", "address", "type", "furniture", "href", "lat", "lon", "seats"];
		if (key.includes("_")) {
			let parts = key.split("_");
			return fileKeys[datasetKeys.indexOf(parts[1])];
		} else {
			return fileKeys[datasetKeys.indexOf(key)];
		}
	}
}
