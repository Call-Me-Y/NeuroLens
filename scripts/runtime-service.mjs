import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { activePython, legacyPython, projectPython } from "./runtime-python.mjs";

let installation;
const send = (res, status, value) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(value));
};
const exists = async (file) => fs.access(file).then(() => true, () => false);

function execute(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, ...options });
    let output = "";
    const timer = options.timeout ? setTimeout(() => child.kill(), options.timeout) : null;
    timer?.unref();
    child.stdout?.on("data", (chunk) => { output = (output + chunk).slice(-16000); options.onOutput?.(chunk.toString()); });
    child.stderr?.on("data", (chunk) => { output = (output + chunk).slice(-16000); options.onOutput?.(chunk.toString()); });
    child.on("error", (error) => { if (timer) clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      code === 0 ? resolve(output.trim()) : reject(Error(output.trim().slice(-1200) || `${command} 已退出（${code}）`));
    });
    if (options.job) options.job.child = child;
  });
}

async function inspectPython(python) {
  if (!(await exists(python))) return { path: python, found: false };
  try {
    const script = `import json,sys,importlib.metadata as m\nresult={'python':sys.version.split()[0]}\nfor p in ('torch','transformers'):\n try: result[p]=m.version(p)\n except m.PackageNotFoundError: result[p]=None\ntry:\n import torch\n result['cuda']=torch.cuda.is_available()\n result['cudaVersion']=torch.version.cuda\nexcept Exception as e: result['error']=str(e)[:200]\nprint(json.dumps(result))`;
    const raw = await execute(python, ["-c", script], { timeout: 45000 });
    const info = JSON.parse(raw.split(/\r?\n/).at(-1));
    return { path: python, found: true, ...info, ready: info.torch?.startsWith("2.12.") && info.transformers === "5.9.0" && !info.error };
  } catch (error) {
    return { path: python, found: true, ready: false, error: error.message.slice(-300) };
  }
}

export async function detectRuntime(root) {
  const [project, legacy] = await Promise.all([inspectPython(projectPython(root)), inspectPython(legacyPython(root))]);
  let gpu = null;
  if (process.platform === "win32" || process.platform === "linux") {
    try {
      const line = (await execute("nvidia-smi", ["--query-gpu=name,driver_version,memory.total", "--format=csv,noheader"], { timeout: 5000 })).split(/\r?\n/)[0];
      const [name, driver, memory] = line.split(",").map((item) => item.trim());
      gpu = { name, driver, memory };
    } catch { /* No NVIDIA GPU or driver. */ }
  }
  let uv = null;
  try { uv = await execute("uv", ["--version"], { timeout: 5000 }); } catch {}
  return { project, legacy, activePath: activePython(root), gpu, uv, installPath: projectPython(root) };
}

