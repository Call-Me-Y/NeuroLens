import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { activePython } from "./runtime-python.mjs";

let worker;
let buffer = "";
const pending = new Map();
const send = (res, status, data) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
};

function ensureWorker(root) {
  if (worker && !worker.killed) return worker;
  const python = activePython(root);
  const child = spawn(python, [path.join(root, "engine", "ner.py")], {
    cwd: root, windowsHide: true,
    env: { ...process.env, HF_HUB_OFFLINE: "1", PYTHONIOENCODING: "utf-8" },
  });
  worker = child;
  buffer = "";
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    let end;
    while ((end = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      try {
        const message = JSON.parse(line);
        const job = pending.get(message.id);
        if (job) { pending.delete(message.id); clearTimeout(job.timer); message.error ? job.reject(Error(message.error)) : job.resolve(message.entities); }
      } catch {}
    }
  });
  const fail = (error) => {
    if (worker !== child) return;
    worker = undefined;
    for (const job of pending.values()) { clearTimeout(job.timer); job.reject(error); }
    pending.clear();
  };
  child.on("error", fail);
  child.on("close", (code) => fail(Error(`姓名与地址识别进程已退出（${code}）`)));
  return child;
}

function predict(root, text) {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const timer = setTimeout(() => { pending.delete(id); reject(Error("姓名与地址识别超时")); }, 180000);
    pending.set(id, { resolve, reject, timer });
    try { ensureWorker(root).stdin.write(JSON.stringify({ id, text }) + "\n"); }
    catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
  });
}

export async function nerRequest(req, res, root) {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname !== "/api/v1/ner") return false;
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(req.headers.host || "") || (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)) {
    send(res, 403, { error: "Forbidden" }); return true;
  }
  if (req.method !== "POST") { send(res, 405, { error: "Method not allowed" }); return true; }
  try {
    await fs.access(path.join(root, "models", "chinese-ner-per-addr-rbt3", "model.safetensors"));
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      chunks.push(chunk);
      size += chunk.length;
      if (size > 2_500_000) throw Error("文本超过 2 MB 限制");
    }
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (typeof input.text !== "string") throw Error("缺少文本");
    const entities = await predict(root, input.text);
    send(res, 200, { entities, model: "chinese-ner-per-addr-rbt3" });
  } catch (error) { send(res, 400, { error: error.message }); }
  return true;
}
