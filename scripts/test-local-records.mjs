import assert from "node:assert/strict";
import path from "node:path";
import { localRecordsRequest } from "./local-records-service.mjs";

let status, output;
const response = { writeHead(code) { status = code; }, end(value) { output = value; } };
const handled = await localRecordsRequest({ url: "/api/v1/records", method: "GET", headers: { host: "127.0.0.1:4173" } }, response, path.resolve(import.meta.dirname, ".."));
assert.equal(handled, true);
assert.equal(status, 200);
const data = JSON.parse(output);
assert.ok(Array.isArray(data.records));
assert.ok(data.records.every((item) => item.runId === item.id && item.config && item.status === "已完成"));
assert.equal(JSON.stringify(data).includes("apiKey"), false);
console.log(JSON.stringify({ imported: data.records.length, kinds: [...new Set(data.records.map((item) => item.kind))] }));
