import { describe, expect, it } from "vitest";
import { loadVault, parseLegacyVault, parseVault, saveVault, VAULT_KEY } from "./vault";

describe("saved key-value collections", () => {
  it("loads named collections with their mappings", () => {
    const data = [{ id: "one", name: "会议纪要", created: "2026-11-09", mapping: { "<姓名-1>": "张明" } }];
    expect(parseVault(JSON.stringify(data))).toEqual(data);
  });
  it("imports the old project's collection format", () => {
    const old = { collections: [{ id: "old", name: "旧集合", created: "2025-01-01", pairs: [{ key: "姓名-1", value: "李雷" }] }] };
    expect(parseLegacyVault(JSON.stringify(old))[0].mapping).toEqual({ "<姓名-1>": "李雷" });
  });
  it("ignores malformed or empty data", () => {
    expect(parseVault("broken")).toEqual([]);
    expect(parseVault(JSON.stringify([{ id: "x", name: "空", mapping: {} }]))).toEqual([]);
  });
  it("persists mappings and loads them after a new page session", () => {
    const previous = globalThis.localStorage;
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } });
    try {
      const collections = [{ id: "saved", name: "会话", created: "2026-11-09", mapping: { "<地址-1>": "北京市海淀区" } }];
      saveVault(collections);
      expect(values.has(VAULT_KEY)).toBe(true);
      expect(loadVault()).toEqual(collections);
    } finally { Object.defineProperty(globalThis, "localStorage", { configurable: true, value: previous }); }
  });
});
