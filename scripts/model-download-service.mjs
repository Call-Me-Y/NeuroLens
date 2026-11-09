import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";

const nerRepo = "git@github.com:Call-Me-Y/NeuroLens.git";
const nerPage = "https://github.com/Call-Me-Y/NeuroLens/blob/d52582494d2d6d143dd524cc57b1c033cf5a54e3/models/chinese-ner-per-addr-rbt3/model.safetensors";
const models = {
  smol: {
    name: "SmolLM2-135M-Instruct", directory: "test", repository: "HuggingFaceTB/SmolLM2-135M-Instruct",
    revision: "a5cf62c9a838db1be8f34394f02edb89f718a9ed", sha256: "5af571cbf074e6d21a03528d2330792e532ca608f24ac70a143f6b369968ab8c", size: 269060552,
    files: ["config.json", "generation_config.json", "merges.txt", "model.safetensors", "special_tokens_map.json", "tokenizer_config.json", "tokenizer.json", "vocab.json"],
    source: "https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct",
  },
  guard: {
    name: "Qwen3Guard-Gen-0.6B", directory: "models", repository: "Qwen/Qwen3Guard-Gen-0.6B",
    revision: "3706d237aa5d05ee7f6c8274c208a37211e9fd65", sha256: "4f3ce47ebd968cddb67de08d8764f8ede7c410a7d1fb9e08145a4c7a2f2e5c0f", size: 1503300328,
    files: ["config.json", "generation_config.json", "merges.txt", "model.safetensors", "tokenizer_config.json", "tokenizer.json", "vocab.json"],
    source: "https://huggingface.co/Qwen/Qwen3Guard-Gen-0.6B",
  },
  ner: {
    name: "chinese-ner-per-addr-rbt3", directory: "models", repository: null,
    sha256: "832a043987d5df4951f747147ff27d04cb03b4c93a5f08d161e4bcd505ec8a28", size: 151566540,
    files: ["config.json", "model.safetensors", "special_tokens_map.json", "tokenizer_config.json", "tokenizer.json", "vocab.txt"],
    source: nerPage,
  },
};
let current;
const reply = (res, status, data) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(data)); };
const target = (root, model) => path.join(root, model.directory, model.name);
const exists = async (file) => fs.stat(file).catch(() => null);

async function status(root, id, model) {
  const directory = target(root, model);
  const missing = [];
  for (const file of model.files) {
    const stat = await exists(path.join(directory, file));
    if (!stat?.isFile() || (file === "model.safetensors" && stat.size !== model.size)) missing.push(file);
  }
  return { id, name: model.name, directory, source: model.source, size: model.size, files: model.files.length, missing, installed: missing.length === 0 };
}

async function downloadFile(url, destination, expectedHash, job, model, fileIndex) {
  const controller = new AbortController();
  job.controller = controller;
  const response = await fetch(url, { signal: controller.signal, redirect: "follow", headers: { "User-Agent": "NeuroLens/0.1 model downloader" } });
  if (!response.ok || !response.body) throw Error(`下载 ${path.basename(destination)} 失败：HTTP ${response.status}`);
  const part = destination + ".part";
  const handle = await fs.open(part, "w");
  const hash = createHash("sha256");
  let written = 0;
  try {
    for await (const chunk of response.body) {
      if (job.cancelled) throw Error("下载已取消");
      for (let offset = 0; offset < chunk.length;) {
        const result = await handle.write(chunk, offset, chunk.length - offset);
        offset += result.bytesWritten;
      }
      hash.update(chunk);
      written += chunk.length;
      const fileFraction = fileIndex / model.files.length;
      job.progress = Math.min(99, Math.round((fileFraction + Math.min(1, written / (path.basename(destination) === "model.safetensors" ? model.size : Number(response.headers.get("content-length")) || written)) / model.files.length) * 100));
      job.bytes = written;
    }
  } catch (error) {
    await handle.close();
    await fs.rm(part, { force: true });
    throw error;
  }
  await handle.close();
  if (expectedHash && hash.digest("hex") !== expectedHash) { await fs.rm(part, { force: true }); throw Error("权重 SHA-256 校验失败，下载文件已删除"); }
  if (path.basename(destination) === "model.safetensors" && written !== model.size) { await fs.rm(part, { force: true }); throw Error("权重大小不匹配，下载文件已删除"); }
  await fs.rename(part, destination);
}

