import { useEffect, useState } from "react";
import { PageHead } from "../../components/ui";
import type { RealResult as Result } from "./realData";
import RealDashboard from "./RealDashboard";
import RealDashboardEmpty from "./RealDashboardEmpty";
import { useApp } from "../../stores/app";
type Job = {
  status: string;
  progress: number;
  message?: string;
  error?: string;
  result?: Result;
};
export default function RealAnalysis() {
  const recordId = new URLSearchParams(window.location.search).get("record");
  const previous = useApp.getState().tasks.find((item) => item.id === recordId && item.kind === "神经元分析");
  const saved = previous?.config || {};
  const addTask = useApp((state) => state.addTask);
  const updateTask = useApp((state) => state.updateTask);
  const [directory, setDirectory] = useState(
    String(saved.directory || localStorage.getItem("nl-model-directory") || ""),
  );
  const [models, setModels] = useState<
    { path: string; name: string; layers: number; weights: boolean }[]
  >([]);
  const [model, setModel] = useState(String(saved.modelPath || ""));
  const [dataset, setDataset] = useState(String(saved.dataset || "mixed"));
  const [datasetNames, setDatasetNames] = useState({ benign: "良性请求", harmful: "风险请求" });
  const [count, setCount] = useState(Number(saved.count || 8)),
    [tokens, setTokens] = useState(Number(saved.tokens || 24)),
    [layer, setLayer] = useState(Number(saved.layer || 18));
  const [id, setId] = useState(previous?.runId || localStorage.getItem("nl-real-run") || "");
  const [job, setJob] = useState<Job | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function scan() {
    try {
      const response = await fetch(
        "/api/v1/models?path=" + encodeURIComponent(directory),
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const available = data.models.filter((m: { weights: boolean }) => m.weights);
      setModels(available);
      setDirectory(data.directory);
      localStorage.setItem("nl-model-directory", data.directory);
      setModel((current) => available.find((m: { path: string }) => m.path === current)?.path || available[0]?.path || "");
      setError(available.length ? "" : "此目录中没有可用于评测的完整模型");
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => {
    void scan();
  }, []);
  useEffect(() => {
    void fetch("/api/v1/datasets/config").then((response) => response.json()).then((data) => {
      if (data.roles) setDatasetNames({ benign: data.roles.analysisBenign?.title || "良性请求", harmful: data.roles.analysisHarmful?.title || "风险请求" });
    }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!id) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch("/api/v1/engine/runs/" + id);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (disposed) return;
        setJob(data);
        if (["complete", "failed", "cancelled"].includes(data.status)) updateTask(id, data.status === "complete" ? "已完成" : data.status === "cancelled" ? "已取消" : "失败");
        if (data.status === "running") timer = setTimeout(poll, 1000);
      } catch (e) {
        if (!disposed) setError(String(e));
      }
    }
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [id]);
  async function start() {
    if (!model || !models.some((item) => item.path === model)) {
      setError("请先扫描并选择可用于评测的模型");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v1/engine/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelPath: model,
          dataset,
          count,
          tokens,
          layer: layer - 1,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      localStorage.setItem("nl-real-run", data.id);
      addTask({ id: data.id, runId: data.id, kind: "神经元分析", name: `神经元分析 · ${model.split(/[\\/]/).pop() || "本地模型"}`, status: "运行中", date: new Date().toLocaleString("zh-CN"), createdAt: new Date().toISOString(), model: model.split(/[\\/]/).pop() || model, count, config: { directory, modelPath: model, dataset, count, tokens, layer } });
      setId(data.id);
      setJob({ status: "running", progress: 0 });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const result = job?.result;
  const running = busy || job?.status === "running";
  const configuration = (
    <div className="form-stack">
      <label>
        本地模型
        <select
          value={model}
          disabled={running}
          onChange={(e) => setModel(e.target.value)}
        >
          {models.map((m) => (
            <option key={m.path} value={m.path}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        数据集
        <select
          disabled={running}
          value={dataset}
          onChange={(e) => setDataset(e.target.value)}
        >
          <option value="mixed">{datasetNames.benign} + {datasetNames.harmful}</option>
          <option value="benign">{datasetNames.benign}</option>
          <option value="harmful">{datasetNames.harmful}</option>
        </select>
      </label>
      <label>
        样本数（2–32）
        <input
          type="number"
          min={2}
          max={32}
          value={count}
          disabled={running}
          onChange={(e) => setCount(Number(e.target.value))}
        />
      </label>
      <details>
        <summary>路径与生成参数</summary>
        <div className="form-stack">
          <label>
            模型文件夹
            <input
              value={directory}
              onChange={(e) => setDirectory(e.target.value)}
              disabled={running}
            />
          </label>
          <button
            className="btn"
            disabled={running}
            onClick={() => void scan()}
          >
            扫描模型
          </button>
          <label>
            生成 token 上限（1–128）
            <input
              type="number"
              min={1}
              max={128}
              value={tokens}
              disabled={running}
              onChange={(e) => setTokens(Number(e.target.value))}
            />
          </label>
          <label>
            初始观察层（所有层均采集）
            <input
              type="number"
              min={1}
              max={models.find((m) => m.path === model)?.layers || 30}
              value={layer}
              disabled={running}
              onChange={(e) => setLayer(Number(e.target.value))}
            />
          </label>
        </div>
      </details>
      <button
        className="btn primary"
        disabled={running || !model}
        onClick={() => void start()}
      >
        开始分析
      </button>
      {job?.status === "running" && (
        <button
          className="btn"
          onClick={async () => {
            await fetch("/api/v1/engine/runs/" + id, {
              method: "DELETE",
            });
            setJob({ status: "cancelled", progress: job.progress });
            updateTask(id, "已取消");
          }}
        >
          取消任务
        </button>
      )}
      <p className="field-note">
        贪心生成 · 最多 {tokens} token。对照组交替取样，单组取前 N
        条；小样本仅用于测试。
      </p>
    </div>
  );
  return (
    <>
      <PageHead
        eyebrow="MEASURED NINE-VIEW WORKSPACE"
        title="神经元分析 · 九视图"
        description="沿用九视图布局，展示实测神经元数据与 Qwen3Guard 自动判定。"
      />
      {error && (
        <div className="notice-banner" role="alert">
          {error}
        </div>
      )}
      {job && (
        <div className="notice-banner" role="status">
          {(
            {
              running: "运行中",
              complete: "已完成",
              failed: "失败",
              cancelled: "已取消",
            } as Record<string, string>
          )[job.status] || job.status}{" "}
          · {job.progress}% · {job.error || job.message || ""}
        </div>
      )}
      {result && result.schemaVersion >= 3 ? (
        <RealDashboard
          key={id}
          result={result}
          runId={id}
          configuration={configuration}
        />
      ) : (
        <RealDashboardEmpty configuration={configuration} legacy={Boolean(result)} />
      )}
    </>
  );
}
