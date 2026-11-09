import { describe, it, expect } from "vitest";
import { redact, restore, detectEntities } from "./redact";
describe("local privacy transformations", () => {
  it("round trips repeated values and preserves surrounding text", () => {
    const input = "联系13800138000，重复13800138000；邮箱a@example.com";
    const r = redact(input, ["电话", "邮箱"], "");
    expect(r.matches).toHaveLength(3);
    expect(Object.keys(r.mapping)).toHaveLength(2);
    expect(r.text).not.toContain("13800138000");
    expect(restore(r.text, r.mapping)).toBe(input);
  });
  it("handles overlaps without suppressing later non-overlapping matches", () => {
    const r = redact("abcdefghij", ["自定义"], "abcd\ncdefgh\nfgh");
    expect(r.matches.map((x) => x.value)).toEqual(["abcd", "fgh"]);
    expect(restore(r.text, r.mapping)).toBe("abcdefghij");
  });
  it("protects literal existing placeholders", () => {
    const input = "<电话-1> 13800138000";
    const r = redact(input, ["电话"], "");
    expect(r.text).toBe("<电话-1> <电话-2>");
    expect(restore(r.text, r.mapping)).toBe(input);
  });
  it("respects disabled rules and handles identity numbers before phone substrings", () => {
    expect(redact("13800138000", [], "").text).toBe("13800138000");
    const r = redact("11010119900307123X", ["身份证", "电话"], "");
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].type).toBe("身份证");
  });
  it("prefers longest match sharing a start and restores in one pass", () => {
    const r = redact("示例公司项目", ["自定义"], "示例\n示例公司");
    expect(r.matches[0].value).toBe("示例公司");
    expect(
      restore("<电话-1>", { "<电话-1>": "<邮箱-1>", "<邮箱-1>": "secret" }),
    ).toBe("<邮箱-1>");
  });
  it("combines local NER with rules and restores the original text", () => {
    const input = "张明住在北京市海淀区，电话13800138000";
    const r = redact(input, ["姓名", "地址", "电话"], "", [
      { start: 0, end: 2, label: "PER", type: "姓名", text: "张明" },
      { start: 4, end: 10, label: "ADDR", type: "地址", text: "北京市海淀区" },
    ]);
    expect(r.text).toContain("<姓名-1>");
    expect(r.text).toContain("<地址-1>");
    expect(r.text).toContain("<电话-1>");
    expect(restore(r.text, r.mapping)).toBe(input);
  });
  it("converts model code point offsets to browser string offsets", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ entities: [{ start: 1, end: 3, label: "PER", type: "姓名", text: "张明" }] }), { headers: { "Content-Type": "application/json" } });
    try {
      const found = await detectEntities("😀张明");
      expect(found[0]).toMatchObject({ start: 2, end: 4, text: "张明" });
    } finally { globalThis.fetch = original; }
  });
  it("restores saved and legacy placeholders without replacing new text recursively", () => {
    const map = { "<姓名-1>": "张明", "<邮箱-1>": "<姓名-1>" };
    expect(restore("«姓名-1» / <邮箱-1>", map)).toBe("张明 / <姓名-1>");
    expect(restore("-----BEGIN NL-DESENS-MAP-----\n旧映射\n-----END NL-DESENS-MAP-----\n<姓名-1>", map)).toBe("张明");
  });
});
