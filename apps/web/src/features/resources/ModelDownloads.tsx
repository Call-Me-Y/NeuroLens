import { useEffect, useState } from "react";
import { CheckCircle2, Download, ExternalLink, FolderOpen, RefreshCw, XCircle } from "lucide-react";
import { Panel, Badge } from "../../components/ui";

type Model = { id: string; name: string; directory: string; source: string; size: number; files: number; missing: string[]; installed: boolean };
type Job = { id: string; model: string; status: string; progress: number; bytes: number; message: string; error?: string; detail?: string };
const descriptions: Record<string, string> = {
  smol: "神经元分析的轻量测试模型，支持本地生成和逐层测量。",
  guard: "安全判定裁判，用于神经元分析与 API 安全评测。",
  ner: "姓名和地址识别模型，用于提示词脱敏；权重存储在 GitHub LFS。",
};
const sizeLabel = (bytes: number) => bytes >= 1e9 ? `${(bytes / 1e9).toFixed(2)} GB` : `${Math.round(bytes / 1e6)} MB`;

export default function ModelDownloads() {
  const [models, setModels] = useState<Model[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function refresh() {
    try {
      const response = await fetch("/api/v1/model-downloads");
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "读取模型状态失败");
      setModels(data.models);
      setJob(data.job);
      setError("");
    } catch (issue) { setError(issue instanceof Error ? issue.message : "模型服务不可用"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    if (job?.status !== "running") return;
    const timer = setInterval(() => { void refresh(); }, 1200);
    return () => clearInterval(timer);
  }, [job?.status]);
  async function begin(id: string) {
    setError("");
    try {
      const response = await fetch(`/api/v1/model-downloads/${id}`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "启动下载失败");
      setJob({ id: data.id, model: id, status: "running", progress: 0, bytes: 0, message: "准备下载" });
      void refresh();
    } catch (issue) { setError(issue instanceof Error ? issue.message : "下载失败"); }
  }
  async function cancel() { await fetch("/api/v1/model-downloads/current", { method: "DELETE" }); await refresh(); }
  return (
    <div className="resource-downloads">
      <div className="resource-intro">
        <div><span className="eyebrow">LOCAL MODEL LIBRARY</span><h2>手动模型下载</h2><p>从模型原始来源下载完整配置、分词器和权重到项目目录；已有文件会跳过。</p></div>
        <button className="btn" onClick={() => void refresh()} disabled={loading}><RefreshCw size={15} />重新检测</button>
      </div>
      {error && <div className="notice-banner" role="alert"><XCircle size={17} />{error}</div>}
      {job && job.status !== "idle" && (
        <div className={`resource-job ${job.status}`} role="status">
          <div><strong>{job.status === "complete" ? "下载完成" : job.status === "failed" ? "下载失败" : job.status === "cancelled" ? "已取消下载" : job.message}</strong><span>{job.error || job.detail || `${job.progress}%`}</span></div>
          {job.status === "running" && <button className="btn subtle" onClick={() => void cancel()}>取消下载</button>}
          <div className="resource-progress"><span style={{ width: `${job.progress}%` }} /></div>
        </div>
      )}
      <div className="resource-model-grid">
        {models.map((model) => (
          <Panel key={model.id} className="download-model-card" title={model.name} tag={model.id === "smol" ? "评测对象" : model.id === "guard" ? "安全裁判" : "脱敏识别"}>
            <p className="download-model-desc">{descriptions[model.id]}</p>
            <div className="download-model-meta"><span>权重大小</span><strong>{sizeLabel(model.size)}</strong></div>
            <div className="download-model-meta"><span>完整文件</span><strong>{model.files} 项</strong></div>
            <div className="download-model-path"><FolderOpen size={15} /><code>{model.directory}</code></div>
            <div className="download-model-status">
              {model.installed ? <Badge tone="green"><CheckCircle2 size={13} /> 已就绪</Badge> : <Badge tone="amber">缺少 {model.missing.length} 项文件</Badge>}
              <a href={model.source} target="_blank" rel="noreferrer">{model.id === "ner" ? "查看 GitHub LFS" : "查看 Hugging Face"}<ExternalLink size={13} /></a>
            </div>
            {!model.installed && <small className="download-missing">待获取：{model.missing.join("、")}</small>}
            <button className="btn primary download-model-action" disabled={model.installed || job?.status === "running"} onClick={() => void begin(model.id)}>
              {model.installed ? <CheckCircle2 size={15} /> : <Download size={15} />}{model.installed ? "本地文件已齐全" : `下载到 ${model.id === "smol" ? "test" : "models"}`}
            </button>
          </Panel>
        ))}
      </div>
      <p className="field-note">NER 下载使用 Git LFS 和 GitHub SSH 权限。模型来源仓库若为私有仓库，需要先在本机配置该仓库的访问权限。</p>
    </div>
  );
}
