import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Cpu, HardDrive, RefreshCw, XCircle } from "lucide-react";
import { HelpLink, Panel, Badge } from "../../components/ui";

type Python = { path: string; found: boolean; python?: string; torch?: string; transformers?: string; cuda?: boolean; cudaVersion?: string; ready?: boolean; error?: string };
type Detection = { project: Python; legacy: Python; activePath: string; gpu: { name: string; driver: string; memory: string } | null; uv: string | null; installPath: string };
type Installation = { status: string; profile?: string; progress?: number; message?: string; detail?: string; error?: string };

export default function RuntimeWizard() {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<"cpu" | "cuda">("cpu");
  const [detection, setDetection] = useState<Detection | null>(null);
  const [install, setInstall] = useState<Installation | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState("");
  const lastInstallStatus = useRef("");
  async function detect() {
    setDetecting(true); setError("");
    try {
      const response = await fetch("/api/v1/runtime/detect");
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "环境检测失败");
      setDetection(data);
    } catch (issue) { setError(issue instanceof Error ? issue.message : "环境检测失败"); }
    finally { setDetecting(false); }
  }
  useEffect(() => { void detect(); }, []);
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    async function poll() {
      try {
        const response = await fetch("/api/v1/runtime/install");
        const data = await response.json();
        if (response.ok && data.status !== "idle") {
          setInstall(data);
          if (data.status === "complete" && lastInstallStatus.current !== "complete") { setStep(2); void detect(); }
          lastInstallStatus.current = data.status;
        }
      } catch { /* The status remains visible while the service reconnects. */ }
    }
    void poll();
    timer = setInterval(() => { void poll(); }, 1500);
    return () => clearInterval(timer);
  }, []);
  async function begin() {
    setError("");
    try {
      const response = await fetch("/api/v1/runtime/install", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "无法开始安装");
      lastInstallStatus.current = "running";
      setInstall({ status: "running", profile, progress: 0, message: "准备在线安装" });
    } catch (issue) { setError(issue instanceof Error ? issue.message : "安装失败"); }
  }
  async function cancel() { await fetch("/api/v1/runtime/install", { method: "DELETE" }); setInstall({ status: "cancelled", profile }); }
  const busy = install?.status === "running";
  return (
    <div className="runtime-layout">
      <Panel title="计算环境配置向导" subtitle="检测设备、在线安装依赖、验证可用状态">
        <div className="runtime-steps">{["检测设备", "安装环境", "验证结果"].map((label, index) => <span key={label} className={step >= index ? "active" : ""}><b>{step > index ? <Check size={14} /> : index + 1}</b>{label}</span>)}</div>
        <div className="runtime-content">
          {error && <div className="notice-banner" role="alert"><XCircle size={16} />{error}</div>}
          {step === 0 && <>
            <div className="runtime-section-head"><div><h2>自动检测此设备</h2><p>检查 Python、PyTorch、Transformers、NVIDIA 显卡及安装工具。</p></div><button className="btn" onClick={() => void detect()} disabled={detecting}><RefreshCw size={14} />{detecting ? "检测中…" : "重新检测"}</button></div>
            {detection ? <>
              <div className="runtime-detection-grid">
                <div><small>当前计算环境</small><strong>{detection.activePath === detection.project.path ? "项目 .venv" : detection.activePath === detection.legacy.path ? "已有上层环境" : "自定义 Python"}</strong><code>{detection.activePath}</code></div>
                <div><small>NVIDIA 显卡</small><strong>{detection.gpu?.name || "未检测到"}</strong><span>{detection.gpu ? `驱动 ${detection.gpu.driver} · ${detection.gpu.memory}` : "可选择 CPU 环境"}</span></div>
              </div>
              {[ ["项目环境", detection.project], ["已有上层环境", detection.legacy] ] .map(([label, item]) => { const python = item as Python; return <div className="runtime-python-row" key={label as string}><div><strong>{label as string}</strong><code>{python.path}</code></div><div><Badge tone={python.ready ? "green" : "amber"}>{python.ready ? "依赖齐全" : python.found ? "需要配置" : "未创建"}</Badge><small>{python.found ? `Python ${python.python || "?"} · Torch ${python.torch || "未安装"} · Transformers ${python.transformers || "未安装"}${python.cuda ? " · CUDA 可用" : ""}` : ""}</small></div></div>; })}
              <p className="field-note">安装工具：{detection.uv || "未检测到 uv，将尝试在线安装"}。项目环境安装完成后会被分析、评测和脱敏任务使用。</p>
            </> : <p className="field-note">{detecting ? "正在读取设备与依赖信息，首次导入 PyTorch 可能需要几十秒。" : "等待检测结果。"}</p>}
          </>}
          {step === 1 && <>
            <h2>选择在线安装方案</h2><p>依赖下载后安装到项目 `.venv`，不进入应用安装包。</p>
            {(["cpu", "cuda"] as const).map((value) => <button key={value} className={`runtime-choice ${profile === value ? "selected" : ""}`} disabled={busy || (value === "cuda" && !detection?.gpu)} onClick={() => setProfile(value)}><Cpu size={24} /><div><strong>{value === "cpu" ? "CPU 标准环境" : "NVIDIA GPU 环境"}</strong><small>{value === "cpu" ? "PyTorch CPU 2.12 · Transformers 5.9，适合小模型测试" : "PyTorch CUDA 12.6 · Transformers 5.9，需要 NVIDIA 显卡与兼容驱动"}</small></div><span>{profile === value ? "●" : "○"}</span></button>)}
            <div className="runtime-list"><p><span>安装目录</span><strong>{detection?.installPath || "项目 .venv"}</strong></p><p><span>下载来源</span><strong>PyTorch 官方仓库、PyPI、uv</strong></p><p><span>模型文件</span><strong>在手动模型下载页单独获取</strong></p></div>
            {install && install.status !== "idle" && <div className={`resource-job ${install.status}`} role="status"><div><strong>{install.status === "complete" ? "安装完成" : install.status === "failed" ? "安装失败" : install.status === "cancelled" ? "已取消" : install.message}</strong><span>{install.error || install.detail || ""}</span></div><div className="resource-progress"><span style={{ width: `${install.progress || 0}%` }} /></div></div>}
            <div className="runtime-install-actions"><button className="btn primary" disabled={busy || (profile === "cuda" && !detection?.gpu)} onClick={() => void begin()}>{busy ? "安装中…" : install?.status === "failed" ? "重试安装" : "开始在线安装"}</button>{busy && <button className="btn subtle" onClick={() => void cancel()}>取消安装</button>}</div>
          </>}
          {step === 2 && <div className="runtime-complete"><Check size={35} /><h2>项目环境已就绪</h2><p>依赖已安装并验证。后续计算任务将使用项目内的 Python 环境。</p><div className="runtime-list"><p><span>Python</span><strong>{detection?.project.python || "—"}</strong></p><p><span>PyTorch</span><strong>{detection?.project.torch || "—"}</strong></p><p><span>Transformers</span><strong>{detection?.project.transformers || "—"}</strong></p><p><span>CUDA</span><strong>{detection?.project.cuda ? `可用 · ${detection.project.cudaVersion}` : "CPU"}</strong></p></div></div>}
          <div className="runtime-footer"><button className="btn" disabled={step === 0 || busy} onClick={() => setStep(step - 1)}>上一步</button>{step < 2 && <button className="btn primary" disabled={busy || (step === 0 && !detection)} onClick={() => setStep(step + 1)}>下一步 <ArrowRight size={14} /></button>}{step === 2 && <button className="btn" onClick={() => { setStep(0); void detect(); }}>重新检测</button>}</div>
        </div>
      </Panel>
      <aside className="runtime-aside"><HardDrive size={28} /><h3>应用与计算环境分离</h3><p>环境在线安装到项目目录，模型单独下载。应用更新时无需重复携带 PyTorch 和权重。</p><ul><li>自动检测现有环境</li><li>CPU / NVIDIA 方案可选</li><li>安装后再次验证</li><li>任务自动使用就绪环境</li></ul><HelpLink slug="environment" /></aside>
    </div>
  );
}
