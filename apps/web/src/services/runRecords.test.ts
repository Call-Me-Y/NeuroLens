import { describe, expect, it } from "vitest";
import { persistRecords, readRecords, recordUrl, type RunRecord } from "./runRecords";

describe("local run records", () => {
  it("saves metadata and links back to the matching workspace", () => {
    const previous = globalThis.localStorage;
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } });
    try {
      const record: RunRecord = { id: "run-1", runId: "run-1", kind: "API 安全评测", name: "API 评测", status: "已完成", date: "2026-11-09", model: "test", count: 5, config: { endpoint: "https://example.com/v1", model: "test", perCategory: 1 } };
      persistRecords([record]);
      expect(readRecords()).toEqual([record]);
      expect(recordUrl(record)).toBe("/api-safety?record=run-1");
      expect(values.values().next().value).not.toContain("apiKey");
    } finally { Object.defineProperty(globalThis, "localStorage", { configurable: true, value: previous }); }
  });
});
