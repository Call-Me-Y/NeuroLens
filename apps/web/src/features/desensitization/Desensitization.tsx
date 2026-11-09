import { useEffect, useRef, useState } from "react";
import {
  ScanText,
  Copy,
  Download,
  Upload,
  RotateCcw,
  Eye,
  KeyRound,
  Save,
  Trash2,
} from "lucide-react";
import { PageHead, Panel, Badge, Drawer, HelpLink } from "../../components/ui";
import { redact, restore, detectEntities, type Redacted } from "./redact";
import { download } from "../../services/repository";
import { useApp } from "../../stores/app";
import { loadVault, saveVault, type Collection } from "./vault";
import { loadPayload, savePayload } from "../../services/runRecords";
const example =
  "项目联系人：张明\n联系电话：13800138000\n工作邮箱：zhangming@example.com\n联系地址：北京市海淀区示例路 18 号\n\n请协助整理会议纪要，并将确认信息发送至 zhangming@example.com。以上均为虚构示例。";
export default function Desensitization() {
  const recordId = new URLSearchParams(window.location.search).get("record");
  const previous = useApp.getState().tasks.find((item) => item.id === recordId && item.kind === "提示词脱敏");
  const [text, setText] = useState(example);
  const [custom, setCustom] = useState("张明\n北京市海淀区示例路 18 号");
  const [enabled, setEnabled] = useState(["电话", "邮箱", "身份证", "姓名", "地址", "自定义"]);
  const [result, setResult] = useState<Redacted | null>(null);
  const [output, setOutput] = useState("");
  const [tab, setTab] = useState("文本处理");
  const [mapping, setMapping] = useState(false);
  const [savedMappingOpen, setSavedMappingOpen] = useState(false);
  const [files, setFiles] = useState<
    { name: string; result?: Redacted; restored?: string; error?: string }[]
  >([]);
  const [collections, setCollections] = useState<Collection[]>(loadVault);
  const [selectedId, setSelectedId] = useState("");
  const [collectionName, setCollectionName] = useState("");
  const [manualValue, setManualValue] = useState("");
  const [manualType, setManualType] = useState("敏感词");
  const [manualCustomType, setManualCustomType] = useState("");
  const [restoreInput, setRestoreInput] = useState("");
  const [restoreOutput, setRestoreOutput] = useState("");
  const [batchMode, setBatchMode] = useState<"脱敏" | "还原">("脱敏");
  const [preview, setPreview] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const notify = useApp((s) => s.notify);
  const addTask = useApp((s) => s.addTask);
  useEffect(() => {
    if (!previous) return;
    let active = true;
    void loadPayload<{ mode: string; input: string; output: string; result?: Redacted; fileName?: string }>(previous.id).then((payload) => {
      if (!active || !payload) { if (active) setError("找不到这条脱敏记录的本地结果"); return; }
      const config = previous.config;
      if (Array.isArray(config.enabled)) setEnabled(config.enabled as string[]);
      if (typeof config.custom === "string") setCustom(config.custom);
      if (typeof config.collectionId === "string") setSelectedId(config.collectionId);
      if (payload.mode === "text-redact") { setTab("文本处理"); setText(payload.input); setResult(payload.result || null); setOutput(payload.output); setPreview(false); }
      else if (payload.mode === "text-restore") { setTab("还原文本"); setRestoreInput(payload.input); setRestoreOutput(payload.output); }
      else { setTab("批量文件"); setBatchMode(payload.mode === "file-restore" ? "还原" : "脱敏"); setFiles([{ name: payload.fileName || "记录.txt", result: payload.result, restored: payload.mode === "file-restore" ? payload.output : undefined }]); }
    }).catch(() => { if (active) setError("无法读取本地脱敏记录"); });
    return () => { active = false; };
  }, [recordId]);
  const recordWork = async (mode: string, inputText: string, outputText: string, data?: Redacted, fileName?: string) => {
    const id = crypto.randomUUID();
    try {
      await savePayload(id, { mode, input: inputText, output: outputText, result: data, fileName });
      addTask({ id, kind: "提示词脱敏", name: `${mode.includes("restore") ? "还原" : "脱敏"} · ${fileName || "文本"}`, status: "已完成", date: new Date().toLocaleString("zh-CN"), createdAt: new Date().toISOString(), model: enabled.some((type) => ["姓名", "地址"].includes(type)) && !mode.includes("restore") ? "本地 NER + 规则" : "本地处理", count: data?.matches.length || 1, config: { mode, enabled, custom, collectionId: selectedCollection?.id || "" } });
    } catch { setError("处理已完成，但本地运行记录保存失败"); }
  };
  const selectedCollection = collections.find((item) => item.id === selectedId) || collections[0];
  const persist = (next: Collection[]) => {
    try { saveVault(next); setCollections(next); setError(""); return true; }
    catch { setError("无法保存键值对库：浏览器本地存储可能已满或不可用"); return false; }
  };
  const saveMapping = (data: Record<string, string>, suggestedName = "") => {
    if (!Object.keys(data).length) { setError("当前没有可保存的键值对"); return; }
    const name = (suggestedName || collectionName).trim();
    if (!name) { setError("请先填写键值对集合名称"); return; }
    if (collections.some((item) => item.name === name)) { setError("已存在同名集合，请更换名称"); return; }
    const item: Collection = { id: crypto.randomUUID(), name, created: new Date().toISOString(), mapping: { ...data } };
    if (persist([item, ...collections])) { setSelectedId(item.id); setCollectionName(""); notify(`已保存「${name}」的 ${Object.keys(data).length} 个键值对`); }
  };
  const deleteCollection = (item: Collection) => {
    if (!window.confirm(`删除「${item.name}」及其全部键值对？此操作无法撤销。`)) return;
    if (persist(collections.filter((entry) => entry.id !== item.id))) {
      if (selectedId === item.id) setSelectedId("");
      notify(`已删除「${item.name}」`);
    }
  };
  const addPair = () => {
    if (!selectedCollection) { setError("请先选择一个键值对集合"); return; }
    const value = manualValue.trim();
    const type = (manualType === "自定义类型" ? manualCustomType : manualType).trim();
    if (!value || !/^[^<>\s]{1,32}$/.test(type)) { setError("请填写敏感值和有效的占位符类型"); return; }
    if (Object.values(selectedCollection.mapping).includes(value)) { setError("所选集合中已存在这个敏感值"); return; }
    let number = 1;
    while (Object.hasOwn(selectedCollection.mapping, `<${type}-${number}>`)) number++;
    const token = `<${type}-${number}>`;
    const next = collections.map((item) => item.id === selectedCollection.id ? { ...item, mapping: { ...item.mapping, [token]: value } } : item);
    if (persist(next)) { setManualValue(""); notify(`已添加 ${token}`); }
  };
  const removePair = (token: string) => {
    if (!selectedCollection || !window.confirm(`删除 ${token} 的键值对？`)) return;
    const mapping = { ...selectedCollection.mapping };
    delete mapping[token];
    if (!Object.keys(mapping).length) { setError("集合至少保留一个键值对；如需清空，请删除整个集合"); return; }
    const next = collections.map((item) => item.id === selectedCollection.id ? { ...item, mapping } : item);
    if (persist(next)) notify(`已删除 ${token}`);
  };
  const analyze = async (previewOnly: boolean) => {
    setProcessing(true);
    setError("");
    try {
      const entities = enabled.some((type) => type === "姓名" || type === "地址") ? await detectEntities(text) : [];
      const r = redact(text, enabled, custom, entities);
      setResult(r);
      setOutput(previewOnly ? "" : r.text);
      setPreview(previewOnly);
      notify(`已识别 ${r.matches.length} 处敏感项${previewOnly ? "" : "，替换结果已生成"}`);
      if (!previewOnly) await recordWork("text-redact", text, r.text, r);
    } catch (cause) { setError((cause as Error).message); }
    finally { setProcessing(false); }
  };
  const loadFiles = async (list: FileList | null) => {
    if (!list) return;
    const loaded = await Promise.all(
      Array.from(list).map(async (f) => {
        try {
          if (!f.name.toLowerCase().endsWith(".txt"))
            throw new Error("仅支持 UTF-8 TXT 文件");
          if (f.size > 2 * 1024 * 1024) throw new Error("文件超过 2 MB 限制");
          const txt = new TextDecoder("utf-8", { fatal: true }).decode(
            await f.arrayBuffer(),
          );
          if (batchMode === "还原") {
            if (!selectedCollection) throw new Error("请先选择已保存的键值对集合");
            const restored = restore(txt, selectedCollection.mapping);
            if (restored === txt) throw new Error("所选集合没有匹配的占位符");
            await recordWork("file-restore", txt, restored, undefined, f.name);
            return { name: f.name, restored };
          }
          const entities = enabled.some((type) => type === "姓名" || type === "地址") ? await detectEntities(txt) : [];
          const result = redact(txt, enabled, custom, entities);
          await recordWork("file-redact", txt, result.text, result, f.name);
          return { name: f.name, result };
        } catch (e) {
          return { name: f.name, error: (e as Error).message };
        }
      }),
    );
    setFiles(loaded);
  };
  const restoreSaved = async () => {
    if (!selectedCollection) return;
    const restored = restore(restoreInput, selectedCollection.mapping);
    if (restored === restoreInput) { setError("所选集合中没有与文本占位符匹配的键值对"); return; }
    setRestoreOutput(restored);
    setError("");
    notify("已按所选键值对集合还原文本");
    await recordWork("text-restore", restoreInput, restored);
  };
  return (
    <>
      <PageHead
        eyebrow="PROMPT & DATA PROTECTION"
        title="提示词脱敏"
        description="保护敏感信息，保留文本的表达与可读性。"
        action={<HelpLink slug="desensitization" />}
      />
      <div className="notice-banner">
        <ScanText size={17} />
        电话、邮箱和身份证使用规则识别；姓名与地址由本地 NER 模型识别。文本仅发送至本机网页服务进行推理，不发送给外部服务。
      </div>
      {error && <div className="notice-banner" role="alert">{error}</div>}
      <div className="tabs page-tabs">
        {["文本处理", "还原文本", "批量文件"].map((x) => (
          <button
            key={x}
            className={tab === x ? "active" : ""}
            onClick={() => setTab(x)}
          >
            {x}
          </button>
        ))}
      </div>
      <div className="redact-layout">
        <div className="redact-sidebar">
        <Panel title="识别与替换规则" subtitle="按需选择，保持处理可控" className="redact-rules">
          <div className="form-stack spacious">
            <h4>识别类型</h4>
            {["电话", "邮箱", "身份证", "姓名", "地址", "自定义"].map((v, i) => (
              <label className="rule-row" key={v}>
                <input
                  type="checkbox"
                  checked={enabled.includes(v)}
                  onChange={() =>
                    setEnabled(
                      enabled.includes(v)
                        ? enabled.filter((x) => x !== v)
                        : [...enabled, v],
                    )
                  }
                />
                <i className={`entity-dot entity-${i}`} />
                {v}
                <span>{["姓名", "地址"].includes(v) ? "本地模型" : "本地规则"}</span>
              </label>
            ))}
            <label className="rule-custom">
              自定义敏感词
              <textarea
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                rows={5}
                placeholder="每行一个词，如姓名、地址或项目代号"
              />
            </label>
            <p className="field-note">
              重叠区间优先保留起点靠前、范围较长的匹配。同一值复用占位符。
            </p>
            <label>
              替换方式
              <select>
                <option>类型化占位符 &lt;类型-序号&gt;</option>
              </select>
            </label>
          </div>
        </Panel>
        <Panel title="键值对库" subtitle="命名保存 · 刷新后可继续还原" className="redact-vault">
          <div className="form-stack spacious">
            <label>新集合名称<input value={collectionName} onChange={(e) => setCollectionName(e.target.value)} placeholder="例如：会议纪要 11 月" maxLength={80} /></label>
            <button className="btn full" disabled={!result || !Object.keys(result.mapping).length} onClick={() => result && saveMapping(result.mapping)}><Save size={15} />保存当前键值对</button>
            <label>已保存集合<select value={selectedCollection?.id || ""} onChange={(e) => { setSelectedId(e.target.value); setRestoreOutput(""); setFiles([]); }}><option value="" disabled>选择集合</option>{collections.map((item) => <option key={item.id} value={item.id}>{item.name} · {Object.keys(item.mapping).length} 项</option>)}</select></label>
            {selectedCollection && <div className="vault-selection"><span>{selectedCollection.name}<small>{Object.keys(selectedCollection.mapping).length} 个键值对 · {selectedCollection.created ? new Date(selectedCollection.created).toLocaleString("zh-CN") : "旧项目迁移"}</small></span><button className="icon-btn" aria-label={`删除${selectedCollection.name}`} onClick={() => deleteCollection(selectedCollection)}><Trash2 size={15} /></button></div>}
            <button className="btn full" disabled={!selectedCollection} onClick={() => setSavedMappingOpen(true)}><KeyRound size={14} />查看所选键值对</button>
            <h4>手动补充键值对</h4>
            <label>敏感原值<input value={manualValue} onChange={(e) => setManualValue(e.target.value)} placeholder="例如：张明" maxLength={256} /></label>
            <label>占位符类型<select value={manualType} onChange={(e) => setManualType(e.target.value)}>{["敏感词", "姓名", "地址", "电话", "邮箱", "身份证", "公司名", "自定义类型"].map((type) => <option key={type}>{type}</option>)}</select></label>
            {manualType === "自定义类型" && <label>自定义类型名称<input value={manualCustomType} onChange={(e) => setManualCustomType(e.target.value)} placeholder="例如：项目代号" maxLength={32} /></label>}
            <button className="btn full" disabled={!selectedCollection || !manualValue.trim()} onClick={addPair}>添加到所选集合</button>
            <p className="field-note">原始敏感值保存在此浏览器的本地存储中。清除浏览器数据或更换浏览器会失去还原能力。</p>
          </div>
        </Panel>
        </div>
        <div className="redact-workspace">
          {tab === "文本处理" ? (
            <>
              <div className="redact-editors">
                <Panel
                  title="原始文本"
                  subtitle={`${text.length} 字符`}
                  actions={
                    <button
                      className="text-link"
                      onClick={() => {
                        setText(example);
                        setResult(null);
                        setOutput("");
                      }}
                    >
                      载入示例
                    </button>
                  }
                >
                  <textarea
                    className="editor"
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      setResult(null);
                      setOutput("");
                      setPreview(false);
                    }}
                    placeholder="粘贴需要处理的文本…"
                  />
                  <footer className="editor-footer">
                    <button
                      className="btn"
                      disabled={!text || processing}
                      onClick={() => analyze(true)}
                    >
                      <Eye size={14} />
                      识别预览
                    </button>
                    <button
                      className="btn primary"
                      disabled={!text || processing}
                      onClick={() => analyze(false)}
                    >
                      <ScanText size={14} />
                      {processing ? "正在识别…" : "执行脱敏"}
                    </button>
                  </footer>
                </Panel>
                <Panel
                  title={preview ? "识别预览" : "处理结果"}
                  subtitle={
                    result
                      ? `发现 ${result.matches.length} 处 · ${Object.keys(result.mapping).length} 个唯一值`
                      : "处理后可复制、导出或还原"
                  }
                >
                  {preview && result ? (
                    <div className="editor preview-text">
                      {(() => {
                        const nodes = [];
                        let pos = 0;
                        for (const [i, m] of result.matches.entries()) {
                          nodes.push(text.slice(pos, m.start));
                          nodes.push(
                            <mark key={i} title={m.type}>
                              {m.value}
                              <small>{m.type}</small>
                            </mark>,
                          );
                          pos = m.end;
                        }
                        nodes.push(text.slice(pos));
                        return nodes;
                      })()}
                    </div>
                  ) : (
                    <textarea
                      className="editor result"
                      value={output}
                      onChange={(e) => setOutput(e.target.value)}
                      placeholder="脱敏结果将在这里显示…"
                    />
                  )}
                  <footer className="editor-footer">
                    <button
                      className="btn"
                      disabled={!output || !result}
                      onClick={() => {
                        setOutput(restore(output, result!.mapping));
                        notify("已使用当前会话映射还原");
                      }}
                    >
                      <RotateCcw size={14} />
                      还原
                    </button>
                    <button
                      className="btn"
                      disabled={!output}
                      onClick={() => {
                        navigator.clipboard
                          .writeText(output)
                          .then(() => notify("已复制处理结果"))
                          .catch(() =>
                            notify("无法访问剪贴板，请手动选择复制"),
                          );
                      }}
                    >
                      <Copy size={14} />
                      复制
                    </button>
                    <button
                      className="btn"
                      disabled={!output}
                      onClick={() =>
                        download(
                          "脱敏结果.txt",
                          output,
                          "text/plain;charset=utf-8",
                        )
                      }
                    >
                      <Download size={14} />
                      导出
                    </button>
                  </footer>
                </Panel>
              </div>
              <div className="redact-summary">
                <span>
                  <Badge tone="green">本机处理</Badge>{" "}
                  姓名与地址只发送至本机模型服务
                </span>
                <button
                  className="text-link"
                  disabled={!result}
                  onClick={() => setMapping(true)}
                >
                  查看当前映射 <KeyRound size={14} />
                </button>
              </div>
            </>
          ) : tab === "还原文本" ? (
            <>
              <div className="redact-editors">
                <Panel title="待还原文本" subtitle={selectedCollection ? `使用「${selectedCollection.name}」` : "请先在左侧选择键值对集合"}>
                  <textarea className="editor" value={restoreInput} onChange={(e) => { setRestoreInput(e.target.value); setRestoreOutput(""); }} placeholder="粘贴含有 <姓名-1> 等占位符的脱敏文本…" />
                  <footer className="editor-footer"><button className="btn primary" disabled={!restoreInput || !selectedCollection} onClick={() => void restoreSaved()}><RotateCcw size={15} />还原文本</button></footer>
                </Panel>
                <Panel title="还原结果" subtitle="原始敏感值仅在本机显示">
                  <textarea className="editor result" value={restoreOutput} readOnly placeholder="还原结果将在这里显示…" />
                  <footer className="editor-footer"><button className="btn" disabled={!restoreOutput} onClick={() => navigator.clipboard.writeText(restoreOutput).then(() => notify("已复制还原结果")).catch(() => notify("无法访问剪贴板，请手动复制"))}><Copy size={14} />复制</button><button className="btn" disabled={!restoreOutput} onClick={() => download("还原结果.txt", restoreOutput, "text/plain;charset=utf-8")}><Download size={14} />导出</button></footer>
                </Panel>
              </div>
              <div className="redact-summary"><span><Badge tone="green">本机还原</Badge> 仅使用左侧选中的键值对集合</span></div>
            </>
          ) : (
            <Panel
              title="批量文件处理"
              subtitle="UTF-8 TXT · 单文件不超过 2 MB"
            >
              <div className="form-stack batch-mode"><label>处理方式<select value={batchMode} onChange={(e) => { setBatchMode(e.target.value as "脱敏" | "还原"); setFiles([]); }}><option>脱敏</option><option>还原</option></select></label></div>
              <div className="upload-area">
                <Upload size={32} />
                <h3>选择需要{batchMode}的文本文件</h3>
                <p>{batchMode === "脱敏" ? "使用所选规则与本地模型逐个处理；请保存各文件的键值对以便日后还原。" : selectedCollection ? `使用「${selectedCollection.name}」还原文件。` : "请先在左侧选择已保存的键值对集合。"}</p>
                <button
                  className="btn primary"
                  disabled={batchMode === "还原" && !selectedCollection}
                  onClick={() => input.current?.click()}
                >
                  选择 TXT 文件
                </button>
                <input
                  ref={input}
                  type="file"
                  accept=".txt"
                  multiple
                  hidden
                  onChange={(e) => { void loadFiles(e.target.files); e.target.value = ""; }}
                />
              </div>
              {files.length > 0 && (
                <table>
                  <thead>
                    <tr>
                      <th>文件</th>
                      <th>状态</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((f, i) => (
                      <tr key={i}>
                        <td>{f.name}</td>
                        <td>
                          {f.error ? (
                            <Badge tone="orange">{f.error}</Badge>
                          ) : f.restored !== undefined ? (
                            <Badge tone="green">已还原</Badge>
                          ) : (
                            <Badge tone="green">
                              {f.result!.matches.length} 处替换
                            </Badge>
                          )}
                        </td>
                        <td>
                          {f.result && <button className="text-link" disabled={!Object.keys(f.result.mapping).length} onClick={() => saveMapping(f.result!.mapping, collectionName.trim() || f.name)}>保存映射</button>}
                          <button className="text-link" disabled={!f.result && f.restored === undefined} onClick={() => download((f.restored !== undefined ? "还原-" : "脱敏-") + f.name, f.restored ?? f.result!.text, "text/plain;charset=utf-8")}>下载结果</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          )}
          <div className="tip-cards">
            <div>
              <span>01</span>
              <h4>精确选择范围</h4>
              <p>启用必要的识别类型，自定义词可补充专有名称和具体地址。</p>
            </div>
            <div>
              <span>02</span>
              <h4>先检查，再分享</h4>
              <p>通过预览确认识别范围，导出前再次核对处理结果。</p>
            </div>
            <div>
              <span>03</span>
              <h4>保留上下文</h4>
              <p>占位符保留信息类型，同一值重复出现时保持一致。</p>
            </div>
          </div>
        </div>
      </div>
      {mapping && result && (
        <Drawer title="当前会话映射" onClose={() => setMapping(false)}>
          <p className="notice-banner">
            此处包含原始敏感值，请勿随脱敏文本一起分享。
          </p>
          {Object.entries(result.mapping).map(([k, v]) => (
            <div className="mapping-row" key={k}>
              <code>{k}</code>
              <span>{v}</span>
            </div>
          ))}
          <button
            className="btn"
            onClick={() => {
              setResult(null);
              setMapping(false);
              notify("映射已清除，当前结果无法通过此页面自动还原");
            }}
          >
            清除映射
          </button>
        </Drawer>
      )}
      {savedMappingOpen && selectedCollection && (
        <Drawer title={`「${selectedCollection.name}」键值对`} onClose={() => setSavedMappingOpen(false)}>
          <p className="notice-banner">此处包含原始敏感值，仅保存在当前浏览器。不要与脱敏文本一起分享。</p>
          {Object.entries(selectedCollection.mapping).map(([key, value]) => <div className="mapping-row" key={key}><div className="mapping-head"><code>{key}</code><button className="icon-btn" aria-label={`删除${key}`} onClick={() => removePair(key)}><Trash2 size={14} /></button></div><span>{value}</span></div>)}
        </Drawer>
      )}
    </>
  );
}
