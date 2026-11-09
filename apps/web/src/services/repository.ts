import { models, samplesFor, type Version, type Sample } from "../data/demo";
export interface RunResult {
  schemaVersion: 1;
  source: "demo" | "computed";
  runId: string;
  modelId: string;
  samples: Sample[];
  availability: "ready" | "missing";
}
export interface NeuroLensRepository {
  getRun(
    model: string,
    version: Version,
    signal?: AbortSignal,
  ): Promise<RunResult>;
}
export class DemoRepository implements NeuroLensRepository {
  async getRun(
    model: string,
    version: Version,
    signal?: AbortSignal,
  ): Promise<RunResult> {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    if (!models.some((m) => m.id === model)) throw new Error("找不到模型");
    return {
      schemaVersion: 1,
      source: "demo",
      runId: `demo-${model}-${version}`,
      modelId: model,
      samples: samplesFor(model, version),
      availability: "ready",
    };
  }
}
export class HttpRepository implements NeuroLensRepository {
  constructor(private base = "/api/v1") {}
  async getRun(
    model: string,
    version: Version,
    signal?: AbortSignal,
  ): Promise<RunResult> {
    const response = await fetch(
      `${this.base}/runs/${encodeURIComponent(model + "-" + version)}`,
      { signal },
    );
    if (!response.ok) throw new Error(`实验数据不可用 (${response.status})`);
    const data = await response.json();
    if (
      data.schemaVersion !== 1 ||
      data.modelId !== model ||
      data.source !== "computed" ||
      !Array.isArray(data.samples)
    )
      throw new Error("实验数据格式或来源不匹配");
    return data;
  }
}
export const repository: NeuroLensRepository = new DemoRepository();
export function download(
  name: string,
  data: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportSamples(
  rows: Sample[],
  context: Record<string, unknown>,
) {
  download(
    "NeuroLens-demo-results.json",
    JSON.stringify(
      {
        source: "demo",
        exportedAt: new Date().toISOString(),
        ...context,
        samples: rows,
      },
      null,
      2,
    ),
  );
}
