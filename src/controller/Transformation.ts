import Query, {DataRecord} from "./Query";
import {InsightDatasetKind, InsightResult} from "./IInsightFacade";
import {Filter} from "./Filter";
import Decimal from "decimal.js";

export interface ApplyRule {
	[applyKey: string]: {token: string, key: string};
}
export interface TmpResult {
	[key: string]: string | number | Decimal;
}

export class Transformation {
	private query: Query;
	public group: string[] = [];
	public apply: ApplyRule = {};
	private result: TmpResult[] = [];
	private avgKeys: string[] = [];
	private sumKeys: string[] = [];
	constructor(query: Query) {
		this.query = query;
	}

	public parseTransformation(transformation: object): boolean {
		if("GROUP" in transformation && "APPLY" in transformation && typeof transformation.GROUP === "object" &&
			typeof transformation.APPLY === "object") {
			if((transformation.GROUP as any[]).length === 0) {
				return false;
			}
			for(let k of (transformation.GROUP as any[])) {
				if(typeof k !== "string" || !this.query.validateKey(k)) {
					return false;
				}
			}
			this.group = transformation.GROUP as string[];
			for(let t of (transformation.APPLY as object[])){
				if(typeof Object.keys(t)[0] === "string" && !Object.keys(t)[0].includes("_")
					&& typeof Object.values(t)[0] === "object") {
					let rule = Object.values(t)[0];
					if(typeof Object.keys(rule)[0] === "string" && typeof Object.values(rule)[0] === "string" &&
						this.query.tokens.includes(Object.keys(rule)[0]) &&
						this.query.validateKey(Object.values(rule)[0] as string)) {
						if(Object.keys(rule)[0] !== "COUNT") {
							if(!this.query.mfield_room.includes(Object.values(rule)[0] as string)
								&& !this.query.mfield.includes(Object.values(rule)[0] as string)) {
								return false;
							}
						}
						this.apply[Object.keys(t)[0]] = {token: Object.keys(rule)[0],
							key: Object.values(rule)[0] as string};
						if(Object.keys(rule)[0] === "AVG") {
							this.avgKeys.push(Object.keys(t)[0]);
						} else if(Object.keys(rule)[0] === "SUM") {
							this.sumKeys.push(Object.keys(t)[0]);
						}
					} else {
						return false;
					}
				} else {
					return false;
				}
			}
			return true;
		} else {
			return false;
		}
	}

	public transform(record: DataRecord): void {
		for(let r of this.result) {
			let match = true;
			for(let m of this.group) {
				if(record[this.parseKey(m)] !== r[m]) {
					match = false;
					break;
				}
			}
			if(match) {
				for(let rule of Object.keys(this.apply)) {
					if(this.apply[rule].token === "MAX") {
						if((record[this.parseKey(this.apply[rule].key)] as number) > r[rule]) {
							r[rule] = (record[this.parseKey(this.apply[rule].key)] as number);
						}
					} else if(this.apply[rule].token === "MIN") {
						if((record[this.parseKey(this.apply[rule].key)] as number) < r[rule]) {
							r[rule] = (record[this.parseKey(this.apply[rule].key)] as number);
						}
					} else if(this.apply[rule].token === "COUNT") {
						(r[rule] as number)++;
					} else if(this.apply[rule].token === "SUM") {
						(r[rule] as number) += (record[this.parseKey(this.apply[rule].key)] as number);
					} else if(this.apply[rule].token === "AVG") {
						(r[rule + "__COUNT"] as number)++;
						// (r[rule + "__SUM"] as number) += (record[this.parseKey(this.apply[rule].key)] as number);
						(r[rule + "__SUM"] = Decimal.add(r[rule + "__SUM"],
							new Decimal(record[this.parseKey(this.apply[rule].key)] as number)));
					}
				}
				return;
			}
		}
		this.addMember(record);
	}

	private addMember(record: DataRecord): void {
		let tmp: TmpResult = {};
		for(let m of this.group) {
			tmp[m] = record[this.parseKey(m)];
		}
		for(let rule of Object.keys(this.apply)) {
			if(this.apply[rule].token === "MAX" || this.apply[rule].token === "MIN"
				|| this.apply[rule].token === "SUM") {
				tmp[rule] = record[this.parseKey(this.apply[rule].key)];
			} else if(this.apply[rule].token === "COUNT") {
				tmp[rule] = 1;
			} else {
				tmp[rule + "__COUNT"] = 1;
				tmp[rule + "__SUM"] = new Decimal(record[this.parseKey(this.apply[rule].key)]);
			}
		}
		this.result.push(tmp);
		return;
	}

	private parseKey(key: string): string {
		return Filter.parseKey(key);
	}

	public getResult(): InsightResult[] {
		let response: InsightResult[] = [];
		for(let r of this.result) {
			for(let ak of this.avgKeys) {
				// r[ak] = (r[ak + "__SUM"] as number) / (r[ak + "__SUM"] as number);
				r[ak] = (r[ak + "__SUM"] as Decimal).toNumber() / (r[ak + "__COUNT"] as number);
				r[ak] = Number((r[ak] as number).toFixed(2));
			}
			for(let sk of this.sumKeys) {
				r[sk] = Number((r[sk] as number).toFixed(2));
			}
/*			for(let k of Object.keys(r)) {
				if(!this.query.columns.includes(k)) {
					delete r[k];
				}
			} */
			let tmp: InsightResult = {};
			for(let k of this.query.columns) {
				tmp[k] = r[k] as string | number;
			}
			response.push(tmp);
		}
		return response;
	}
}
