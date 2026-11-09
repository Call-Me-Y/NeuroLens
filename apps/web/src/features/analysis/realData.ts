export type Review = "未判定" | "安全" | "部分风险" | "攻击成功";
export type RealSample = {
  id: string;
  group: "benign" | "harmful";
  prompt: string;
  output: string;
  category: string;
  loss: number;
  latency: number;
  inputTokens: number;
  generatedTokens: number;
  truncatedInput: boolean;
  truncatedOutput?: boolean;
  automaticJudgment?: { label: "安全" | "存疑" | "不安全" | "未判定"; reason: string; method: string; rawLabel?: string | null; categories?: string[]; refusal?: boolean | null; rawText?: string };
};
export type Neuron = {
  id: number;
  activation: number;
  sensitivity: number;
  weightNorm: number;
};
export type LayerMeasurements = {
  neurons: Neuron[];
  activations: number[][];
  sensitivities: number[][];
  dominant: number[];
};
export type RealResult = {
  source: "computed";
  schemaVersion: number;
  model: string;
  layer: number;
  layers: number;
  intermediate: number;
  method: string;
  samples: RealSample[];
  projection: number[][][];
  hiddenNorms: number[][];
  semanticProjection?: number[][];
  similarity: (number | null)[][];
  measurements: LayerMeasurements[];
};
export type Reviews = Record<
  string,
  { label: Review; at: string; source: "manual" }
>;
export const cohort = (s: RealSample) =>
  s.group === "harmful" ? "风险请求" : "良性请求";
export function reviewStats(rows: RealSample[], reviews: Reviews) {
  const harmful = rows.filter((s) => s.group === "harmful");
  const rated = harmful.filter(
    (s) => reviews[s.id] && reviews[s.id].label !== "未判定",
  );
  const success = rated.filter(
    (s) => reviews[s.id].label === "攻击成功",
  ).length;
  return {
    eligible: harmful.length,
    rated: rated.length,
    success,
    asr: rated.length ? success / rated.length : null,
  };
}
export function quantile(values: number[], q: number) {
  if (!values.length) return null;
  const a = [...values].sort((x, y) => x - y),
    pos = (a.length - 1) * q,
    low = Math.floor(pos);
  return a[low] + (a[Math.ceil(pos)] - a[low]) * (pos - low);
}
export function correlation(a: number[], b: number[]) {
  if (a.length < 6 || a.length !== b.length) return null;
  const ma = a.reduce((x, y) => x + y, 0) / a.length,
    mb = b.reduce((x, y) => x + y, 0) / b.length;
  let aa = 0,
    bb = 0,
    ab = 0;
  for (let i = 0; i < a.length; i++) {
    aa += (a[i] - ma) ** 2;
    bb += (b[i] - mb) ** 2;
    ab += (a[i] - ma) * (b[i] - mb);
  }
  return aa * bb > 1e-20 ? ab / Math.sqrt(aa * bb) : null;
}
export function lineage(
  rows: RealSample[],
  measurement: LayerMeasurements,
  all: RealSample[],
  reviews: Record<string, { label: string }>,
) {
  const counts = new Map<
    string,
    { source: string; target: string; value: number }
  >();
  const add = (source: string, target: string) => {
    const key = source + "|" + target;
    counts.set(key, {
      source,
      target,
      value: (counts.get(key)?.value || 0) + 1,
    });
  };
  for (const s of rows) {
    const i = all.findIndex((a) => a.id === s.id),
      neuron = "N" + measurement.dominant[i];
    add(cohort(s), neuron);
    add(neuron, reviews[s.id]?.label || "未判定");
  }
  const links = [...counts.values()];
  return {
    nodes: [...new Set(links.flatMap((l) => [l.source, l.target]))].map(
      (name) => ({ name }),
    ),
    links,
  };
}
