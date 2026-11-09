import { describe, it, expect } from "vitest";
import {
  samplesFor,
  metrics,
  methods,
  quadrants,
  layerStats,
  models,
} from "./demo";
describe("coherent demonstration experiments", () => {
  it("reproduces records and keeps stable sample IDs between versions", () => {
    const a = samplesFor("qwen", "baseline");
    expect(a).toEqual(samplesFor("qwen", "baseline"));
    expect(a.map((s) => s.id)).toEqual(
      samplesFor("qwen", "tsft").map((s) => s.id),
    );
    expect(new Set(a.map((s) => s.id)).size).toBe(600);
  });
  it("uses exactly the sample denominator and preserves subgroup totals", () => {
    const rows = samplesFor("qwen", "baseline");
    const m = metrics(rows);
    expect(m.safe + m.partial + m.success).toBe(m.total);
    expect(m.asr).toBe(m.success / 600);
    expect(
      methods.map(
        (method) => metrics(rows.filter((s) => s.method === method)).total,
      ),
    ).toEqual([150, 150, 150, 150]);
    expect(metrics([]).asr).toBe(0);
  });
  it("keeps neuron associations and sankey flow consistent", () => {
    const rows = samplesFor("qwen", "baseline");
    for (const r of rows) expect(r.quadrant).toBe(quadrants[r.neuron % 4]);
    for (const q of quadrants) {
      const incoming = methods.reduce(
        (s, m) =>
          s + rows.filter((r) => r.method === m && r.quadrant === q).length,
        0,
      );
      const outgoing = ["安全", "部分风险", "攻击成功"].reduce(
        (s, o) =>
          s + rows.filter((r) => r.outcome === o && r.quadrant === q).length,
        0,
      );
      expect(incoming).toBe(outgoing);
    }
    expect(
      new Set(rows.filter((r) => r.method === "GCG").map((r) => r.quadrant))
        .size,
    ).toBe(4);
  });
  it("respects model layer count and marks missing groups", () => {
    for (const model of models) {
      const stats = layerStats(samplesFor(model.id, "baseline"), model.layers);
      expect(stats).toHaveLength(model.layers);
      for (const s of stats) {
        expect(s.safe!.low).toBeLessThanOrEqual(s.safe!.high);
      }
    }
    expect(
      layerStats([], 24).every((s) => s.safe === null && s.success === null),
    ).toBe(true);
  });
});
