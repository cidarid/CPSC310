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
import {Node} from "parse5/dist/tree-adapters/default";


export default class SectionHelper {
	public async unzipContent(content: string): Promise<JSZip> {
		let jsZip = new JSZip();
		let zip = await jsZip.loadAsync(content, {base64: true})
			// jsZip will fail if it is not a zip file
			.catch(() => {
				return Promise.reject(new InsightError("This is not a valid zip file."));
			});
		return Promise.resolve(zip);
	}

	public async parseSectionContentIfValid(zip: JSZip): Promise<any[]> {
		// Check that zip folder includes a courses directory with at least one file inside
		let files = zip.filter(function (relativePath) {
			return relativePath.startsWith("courses/");
		});
		// Removing courses/ from the beginning of the list
		files.shift();
		if (files.length === 0) {
			return Promise.reject(new InsightError("Courses directory incorrectly formatted."));
		}
		// Check that courses contains at least one json formatted file
		let parsedJsonFiles = await this.parseJsonFiles(files);
		if (parsedJsonFiles.length === 0) {
			return Promise.reject(new InsightError("No valid JSON files in courses directory."));
		}
		// Check that each valid JSON file contains at least one valid section
		let validCourseFiles = this.getValidCourseFiles(parsedJsonFiles);
		if (validCourseFiles.length === 0) {
			return Promise.reject(new InsightError("No valid sections in JSON files."));
		}
		return Promise.resolve(validCourseFiles);
	}

	public async parseJsonFiles(courseFiles: JSZip.JSZipObject[]): Promise<any[]> {
		let parsedJsonFiles: any[] = [];
		await Promise.all(
			courseFiles.map(async function (file) {
				let fileString = await file.async("string");
				let parsedJSON: any;
				try {
					parsedJSON = JSON.parse(fileString);
				} catch (e) {
					return;
				}
				parsedJsonFiles.push(parsedJSON);
			})
		);
		return Promise.resolve(parsedJsonFiles);
	}

	public getValidCourseFiles(parsedJsonFiles: any[]): any[] {
		let validCourseFiles: any[] = [];
		let requiredFields = ["id", "Course", "Title", "Professor", "Subject", "Year", "Avg", "Pass", "Fail", "Audit"];
		parsedJsonFiles.forEach(function (parsedJSON) {
			let containsAllFields = true;
			requiredFields.forEach(function (field) {
				if (parsedJSON.result.length === 0 || !(field in parsedJSON.result[0])) {
					containsAllFields = false;
				}
			});
			if (containsAllFields) {
				parsedJSON["result"].forEach(function (section: any) {
					section["Year"] = parseInt(section["Year"], 10);
					section["id"] = section["id"].toString();
				});
				validCourseFiles.push(parsedJSON);
			}
		});
		return validCourseFiles;
	}
}
