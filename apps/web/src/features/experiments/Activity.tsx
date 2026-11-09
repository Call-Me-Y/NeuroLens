import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Search, Download, ArrowUpRight } from "lucide-react";
import { PageHead, Panel, Badge, Drawer, Empty } from "../../components/ui";
import { useApp } from "../../stores/app";
import { recordUrl } from "../../services/runRecords";
import { download } from "../../services/repository";

export default function Activity() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const tasks = useApp((state) => state.tasks);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("全部任务");
  const [status, setStatus] = useState("全部状态");
  const selected = tasks.find((item) => item.id === taskId);
  const filtered = tasks.filter((item) =>
    (kind === "全部任务" || item.kind === kind) &&
    (status === "全部状态" || item.status === status) &&
    `${item.name} ${item.id} ${item.model}`.toLowerCase().includes(query.toLowerCase()),
  );
  return <>
    <PageHead eyebrow="LOCAL RUN HISTORY" title="任务与记录" description="分析、评测与脱敏的真实运行记录保存在本机。" />
    <Panel title="运行记录" subtitle={`${tasks.length} 条本地记录`} actions={<button className="btn subtle" disabled={!filtered.length} onClick={() => download("NeuroLens-run-records.json", JSON.stringify({ source: "local", records: filtered }, null, 2))}><Download size={14} />导出记录索引</button>}>
      <div className="tabs">{["全部任务", "神经元分析", "API 安全评测", "提示词脱敏"].map((item) => <button key={item} className={kind === item ? "active" : ""} onClick={() => setKind(item)}>{item}</button>)}</div>
      <div className="table-toolbar"><div className="search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索任务、模型或编号" /></div><select value={status} onChange={(event) => setStatus(event.target.value)}>{["全部状态", "已完成", "运行中", "失败", "已取消"].map((item) => <option key={item}>{item}</option>)}</select></div>
      <div className="table-scroll"><table><thead><tr><th>任务</th><th>类型</th><th>模型 / 方式</th><th>处理量</th><th>状态</th><th>时间</th><th /></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td><Link className="table-link" to={`/activity/${item.id}`}>{item.name}</Link><small className="cell-sub">{item.id}</small></td><td>{item.kind}</td><td>{item.model}</td><td>{item.count}</td><td><Badge tone={item.status === "已完成" ? "green" : item.status === "已取消" ? "neutral" : item.status === "失败" ? "orange" : "amber"}>{item.status}</Badge></td><td>{item.date}</td><td><Link className="table-link" to={recordUrl(item)}>查看 ↗</Link></td></tr>)}</tbody></table>{!filtered.length && <Empty title="暂无运行记录" description="完成分析、评测或脱敏后会自动保存在这里。" />}</div>
    </Panel>
    {selected && <Drawer title={selected.name} onClose={() => navigate("/activity")}><Badge tone={selected.status === "已完成" ? "green" : "amber"}>{selected.status}</Badge><div className="runtime-list">{[["任务编号", selected.id], ["类型", selected.kind], ["模型 / 方式", selected.model], ["处理量", String(selected.count)], ["时间", selected.date]].map(([label, value]) => <p key={label}><span>{label}</span><strong>{value}</strong></p>)}</div><h4>任务配置</h4><div className="runtime-list">{Object.entries(selected.config).filter(([key]) => key !== "apiKey").map(([key, value]) => <p key={key}><span>{({ modelPath: "模型路径", directory: "模型目录", dataset: "数据集", count: "样本数", tokens: "生成上限", layer: "观察层", provider: "服务商", endpoint: "接口地址", model: "模型", perCategory: "每类样本", mode: "处理方式", enabled: "识别类型", custom: "自定义词", collectionId: "键值对集合" } as Record<string, string>)[key] || key}</span><strong>{Array.isArray(value) ? value.join("、") : String(value)}</strong></p>)}</div><Link className="btn primary" to={recordUrl(selected)}>查看结果并恢复配置 <ArrowUpRight size={15} /></Link></Drawer>}
    {taskId && !selected && <Empty title="任务不存在" description="本机未找到这条运行记录。" />}
  </>;
}
