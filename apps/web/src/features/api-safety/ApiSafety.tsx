import { useEffect, useState } from "react";
import { Play, Download, KeyRound, Square } from "lucide-react";
import { PageHead, Panel, Badge, Stat, Drawer, HelpLink, Empty } from "../../components/ui";
import { Chart, grid, axis } from "../../components/Chart";
import { download } from "../../services/repository";
import { useApp } from "../../stores/app";

type Sample = { id: string; prompt: string; output: string; category: string; subcategory: string; latency: number; error: string | null; judgment: string; automaticJudgment: { rawLabel: string | null; categories: string[]; refusal: boolean | null; rawText: string; reason: string } };
type Result = { source: string; schemaVersion?: number; provider: string; endpoint: string; model: string; judgeModel: string; dataset?: { sampling?: { perCategory: number } }; samples: Sample[] };
type Job = { status: string; progress: number; message?: string; error?: string; result?: Result };
const labels = ["未判定", "正确拒绝", "安全", "存疑", "不安全"];
const colors = ["#c1ccd9", "#69a991", "#83b5a4", "#d5b774", "#d28c76"];
export default function ApiSafety() {
  const recordId = new URLSearchParams(window.location.search).get("record");
  const previous = useApp.getState().tasks.find((item) => item.id === recordId && item.kind === "API 安全评测");
  const saved = previous?.config || {};
  const addTask = useApp((state) => state.addTask), updateTask = useApp((state) => state.updateTask);
  const [provider, setProvider] = useState(String(saved.provider || "OpenAI 兼容接口")), [model, setModel] = useState(String(saved.model || "")), [endpoint, setEndpoint] = useState(String(saved.endpoint || "")), [apiKey, setApiKey] = useState("");
  const [perCategory, setPerCategory] = useState(Number(saved.perCategory || 2)), [validated, setValidated] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [datasetName, setDatasetName] = useState("JailBench 问题");
  const [id, setId] = useState(() => previous?.runId || localStorage.getItem("nl-api-safety-run") || ""), [job, setJob] = useState<Job | null>(null);
  const [filter, setFilter] = useState("全部"), [page, setPage] = useState(1), [selected, setSelected] = useState<Sample | null>(null);
  useEffect(() => { void fetch("/api/v1/datasets/config").then((response) => response.json()).then((data) => { if (data.roles?.apiSafety?.title) setDatasetName(data.roles.apiSafety.title); }).catch(() => {}); }, []);
  useEffect(() => { if (!id) return; let closed = false; let timer: ReturnType<typeof setTimeout>; async function poll() { try { const response = await fetch("/api/v1/api-safety/runs/" + id); const data = await response.json(); if (!response.ok) throw Error(data.error); if (!closed) { setJob(data); if (["complete", "failed", "cancelled"].includes(data.status)) updateTask(id, data.status === "complete" ? "已完成" : data.status === "cancelled" ? "已取消" : "失败"); if (data.status === "running") timer = setTimeout(poll, 1000); } } catch (e) { if (!closed) setError(String(e)); } } poll(); return () => { closed = true; clearTimeout(timer); }; }, [id]);
  const result = job?.result, rows = result?.samples || [], totals = labels.map((label) => rows.filter((row) => row.judgment === label).length);
  const valid = rows.length - totals[0], categories = [...new Set(rows.map((row) => row.category).filter(Boolean))].slice(0, 12);
  const filtered = rows.filter((row) => filter === "全部" || row.judgment === filter), pages = Math.max(1, Math.ceil(filtered.length / 12)), currentPage = Math.min(page, pages);
  async function post(route: string) { setBusy(true); setError(""); try { const response = await fetch("/api/v1/api-safety/" + route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, model, endpoint, apiKey, perCategory }) }); const data = await response.json(); if (!response.ok) throw Error(data.error || "请求失败"); return data; } catch (e) { setError(String(e)); return null; } finally { setBusy(false); } }
  return <>
    <PageHead eyebrow="API SAFETY EVALUATION" title="API 安全评测" description={`服务商接口 · ${datasetName} · 本地 Qwen3Guard 裁判`} action={<HelpLink slug="api-safety" />} />
    {error && <div className="notice-banner" role="alert">{error}</div>}
    <div className="tool-layout">
      <Panel title="评测配置" subtitle="验证接口 → 选择样本 → 开始评测"><div className="form-stack spacious">
        <label>服务商<select value={provider} onChange={(e) => { setProvider(e.target.value); setValidated(false); }}>{["OpenAI 兼容接口", "通义千问", "DeepSeek", "自定义服务"].map((name) => <option key={name}>{name}</option>)}</select></label>
        <label>接口地址<input type="url" value={endpoint} onChange={(e) => { setEndpoint(e.target.value); setValidated(false); }} placeholder="https://api.example.com/v1" /></label>
        <label>模型名称<input value={model} onChange={(e) => { setModel(e.target.value); setValidated(false); }} placeholder="服务商模型 ID" /></label>
        <label>API 密钥<input type="password" value={apiKey} onChange={(e) => { setApiKey(e.target.value); setValidated(false); }} autoComplete="off" placeholder="仅用于当前请求" /></label>
        <p className="field-note">支持 /v1 基址或完整 /chat/completions 地址。验证会向接口发送一条简短请求；评测按样本逐条调用。密钥不会写入结果文件。</p>
        <label>评测集<select><option>JailBench · 原项目完整数据（10800 条）</option></select></label>
        <label>每个一级领域抽样数<select value={perCategory} disabled={job?.status === "running"} onChange={(e) => setPerCategory(Number(e.target.value))}>{[1, 2, 5, 10, 20].map((n) => <option key={n} value={n}>每类 {n} 条 · 共 {n * 5} 条</option>)}</select></label>
        <p className="field-note">从 5 个一级领域等量抽样，分散选取并交错发送。</p>
        <button className="btn full" disabled={busy || job?.status === "running"} onClick={async () => setValidated(Boolean(await post("validate")))}><KeyRound size={15} />{validated ? "连接已验证" : "验证连接"}</button>
        <button className="btn primary full" disabled={!validated || busy || job?.status === "running"} onClick={async () => { const data = await post("runs"); if (data?.id) { localStorage.setItem("nl-api-safety-run", data.id); addTask({ id: data.id, runId: data.id, kind: "API 安全评测", name: `API 评测 · ${model}`, status: "运行中", date: new Date().toLocaleString("zh-CN"), createdAt: new Date().toISOString(), model, count: perCategory * 5, config: { provider, endpoint, model, perCategory } }); setId(data.id); setJob({ status: "running", progress: 0 }); setFilter("全部"); } }}><Play size={15} />开始评测</button>
        {job?.status === "running" && <button className="btn full" onClick={async () => { await fetch("/api/v1/api-safety/runs/" + id, { method: "DELETE" }); setJob({ status: "cancelled", progress: job.progress }); updateTask(id, "已取消"); }}><Square size={14} />取消评测</button>}
        <Badge tone="neutral">{provider}</Badge>
      </div></Panel>
      <div className="tool-results">
        <div className="stats-grid three"><Stat label="不安全回复比例" value={valid ? (totals[4] / valid * 100).toFixed(1) + "%" : "—"} detail={`${totals[4]} / ${valid} 条有效判定`} /><Stat label="已请求样本" value={String(rows.length)} detail={`失败 ${rows.filter((row) => row.error).length} 条 · 每类 ${result?.dataset?.sampling?.perCategory ?? perCategory} 条`} /><Stat label="安全响应比例" value={valid ? ((totals[1] + totals[2]) / valid * 100).toFixed(1) + "%" : "—"} detail={`正确拒绝 ${totals[1]} + 安全 ${totals[2]} / ${valid}`} /></div>
        {result && (result.schemaVersion || 1) < 2 && <div className="notice-banner" role="status">这是旧口径的评测结果。请重新运行，以应用正确拒绝判定和五类等量抽样。</div>}
        {job && <div className="notice-banner" role="status">{({ running: "运行中", complete: "已完成", failed: "失败", cancelled: "已取消" } as Record<string, string>)[job.status] || job.status} · {job.progress}% · {job.error || job.message || ""}</div>}
        <div className="two-col">
          <Panel title="判定分布" subtitle="Qwen3Guard · 模型回复"><Chart height={255} option={{ tooltip: { trigger: "item", formatter: "{b}: {c}（{d}%）" }, legend: { bottom: 0 }, series: [{ type: "pie", radius: ["55%", "76%"], center: ["50%", "43%"], label: { show: false }, data: labels.map((name, i) => ({ name, value: totals[i], itemStyle: { color: colors[i] } })) }] }} /></Panel>
          <Panel title="风险类别" subtitle="JailBench 一级领域 · 不安全回复数"><Chart height={255} option={{ grid: { ...grid, left: 80, top: 12, bottom: 25 }, tooltip: { trigger: "axis" }, xAxis: { ...axis, type: "value" }, yAxis: { ...axis, type: "category", data: categories }, series: [{ type: "bar", barWidth: 10, itemStyle: { color: "#d28c76" }, data: categories.map((category) => rows.filter((row) => row.category === category && row.judgment === "不安全").length) }] }} /></Panel>
        </div>
        <Panel title="样本响应明细" subtitle="真实请求、完整回复与裁判标签" actions={<button className="btn subtle" disabled={!result} onClick={() => result && download("NeuroLens-api-" + id + ".json", JSON.stringify(result, null, 2))}><Download size={14} />导出结果</button>}>
          <div className="tabs">{["全部", ...labels].map((label) => <button key={label} className={filter === label ? "active" : ""} onClick={() => { setFilter(label); setPage(1); }}>{label}</button>)}</div>
          <div className="table-scroll api-table"><table><thead><tr><th>编号</th><th>领域</th><th>判定</th><th>耗时</th><th>状态</th><th>详情</th></tr></thead><tbody>{filtered.slice((currentPage - 1) * 12, currentPage * 12).map((row) => <tr key={row.id}><td className="mono">{row.id}</td><td>{row.category}</td><td><Badge tone={["安全", "正确拒绝"].includes(row.judgment) ? "green" : row.judgment === "不安全" ? "orange" : "amber"}>{row.judgment}</Badge></td><td className="mono">{row.latency}ms</td><td>{row.error ? "请求失败" : "已返回"}</td><td><button className="table-link" onClick={() => setSelected(row)}>查看响应 ↗</button></td></tr>)}</tbody></table>{!filtered.length && <Empty title="暂无评测结果" description="配置接口并运行后显示样本。" />}</div>
          <div className="pagination"><span>共 {filtered.length} 条 · 每页 12 条</span><button className="btn subtle" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>上一页</button><span>{currentPage} / {pages}</span><button className="btn subtle" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>下一页</button></div>
        </Panel>
      </div>
    </div>
    {selected && <Drawer title={selected.id + " · 评测响应"} onClose={() => setSelected(null)}><Badge>{selected.category} / {selected.subcategory}</Badge><h4>评测输入</h4><p className="quote-box">{selected.prompt}</p><h4>模型完整回复</h4><p className="quote-box">{selected.output || "（无回复）"}</p><h4>自动判定</h4><p>{selected.judgment} · {selected.automaticJudgment?.rawLabel || "无原始标签"} · {selected.automaticJudgment?.categories?.join("、") || "无风险类别"}</p>{selected.error && <p className="notice-banner" role="alert">{selected.error}</p>}<p className="field-note">成功返回的空回复和拒绝响应计入正确拒绝；请求失败仍为未判定。</p></Drawer>}
  </>;
}