async function downloadHuggingFace(root, model, job) {
  const directory = target(root, model);
  await fs.mkdir(directory, { recursive: true });
  for (const [index, file] of model.files.entries()) {
    if (job.cancelled) return;
    const destination = path.join(directory, file);
    const stat = await exists(destination);
    if (stat?.isFile() && (file !== "model.safetensors" || stat.size === model.size)) continue;
    job.message = `正在下载 ${file}`;
    const url = `https://huggingface.co/${model.repository}/resolve/${model.revision}/${file}`;
    await downloadFile(url, destination, file === "model.safetensors" ? model.sha256 : null, job, model, index);
  }
}

function runGit(args, cwd, job) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_LFS_SKIP_SMUDGE: "0", HTTPS_PROXY: "", HTTP_PROXY: "", ALL_PROXY: "" } });
    job.child = child;
    let output = "";
    child.stdout.on("data", (chunk) => { output = (output + chunk).slice(-1200); job.detail = chunk.toString().slice(-180); });
    child.stderr.on("data", (chunk) => {
      output = (output + chunk).slice(-1200);
      job.detail = chunk.toString().slice(-180);
      const progress = job.detail.match(/(\d+)%/);
      if (progress) job.progress = Math.min(90, Math.round(Number(progress[1]) * 0.9));
    });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(Error(output || `Git 已退出（${code}）`)));
  });
}

async function downloadNer(root, model, job) {
  const cacheRoot = path.join(root, ".cache", "model-downloads");
  const checkout = path.join(cacheRoot, job.id);
  await fs.mkdir(cacheRoot, { recursive: true });
  try {
    job.message = "从 GitHub LFS 获取 NER 模型";
    await runGit(["clone", "--depth", "1", nerRepo, checkout], root, job);
    if (job.cancelled) return;
    const source = path.join(checkout, "models", model.name);
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path.join(source, "model.safetensors"))) hash.update(chunk);
    if (hash.digest("hex") !== model.sha256) throw Error("Git LFS 权重校验失败，请确认仓库权限与 LFS 配额");
    const directory = target(root, model);
    await fs.mkdir(directory, { recursive: true });
    for (const [index, file] of model.files.entries()) {
      if (job.cancelled) return;
      job.message = `正在保存 ${file}`;
      const destination = path.join(directory, file);
      await fs.copyFile(path.join(source, file), destination + ".part");
      await fs.rename(destination + ".part", destination);
      job.progress = Math.round(((index + 1) / model.files.length) * 99);
    }
  } finally {
    if (path.dirname(checkout) === cacheRoot) await fs.rm(checkout, { recursive: true, force: true });
  }
}

export async function modelDownloadRequest(req, res, root) {
  const url = new URL(req.url, "http://localhost");
  if (!url.pathname.startsWith("/api/v1/model-downloads")) return false;
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(req.headers.host || "") || (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)) { reply(res, 403, { error: "Forbidden" }); return true; }
  if (req.method === "GET" && url.pathname === "/api/v1/model-downloads") {
    reply(res, 200, { models: await Promise.all(Object.entries(models).map(([id, model]) => status(root, id, model))), job: current ? { ...current, child: undefined, controller: undefined } : null });
    return true;
  }
  if (req.method === "DELETE" && url.pathname === "/api/v1/model-downloads/current") {
    if (current?.status === "running") { current.cancelled = true; current.status = "cancelled"; current.controller?.abort(); current.child?.kill(); }
    reply(res, 200, { status: current?.status || "idle" }); return true;
  }
  const match = url.pathname.match(/^\/api\/v1\/model-downloads\/(smol|guard|ner)$/);
  if (req.method === "POST" && match) {
    if (current?.status === "running") { reply(res, 409, { error: "已有模型正在下载" }); return true; }
    const id = match[1], model = models[id];
    current = { id: randomUUID(), model: id, status: "running", progress: 0, bytes: 0, message: "准备下载" };
    const job = current;
    void (id === "ner" ? downloadNer(root, model, job) : downloadHuggingFace(root, model, job))
      .then(async () => {
        if (job.cancelled) return;
        const result = await status(root, id, model);
        if (!result.installed) throw Error(`下载不完整：${result.missing.join("、")}`);
        job.status = "complete"; job.progress = 100; job.message = "模型已就绪";
      }).catch((error) => { if (!job.cancelled) { job.status = "failed"; job.error = error.message.slice(-500); } });
    reply(res, 202, { id: job.id }); return true;
  }
  reply(res, 404, { error: "Unknown model download route" }); return true;
}