async function findUv(root, job) {
  const candidates = ["uv", path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WinGet", "Links", "uv.exe"), path.join(process.env.USERPROFILE || "", ".local", "bin", "uv.exe")];
  for (const candidate of candidates) {
    try { await execute(candidate, ["--version"], { timeout: 5000 }); return candidate; } catch {}
  }
  if (process.platform !== "win32") throw Error("未找到 uv。请先按官方安装说明安装 uv，再重试。");
  job.message = "在线安装 uv 工具";
  await execute("winget", ["install", "--id", "astral-sh.uv", "-e", "--source", "winget", "--silent", "--accept-package-agreements", "--accept-source-agreements"], { job, timeout: 300000, onOutput: (line) => { job.detail = line.slice(-200); } });
  for (const candidate of candidates) {
    try { await execute(candidate, ["--version"], { timeout: 5000 }); return candidate; } catch {}
  }
  throw Error("uv 已安装，但当前服务尚未找到可执行文件。请重启网页服务后重试。");
}

async function installRuntime(root, profile, job) {
  const uv = await findUv(root, job);
  if (job.cancelled) return;
  job.progress = 5;
  const python = projectPython(root);
  if (!(await exists(python))) {
    job.message = "下载 Python 3.12 并创建项目环境";
    await execute(uv, ["venv", "--python", "3.12", path.join(root, ".venv")], { cwd: root, job, timeout: 600000, onOutput: (line) => { job.detail = line.slice(-200); } });
  }
  if (job.cancelled) return;
  job.progress = 20;
  const index = profile === "cuda" ? "https://download.pytorch.org/whl/cu126" : "https://download.pytorch.org/whl/cpu";
  const torchVersion = profile === "cuda" ? "torch==2.12.0+cu126" : "torch==2.12.0+cpu";
  job.message = profile === "cuda" ? "在线安装 PyTorch CUDA 12.6" : "在线安装 PyTorch CPU";
  await execute(uv, ["pip", "install", "--python", python, torchVersion, "--index-url", index], { cwd: root, job, timeout: 1800000, onOutput: (line) => { job.detail = line.slice(-200); } });
  if (job.cancelled) return;
  job.progress = 65;
  job.message = "在线安装 Transformers 与依赖";
  await execute(uv, ["pip", "install", "--python", python, "transformers==5.9.0"], { cwd: root, job, timeout: 900000, onOutput: (line) => { job.detail = line.slice(-200); } });
  if (job.cancelled) return;
  job.progress = 90;
  job.message = "验证模型计算环境";
  const result = await inspectPython(python);
  if (!result.ready || (profile === "cuda" && !result.cuda)) throw Error(profile === "cuda" ? "依赖已安装，但 CUDA 无法使用。请检查 NVIDIA 驱动后重试。" : "环境安装后验证失败");
  await fs.writeFile(path.join(root, ".venv", ".neurolens-ready.json"), JSON.stringify({ profile, installedAt: new Date().toISOString(), torch: result.torch, transformers: result.transformers }));
  job.status = "complete";
  job.progress = 100;
  job.message = "环境已就绪，后续任务将使用项目 .venv";
}

export async function runtimeRequest(req, res, root) {
  const url = new URL(req.url, "http://localhost");
  if (!url.pathname.startsWith("/api/v1/runtime")) return false;
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(req.headers.host || "") || (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)) { send(res, 403, { error: "Forbidden" }); return true; }
  if (req.method === "GET" && url.pathname === "/api/v1/runtime/detect") { send(res, 200, await detectRuntime(root)); return true; }
  if (req.method === "GET" && url.pathname === "/api/v1/runtime/install") { send(res, 200, installation ? { ...installation, child: undefined } : { status: "idle" }); return true; }
  if (req.method === "DELETE" && url.pathname === "/api/v1/runtime/install") {
    if (installation?.status === "running") { installation.cancelled = true; installation.status = "cancelled"; installation.child?.kill(); }
    send(res, 200, { status: installation?.status || "idle" }); return true;
  }
  if (req.method === "POST" && url.pathname === "/api/v1/runtime/install") {
    if (installation?.status === "running") { send(res, 409, { error: "环境安装正在进行" }); return true; }
    try {
      let body = "";
      for await (const chunk of req) { body += chunk; if (body.length > 256) throw Error("请求过大"); }
      const { profile } = JSON.parse(body);
      if (!["cpu", "cuda"].includes(profile)) throw Error("环境类型无效");
      if (profile === "cuda" && !(await detectRuntime(root)).gpu) throw Error("未检测到 NVIDIA 显卡或驱动");
      installation = { id: randomUUID(), profile, status: "running", progress: 0, message: "准备在线安装", detail: "" };
      const job = installation;
      void installRuntime(root, profile, job).catch((error) => {
        if (!job.cancelled) { job.status = "failed"; job.error = error.message.slice(-600); }
      });
      send(res, 202, { id: installation.id });
    } catch (error) { send(res, 400, { error: error.message }); }
    return true;
  }
  send(res, 404, { error: "Unknown runtime route" }); return true;
}
