import { useEffect, useState } from "react";
import { CheckCircle2, Database, FileText, FolderOpen, RefreshCw, Search, Settings2, XCircle } from "lucide-react";
import { Badge, Drawer } from "../../components/ui";

type RoleKey = "analysisBenign" | "analysisHarmful" | "apiSafety";
type Role = { title: string; path: string; promptColumn: string; categoryColumn?: string; note: string; status?: string; rows?: number; usable?: number; columns?: string[]; categories?: Record<string, number>; error?: string };
type DataFile = { path: string; name: string; format: string; bytes: number; rows: number; columns: string[]; group: string };
const roleOrder: RoleKey[] = ["analysisBenign", "analysisHarmful", "apiSafety"];
const roleLabels: Record<RoleKey, string> = { analysisBenign: "神经元分析 · 良性", analysisHarmful: "神经元分析 · 风险", apiSafety: "API 安全评测" };
const defaults: Record<RoleKey, Role> = {
  analysisBenign: { title: "良性行为样本", path: "data/JBB-Behaviors/benign-behaviors.csv", promptColumn: "Goal", categoryColumn: "Category", note: "神经元分析的良性请求；混合模式与风险样本交替取样。" },
  analysisHarmful: { title: "风险行为样本", path: "data/JBB-Behaviors/harmful-behaviors.csv", promptColumn: "Goal", categoryColumn: "Category", note: "神经元分析的风险请求。" },
  apiSafety: { title: "API 安全评测集", path: "data/JailBench/JailBench.csv", promptColumn: "query", categoryColumn: "一级领域", note: "API 评测按五个一级领域等量抽样。" },
};
const formatSize = (bytes: number) => bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.round(bytes / 1e3)} KB`;

export default function DatasetResources() {
  const [roles, setRoles] = useState<Record<RoleKey, Role> | null>(null);
  const [files, setFiles] = useState<DataFile[]>([]);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<RoleKey | null>(null);
  const [draft, setDraft] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch("/api/v1/datasets");
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "无法读取数据集");
      setRoles(data.roles); setFiles(data.files); setError("");
    } catch (issue) { setError(issue instanceof Error ? issue.message : "数据集服务不可用"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);
  function edit(role: RoleKey) { setEditing(role); setDraft({ ...roles![role] }); setError(""); }
  async function save() {
    if (!editing || !draft) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/v1/datasets/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: editing, config: { title: draft.title, path: draft.path, promptColumn: draft.promptColumn, categoryColumn: draft.categoryColumn || "", note: draft.note } }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "保存失败");
      setEditing(null); setDraft(null);
      await refresh();
    } catch (issue) { setError(issue instanceof Error ? issue.message : "配置保存失败"); }
    finally { setSaving(false); }
  }
  const selectedFile = files.find((item) => item.path.toLowerCase() === draft?.path.trim().replaceAll("\\", "/").toLowerCase());
  const visible = files.filter((item) => `${item.path} ${item.group}`.toLowerCase().includes(filter.trim().toLowerCase()));
  const totalRows = files.reduce((total, item) => total + item.rows, 0);
  return <div className="dataset-resources">
    <div className="resource-intro"><div><span className="eyebrow">DATASET INVENTORY</span><h2>项目数据集</h2><p>读取 data 目录中的真实文件；三项运行数据源可手动配置并用于后续任务。</p></div><button className="btn" onClick={() => void refresh()} disabled={loading}><RefreshCw size={15} />{loading ? "扫描中…" : "重新扫描"}</button></div>
    {error && !editing && <div className="notice-banner" role="alert"><XCircle size={16} />{error}</div>}
    <div className="dataset-summary"><div><strong>{files.length}</strong><span>本地数据文件</span></div><div><strong>{totalRows.toLocaleString("zh-CN")}</strong><span>合计记录 / 文本行</span></div><div><strong>{roleOrder.filter((key) => roles?.[key]?.status === "ready").length} / 3</strong><span>已连接数据源</span></div></div>
    <div className="dataset-section-title"><div><h3>当前参与计算</h3><p>路径和字段映射保存到 data/datasets.config.json；新任务读取保存时的配置快照。</p></div></div>
    <div className="dataset-role-grid">{roleOrder.map((key) => {
      const role = roles?.[key];
      return <article className="dataset-role-card" key={key}>
        <div className="dataset-role-top"><span className="dataset-role-icon"><Database size={18} /></span><Badge tone={role?.status === "ready" ? "green" : "amber"}>{role?.status === "ready" ? "已连接" : loading ? "检测中" : "需要检查"}</Badge></div>
        <small>{roleLabels[key]}</small><h3>{role?.title || defaults[key].title}</h3><p>{role?.note || defaults[key].note}</p>
        <div className="dataset-role-count"><strong>{typeof role?.usable === "number" ? role.usable.toLocaleString("zh-CN") : "—"}</strong><span>有效问题 / 共 {role?.rows?.toLocaleString("zh-CN") || "—"} 条</span></div>
        <div className="dataset-role-detail"><span>文件路径</span><code>{role?.path || defaults[key].path}</code></div>
        <div className="dataset-role-detail"><span>字段映射</span><strong>{role?.promptColumn || "—"}{role?.categoryColumn ? ` · ${role.categoryColumn}` : ""}</strong></div>
        {key === "apiSafety" && role?.categories && <div className="dataset-categories">{Object.entries(role.categories).map(([name, count]) => <span key={name}>{name} <b>{count}</b></span>)}</div>}
        {role?.error && <div className="dataset-role-error">{role.error}</div>}
        <button className="btn dataset-edit" disabled={!roles} onClick={() => edit(key)}><Settings2 size={14} />手动修改配置</button>
      </article>;
    })}</div>
    <div className="dataset-section-title"><div><h3>文件清单</h3><p>其余文件保留在项目中，可在上方配置为兼容数据源；未配置的文件不会自动进入评测。</p></div><label className="dataset-search"><Search size={15} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="搜索文件或类别" /></label></div>
    <div className="dataset-file-table"><div className="dataset-file-head"><span>文件</span><span>类别</span><span>记录</span><span>大小 / 格式</span><span>用途</span></div>{visible.map((file) => { const assigned = roleOrder.filter((key) => roles?.[key]?.path === file.path); return <div className="dataset-file-row" key={file.path}><div><FileText size={16} /><span><strong>{file.name}</strong><code>{file.path}</code></span></div><span>{file.group}</span><strong>{file.rows.toLocaleString("zh-CN")}</strong><span>{formatSize(file.bytes)} · {file.format}</span><span>{assigned.length ? assigned.map((key) => roleLabels[key]).join("、") : "已迁移 · 未接入"}</span></div>; })}{!loading && visible.length === 0 && <p className="dataset-empty">没有匹配的文件。</p>}</div>
    {editing && draft && <Drawer title={`配置 · ${roleLabels[editing]}`} onClose={() => { setEditing(null); setError(""); }}>
      <p className="field-note">选择 data 目录下的 CSV，填写实际字段名。保存前会检查文件、问题数量和分类；原始数据不会被修改。</p>
      {error && <div className="notice-banner" role="alert"><XCircle size={16} />{error}</div>}
      <div className="form-stack spacious dataset-config-form">
        <label>显示名称<input value={draft.title} maxLength={50} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label>CSV 相对路径<input value={draft.path} list="dataset-csv-options" onChange={(event) => setDraft({ ...draft, path: event.target.value })} /><datalist id="dataset-csv-options">{files.filter((file) => file.format === "CSV").map((file) => <option key={file.path} value={file.path} />)}</datalist></label>
        {selectedFile && <div className="dataset-field-hint"><FolderOpen size={14} />{selectedFile.rows.toLocaleString("zh-CN")} 条 · 可用字段：{selectedFile.columns.join("、")}</div>}
        <div className="dataset-fields"><label>问题字段<input value={draft.promptColumn} onChange={(event) => setDraft({ ...draft, promptColumn: event.target.value })} /></label><label>分类字段{editing !== "apiSafety" && <small>可留空</small>}<input value={draft.categoryColumn || ""} onChange={(event) => setDraft({ ...draft, categoryColumn: event.target.value })} /></label></div>
        <label>用途说明<textarea rows={3} value={draft.note} maxLength={300} onChange={(event) => setDraft({ ...draft, note: event.target.value })} /></label>
      </div>
      <div className="dataset-drawer-actions"><button className="btn subtle" onClick={() => setDraft({ ...defaults[editing] })}>恢复默认值</button><button className="btn primary" disabled={saving} onClick={() => void save()}>{saving ? "校验并保存中…" : <><CheckCircle2 size={15} />校验并保存</>}</button></div>
    </Drawer>}
  </div>;
}
