import {
	IInsightFacade,
	InsightDatasetKind,
	InsightError,
	InsightResult,
	NotFoundError,
	ResultTooLargeError,
} from "../../src/controller/IInsightFacade";
import InsightFacade from "../../src/controller/InsightFacade";

import {folderTest} from "@ubccpsc310/folder-test";
import {expect, use} from "chai";
import chaiAsPromised from "chai-as-promised";
import {clearDisk, getContentFromArchives} from "../TestUtil";
import {get} from "http";

use(chaiAsPromised);

describe("InsightFacade", function () {
	let facade: IInsightFacade;

	// Declare datasets used in tests. You should add more datasets like this!
	let sections: string;

	before(function () {
		// This block runs once and loads the datasets.
		// sections = getContentFromArchives("pair.zip");

		// Just in case there is anything hanging around from a previous run of the test suite
		clearDisk();
	});


	beforeEach(function () {
		clearDisk();
		facade = new InsightFacade();
	});

	describe("addDataset", function () {
		let one: string, empty: string;

		before(function () {
			sections = getContentFromArchives("small.zip");
			empty = getContentFromArchives("empty.zip");
			one = getContentFromArchives("one-course.zip");
		});

		describe("id tests", function () {
			it("should reject when adding with an empty database id", function () {
				const result = facade.addDataset("", sections, InsightDatasetKind.Sections);

				return expect(result).to.eventually.be.rejectedWith(InsightError);
			});

			it("should reject when adding a database id that contains an underscore", function () {
				const result = facade.addDataset("abc_def", sections, InsightDatasetKind.Sections);

				return expect(result).to.eventually.be.rejectedWith(InsightError);
			});

			it("should reject when adding with a database id that is only whitespace", function () {
				const result = facade.addDataset("   ", sections, InsightDatasetKind.Sections);

				return expect(result).to.eventually.be.rejectedWith(InsightError);
			});

			it("should reject adding duplicate ids", async function () {
				this.timeout(10000);
				await facade.addDataset("123", sections, InsightDatasetKind.Sections).catch(() => {
					console.error("Error adding initial dataset for duplicate ID testing");
				});
				const result = facade.addDataset("123", sections, InsightDatasetKind.Sections);

				return expect(result).to.eventually.be.rejectedWith(InsightError);
			});
		});

		describe("content tests", function () {
			it("should only accept zip files", function () {
				const textFile = getContentFromArchives("dummy.txt");
				const result = facade.addDataset("abc", textFile, InsightDatasetKind.Sections);

				return expect(result).to.eventually.be.rejectedWith(InsightError);
			});

			it("should only accept zip files with valid sections", function () {
				const emptyFile = getContentFromArchives("empty.zip");
				const result = facade.addDataset("abc", emptyFile, InsightDatasetKind.Sections);

				return expect(result).to.eventually.be.rejectedWith(InsightError);
			});

			it("should reject with an empty dataset", function () {
				const result = facade.addDataset("abc", "", InsightDatasetKind.Sections);

				return expect(result).to.eventually.be.rejectedWith(InsightError);
			});

			it("should add a single course", function () {
				const result = facade.addDataset("single", one, InsightDatasetKind.Sections);

				return expect(result).to.eventually.deep.equal(["single"]);
			});
		});

		describe("course validation", function () {
			it("should reject with a dataset that has no courses folder", function () {
				const noCourses = getContentFromArchives("no-courses-folder.zip");
				const result = facade.addDataset("abc", noCourses, InsightDatasetKind.Sections);

				return expect(result).to.eventually.be.rejectedWith(InsightError);
			});

			it("should reject if a course file is not JSON formatted", function () {
				const invalidJson = getContentFromArchives("invalid-json.zip");
				const result = facade.addDataset("abc", invalidJson, InsightDatasetKind.Sections);

				return expect(result).to.eventually.be.rejectedWith(InsightError);
			});

			it("should reject if a course file does not have any valid sections", function () {
				const invalidJson = getContentFromArchives("empty-result.zip");
				const result = facade.addDataset("abc", invalidJson, InsightDatasetKind.Sections);

				return expect(result).to.eventually.be.rejectedWith(InsightError);
			});

			// In this case the professor field
			it("should reject if a course file is missing a required field", function () {
				const invalidJson = getContentFromArchives("missing-field.zip");
				const result = facade.addDataset("abc", invalidJson, InsightDatasetKind.Sections);

				return expect(result).to.eventually.be.rejectedWith(InsightError);
			});

			it("should add a valid dataset", function () {
				const result = facade.addDataset("test", sections, InsightDatasetKind.Sections);

				return expect(result).to.eventually.deep.equal(["test"]);
			});

			it("should add multiple valid datasets", async function () {
				await facade.addDataset("test", sections, InsightDatasetKind.Sections);
				let result = facade.addDataset("test2", sections, InsightDatasetKind.Sections);

				return expect(result).to.eventually.deep.equal(["test", "test2"]);
			});
		});

		describe("room tests", function () {
			let campus: string, index: string, noIndex: string, indexNoTable: string, unlinkedTable: string,
				emptyRooms: string, invalidRooms: string, invalidGeo: string;

			before(function () {
				campus = getContentFromArchives("campus.zip");
				index = getContentFromArchives("index.zip");
				noIndex = getContentFromArchives("no-index.zip");
				indexNoTable = getContentFromArchives("index-no-table.zip");
				unlinkedTable = getContentFromArchives("unlinked-table.zip");
				emptyRooms = getContentFromArchives("empty-rooms.zip");
				invalidRooms = getContentFromArchives("invalid-rooms.zip");
				invalidGeo = getContentFromArchives("invalid-geo.zip");
			});

			it("should add a valid rooms dataset", function () {
				const result = facade.addDataset("test", campus, InsightDatasetKind.Rooms);

				return expect(result).to.eventually.deep.equal(["test"]);
			});

			it("should fail when adding a dataset that only contains courses and not rooms", function () {
				const result = facade.addDataset("test", sections, InsightDatasetKind.Rooms);

				return expect(result).to.eventually.be.rejectedWith(InsightError);
			});

			it("should fail when a dataset has no rooms", function () {
				const result = facade.addDataset("test", empty, InsightDatasetKind.Rooms);

				return expect(result).to.eventually.be.rejectedWith(InsightError);
			});

			it("should fail when a dataset has an index file but no rooms", function () {
				const result = facade.addDataset("test", index, InsightDatasetKind.Rooms);

				return expect(result).to.eventually.be.rejectedWith(InsightError);
			});

			it("should fail when a dataset has rooms but no index file", function () {
				const result = facade.addDataset("test", noIndex, InsightDatasetKind.Rooms);

				return expect(result).to.eventually.be.rejectedWith(InsightError);
			});

			it("should reject an index.htm file without a valid table", function () {
				const result = facade.addDataset("test", indexNoTable, InsightDatasetKind.Rooms);

				return expect(result).to.eventually.be.rejectedWith(InsightError);
			});

			it("should reject a dataset that has only unlinked buildings", function () {
				const result = facade.addDataset("test", unlinkedTable, InsightDatasetKind.Rooms);

				return expect(result).to.eventually.be.rejectedWith(InsightError);
			});

			it("should reject a dataset that has only buildings with no rooms", function () {
				const result = facade.addDataset("test", emptyRooms, InsightDatasetKind.Rooms);

				return expect(result).to.eventually.be.rejectedWith(InsightError);
			});

			it("should reject a dataset that has only rooms with incomplete fields", function () {
				const result = facade.addDataset("test", invalidRooms, InsightDatasetKind.Rooms);

				return expect(result).to.eventually.be.rejectedWith(InsightError);
			});

			it("should reject when a room is valid but has invalid geolocation", function () {
				const result = facade.addDataset("test", invalidGeo, InsightDatasetKind.Rooms);

				return expect(result).to.eventually.be.rejectedWith(InsightError);
			});
		});

	});

	describe("removeDataset", function () {
		let tiny: string;

		before(function () {
			sections = getContentFromArchives("small.zip");
			tiny = getContentFromArchives("smaller.zip");
		});

		// ID tests
		it("should reject with removing with an empty database id", function () {
			const result = facade.removeDataset("");

			return expect(result).to.eventually.be.rejectedWith(InsightError);
		});

		it("should reject a database id that contains an underscore", function () {
			const result = facade.removeDataset("abc_def");

			return expect(result).to.eventually.be.rejectedWith(InsightError);
		});

		it("should reject with a database id that is only whitespace", function () {
			const result = facade.removeDataset("   ");

			return expect(result).to.eventually.be.rejectedWith(InsightError);
		});

		it("should successfully remove a dataset", async function () {
			this.timeout(10000);
			try {
				await facade.addDataset("123", sections, InsightDatasetKind.Sections);
			} catch (e) {
				console.error("Error adding initial dataset for removal testing");
			}
			const result = facade.removeDataset("123");

			return expect(result).to.eventually.deep.equal("123");
		});

		it("should successfully remove one dataset and leave the other one", async function () {
			this.timeout(10000);
			try {
				await facade.addDataset("123", sections, InsightDatasetKind.Sections);
				await facade.addDataset("456", tiny, InsightDatasetKind.Sections);
			} catch (e) {
				console.error("Error adding initial dataset for removal testing");
			}

			await facade.removeDataset("123");

			return expect(facade.listDatasets()).to.eventually.deep.equal([
				{id: "456", kind: InsightDatasetKind.Sections, numRows: 3},
			]);
		});

		it("should fail when removing a dataset that doesn't exist", function () {
			const result = facade.removeDataset("123");

			return expect(result).to.eventually.be.rejectedWith(NotFoundError);
		});

		it("should not return a query result after removing a dataset", async function () {
			this.timeout(10000);
			try {
				await facade.addDataset("123", sections, InsightDatasetKind.Sections);
			} catch (e) {
				console.error("Error adding initial dataset for removal testing");
			}
			await facade.removeDataset("123");
			const result = facade.performQuery({
				WHERE: {},
				OPTIONS: {
					COLUMNS: ["123_dept"],
				},
			});

			return expect(result).to.eventually.be.rejectedWith(InsightError);
		});
	});

	describe("listDatasets", function () {
		let one: string, pair: string;

		before(function () {
			pair = getContentFromArchives("pair.zip");
			sections = getContentFromArchives("small.zip");
			one = getContentFromArchives("one-course.zip");
		});

		it("should list one dataset", async function () {
			await facade.addDataset("one", one, InsightDatasetKind.Sections);
			const result = facade.listDatasets();

			return expect(result).to.eventually.deep.equal([
				{
					id: "one",
					kind: InsightDatasetKind.Sections,
					numRows: 1,
				},
			]);
		});

		it("should list multiple courses", async function () {
			await facade.addDataset("ubc", sections, InsightDatasetKind.Sections);
			const result = facade.listDatasets();

			return expect(result).to.eventually.deep.equal([
				{
					id: "ubc",
					kind: InsightDatasetKind.Sections,
					numRows: 90,
				},
			]);
		});

		it("should list multiple datasets", async function () {
			await facade.addDataset("ubc", sections, InsightDatasetKind.Sections);
			await facade.addDataset("one", one, InsightDatasetKind.Sections);
			const result = facade.listDatasets();

			return expect(result).to.eventually.deep.equal([
				{
					id: "ubc",
					kind: InsightDatasetKind.Sections,
					numRows: 90,
				},
				{
					id: "one",
					kind: InsightDatasetKind.Sections,
					numRows: 1,
				},
			]);
		});
	});

	describe("crash handling", function () {

		before(function () {
			sections = getContentFromArchives("small.zip");
		});

		it("should handle listing dataset after crashes", async function () {
			const firstFacade = new InsightFacade();
			await firstFacade.addDataset("ubc", sections, InsightDatasetKind.Sections);
			const secondFacade = new InsightFacade();
			const result = secondFacade.listDatasets();

			return expect(result).to.eventually.deep.equal([
				{
					id: "ubc",
					kind: InsightDatasetKind.Sections,
					numRows: 90,
				},
			]);
		});

		it("should handle duplicate dataset after crashes", async function () {
			const firstFacade = new InsightFacade();
			await firstFacade.addDataset("ubc", sections, InsightDatasetKind.Sections);
			const secondFacade = new InsightFacade();
			const result = secondFacade.addDataset("ubc", sections, InsightDatasetKind.Sections);

			return expect(result).to.eventually.be.rejectedWith(InsightError);
		});

		it("should delete dataset after crashes", async function () {
			const firstFacade = new InsightFacade();
			await firstFacade.addDataset("ubc", sections, InsightDatasetKind.Sections);
			const secondFacade = new InsightFacade();
			await secondFacade.removeDataset("ubc");
			const result = secondFacade.listDatasets();

			return expect(result).to.eventually.deep.equal([]);
		});
	});

	/*
	 * This test suite dynamically generates tests from the JSON files in test/resources/queries.
	 * You should not need to modify it; instead, add additional files to the queries directory.
	 * You can still make tests the normal way, this is just a convenient tool for a majority of queries.
	 */
	describe.skip("PerformQuery", () => {
		before(function () {
			console.info(`Before: ${this.test?.parent?.title}`);

			facade = new InsightFacade();

			sections = getContentFromArchives("pair.zip");

			// Load the datasets specified in datasetsToQuery and add them to InsightFacade.
			// Will *fail* if there is a problem reading ANY dataset.
			const loadDatasetPromises = [facade.addDataset("sections", sections, InsightDatasetKind.Sections)];

			return Promise.all(loadDatasetPromises);
		});

		after(function () {
			console.info(`After: ${this.test?.parent?.title}`);
			clearDisk();
		});

		type PQErrorKind = "ResultTooLargeError" | "InsightError";

		folderTest<unknown, Promise<InsightResult[]>, PQErrorKind>(
			"Dynamic InsightFacade PerformQuery tests",
			(input) => facade.performQuery(input),
			"./test/resources/queries",
			{
				assertOnResult: (actual, expected) => {
					// TODO add an assertion!
					expect(actual).to.deep.equal(expected);
				},
				errorValidator: (error): error is PQErrorKind =>
					error === "ResultTooLargeError" || error === "InsightError",
				assertOnError: (actual, expected) => {
					// TODO add an assertion!
				},
			}
		);
	});

	describe("performQuery", function () {
		let ubc: string, one: string, pair: string, small: string;

		before(function () {
			pair = getContentFromArchives("pair.zip");
			ubc = getContentFromArchives("small.zip");
			one = getContentFromArchives("one-course.zip");
			small = getContentFromArchives("smaller.zip");
		});

		beforeEach(async function () {
			clearDisk();
			facade = new InsightFacade();
			await facade.addDataset("ubc", ubc, InsightDatasetKind.Sections);
			await facade.addDataset("one", one, InsightDatasetKind.Sections);
			await facade.addDataset("small", small, InsightDatasetKind.Sections);
		});

		it("should reject a query that is too large", async function () {
			await facade.addDataset("pair", pair, InsightDatasetKind.Sections);
			const result = facade.performQuery({
				WHERE: {},
				OPTIONS: {
					COLUMNS: [
						"pair_dept"
					]
				}
			});

			return expect(result).to.eventually.be.rejectedWith(ResultTooLargeError);
		});

		it("should reject a query that queries multiple datasets", async function () {
			const result = facade.performQuery({
				WHERE: {
					GT: {
						one_avg: 90
					}
				},
				OPTIONS: {
					COLUMNS: [
						"ubc_dept"
					]
				}
			});

			return expect(result).to.eventually.be.rejectedWith(InsightError);
		});

		it("should reject a query that queries a nonexistent dataset", async function () {
			const result = facade.performQuery({
				WHERE: {},
				OPTIONS: {
					COLUMNS: [
						"nonexistent_dept",
					]
				}
			});

			return expect(result).to.eventually.be.rejectedWith(InsightError);
		});


		it("should accurately query", async function () {
			const result = facade.performQuery({
				WHERE: {},
				OPTIONS: {
					COLUMNS: [
						"one_uuid",
						"one_id",
						"one_title",
						"one_instructor",
						"one_dept",
						"one_year",
						"one_avg",
						"one_pass",
						"one_fail",
						"one_audit"
					]
				}
			});

			return expect(result).to.eventually.deep.equal([{
				one_uuid: "25945",
				one_id: "100",
				one_title: "",
				one_instructor: "",
				one_dept: "test",
				one_year: 2013,
				one_avg: 60,
				one_pass: 3,
				one_fail: 0,
				one_audit: 0
			}]);
		});

		it("should reject an invalid id", function () {
			const result = facade.performQuery({
				WHERE: {},
				OPTIONS: {
					COLUMNS: [
						"invalid_dept"
					]
				}
			});

			return expect(result).to.eventually.be.rejectedWith(InsightError);
		});

		it("should return exact input for INPUT", async function () {
			const result = facade.performQuery({
				WHERE: {
					IS: {
						small_uuid: "599"
					}
				},
				OPTIONS: {
					COLUMNS: [
						"small_year"
					]
				}
			});

			return expect(result).to.eventually.deep.equal([{
				small_year: 2008
			}]);
		});

		it("should return all that start with INPUT for INPUT*", async function () {
			const result = facade.performQuery({
				WHERE: {
					IS: {
						small_uuid: "5*"
					}
				},
				OPTIONS: {
					COLUMNS: [
						"small_uuid"
					]
				}
			});

			return expect(result).to.eventually.deep.equal([
				{small_uuid: "599"},
				{small_uuid: "5821"}
			]);
		});

		it("should return all that end with INPUT for *INPUT", async function () {
			const result = facade.performQuery({
				WHERE: {
					IS: {
						small_title: "*epid"
					}
				},
				OPTIONS: {
					COLUMNS: [
						"small_title"
					]
				}
			});

			return expect(result).to.eventually.deep.equal([
				{small_title: "cancer epid"},
				{small_title: "cancer epid"},
				{small_title: "cancer epid"}
			]);
		});

		it("should return all that contain INPUT for *INPUT*", async function () {
			const result = facade.performQuery({
				WHERE: {
					IS: {
						small_title: "*cancer epi*"
					}
				},
				OPTIONS: {
					COLUMNS: [
						"small_title"
					]
				}
			});

			return expect(result).to.eventually.deep.equal([
				{small_title: "cancer epid"},
				{small_title: "cancer epid"},
				{small_title: "cancer epid"}
			]);
		});

		it("should return the count of all that contain INPUT for *INPUT*", async function () {
			const result = facade.performQuery({
				WHERE: {
					IS: {
						small_title: "*cancer epi*"
					}
				},
				OPTIONS: {
					COLUMNS: [
						"small_title",
						"count"
					]
				},
				TRANSFORMATIONS: {
					GROUP: ["small_title"],
					APPLY: [{
						count: {
							COUNT: "small_title"
						}
					}]
				}
			});

			return expect(result).to.eventually.deep.equal([
				{small_title: "cancer epid", count: 3}
			]);
		});

		it("should return correct results for GT", async function () {
			const result = facade.performQuery({
				WHERE: {
					GT: {
						one_avg: 55
					}
				},
				OPTIONS: {
					COLUMNS: [
						"one_avg"
					]
				}
			});

			return expect(result).to.eventually.deep.equal([
				{one_avg: 60}
			]);
		});

		it("should return correct results for AND", async function () {
			const result = facade.performQuery({
				WHERE: {
					AND: [
						{
							GT: {
								one_avg: 55
							}
						},
						{
							IS: {
								one_dept: "test"
							}
						}
					]
				},
				OPTIONS: {
					COLUMNS: [
						"one_avg"
					]
				}
			});

			return expect(result).to.eventually.deep.equal([
				{one_avg: 60}
			]);
		});

		it("should return correct results for OR", async function () {
			const result = facade.performQuery({
				WHERE: {
					OR: [
						{
							GT: {
								one_avg: 55
							}
						},
						{
							IS: {
								one_dept: "test"
							}
						}
					]
				},
				OPTIONS: {
					COLUMNS: [
						"one_avg"
					]
				}
			});

			return expect(result).to.eventually.deep.equal([
				{one_avg: 60}
			]);
		});

		it("should return correct results for LT", async function () {
			const result = facade.performQuery({
				WHERE: {
					LT: {
						one_avg: 65
					}
				},
				OPTIONS: {
					COLUMNS: [
						"one_avg"
					]
				}
			});

			return expect(result).to.eventually.deep.equal([
				{one_avg: 60}
			]);
		});

		it("should return correct results for EQ", async function () {
			const result = facade.performQuery({
				WHERE: {
					EQ: {
						one_avg: 60
					}
				},
				OPTIONS: {
					COLUMNS: [
						"one_avg"
					]
				}
			});

			return expect(result).to.eventually.deep.equal([
				{one_avg: 60}
			]);
		});

		it("should return correct results for NOT", async function () {
			const result = facade.performQuery({
				WHERE: {
					NOT: {
						EQ: {
							one_avg: 59
						}
					}
				},
				OPTIONS: {
					COLUMNS: [
						"one_avg"
					]
				}
			});

			return expect(result).to.eventually.deep.equal([
				{one_avg: 60}
			]);
		});

		it("should have a functional ORDER function", async function () {
			const result = facade.performQuery({
				WHERE: {},
				OPTIONS: {
					COLUMNS: [
						"small_avg"
					],
					ORDER: "small_avg"
				}
			});

			return expect(result).to.eventually.deep.equal([
				{small_avg: 80.7},
				{small_avg: 82.8},
				{small_avg: 83.1}
			]);
		});

		it("should have a functional complex ORDER function", async function () {
			const result = facade.performQuery({
				WHERE: {},
				OPTIONS: {
					COLUMNS: [
						"small_avg"
					],
					ORDER: {
						dir: "DOWN",
						keys: ["small_avg"]
					}
				}
			});

			return expect(result).to.eventually.deep.equal([
				{small_avg: 83.1},
				{small_avg: 82.8},
				{small_avg: 80.7}
			]);
		});
	});

	describe("EBNF", function () {
		let ubc: string, one: string;

		before(function () {
			ubc = getContentFromArchives("small.zip");
			one = getContentFromArchives("one-course.zip");
		});

		beforeEach(async function () {
			clearDisk();
			facade = new InsightFacade();
			await facade.addDataset("ubc", ubc, InsightDatasetKind.Sections);
			await facade.addDataset("one", one, InsightDatasetKind.Sections);
		});

		it("should reject with an empty query", function () {
			const result = facade.performQuery({});

			return expect(result).to.eventually.be.rejectedWith(InsightError);
		});

		it("should reject with a query not containing WHERE", function () {
			const result = facade.performQuery({
				OPTIONS: {
					COLUMNS: [
						"ubc_dept",
						"ubc_avg"
					]
				}
			});

			return expect(result).to.eventually.be.rejectedWith(InsightError);
		});

		it("should reject a query not containing OPTIONS", function () {
			const result = facade.performQuery({
				WHERE: {}
			});

			return expect(result).to.eventually.be.rejectedWith(InsightError);
		});

		it("should only accept a valid FILTER", function () {
			const result = facade.performQuery({
				WHERE: {
					INVALIDFILTER: {}
				},
				OPTIONS: {
					COLUMNS: [
						"one_dept"
					]
				}
			});

			return expect(result).to.eventually.be.rejectedWith(InsightError);
		});

		it("should not accept an empty LOGICCOMPARISON", function () {
			const result = facade.performQuery({
				WHERE: {
					AND: []
				},
				OPTIONS: {
					COLUMNS: [
						"one_dept"
					]
				}
			});

			return expect(result).to.eventually.be.rejectedWith(InsightError);
		});

		it("should not accept an invalid FILTER in FILTERLIST", function () {
			const result = facade.performQuery({
				WHERE: {
					AND: [
						{InvalidFilter: {}}
					]
				},
				OPTIONS: {
					COLUMNS: [
						"one_dept"
					]
				}
			});

			return expect(result).to.eventually.be.rejectedWith(InsightError);
		});

		it("should only accept a number for an MCOMPARATOR", function () {
			const result = facade.performQuery({
				WHERE: {
					GT: {
						one_avg: "INVALID"
					}
				},
				OPTIONS: {
					COLUMNS: [
						"one_dept"
					]
				}
			});

			return expect(result).to.eventually.be.rejectedWith(InsightError);
		});

		it("should not accept an invalid mfield", function () {
			const result = facade.performQuery({
				WHERE: {
					GT: {
						one_invalid: 90
					}
				},
				OPTIONS: {
					COLUMNS: [
						"one_dept"
					]
				}
			});

			return expect(result).to.eventually.be.rejectedWith(InsightError);
		});


		it("should not accept an invalid mfield, even if it is a valid field", function () {
			const result = facade.performQuery({
				WHERE: {
					GT: {
						one_instructor: 90
					}
				},
				OPTIONS: {
					COLUMNS: [
						"one_dept"
					]
				}
			});

			return expect(result).to.eventually.be.rejectedWith(InsightError);
		});

		it("should not accept an empty SCOMPARISON", function () {
			const result = facade.performQuery({
				WHERE: {
					IS: {}
				},
				OPTIONS: {
					COLUMNS: [
						"one_dept"
					]
				}
			});

			return expect(result).to.eventually.be.rejectedWith(InsightError);
		});

		it("should not accept an invalid SCOMPARISON field", function () {
			const result = facade.performQuery({
				WHERE: {
					IS: {
						one_invalid: "math"
					}
				},
				OPTIONS: {
					COLUMNS: [
						"one_dept"
					]
				}
			});

			return expect(result).to.eventually.be.rejectedWith(InsightError);
		});

		it("should not accept an invalid SCOMPARISON key", function () {
			const result = facade.performQuery({
				WHERE: {
					IS: {
						one_invalid: 123
					}
				},
				OPTIONS: {
					COLUMNS: [
						"one_dept"
					]
				}
			});

			return expect(result).to.eventually.be.rejectedWith(InsightError);
		});

		it("should not accept an invalid wildcard string", function () {
			const result = facade.performQuery({
				WHERE: {
					IS: {
						one_uuid: "a*a"
					}
				},
				OPTIONS: {
					COLUMNS: [
						"one_dept"
					]
				}
			});

			return expect(result).to.eventually.be.rejectedWith(InsightError);
		});

		it("should format NEGATION correctly", function () {
			const result = facade.performQuery({
				WHERE: {
					NOT: {
						invalid: "invalid"
					}
				},
				OPTIONS: {
					COLUMNS: [
						"one_dept"
					]
				}
			});

			return expect(result).to.eventually.be.rejectedWith(InsightError);
		});

		it("should ensure that options must contain columns", function () {
			const result = facade.performQuery({
				WHERE: {},
				OPTIONS: {}
			});

			return expect(result).to.eventually.be.rejectedWith(InsightError);
		});

		it("should ensure that KEY_LIST must contain at least one key", function () {
			const result = facade.performQuery({
				WHERE: {},
				OPTIONS: {
					COLUMNS: []
				}
			});

			return expect(result).to.eventually.be.rejectedWith(InsightError);
		});
	});
});
