import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { activePython } from "./runtime-python.mjs";
import { datasetSnapshot } from "./dataset-service.mjs";

const jobs = new Map();
const reply = (res, status, data) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
};
const endpointUrl = (value) => {
  const url = new URL(value);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw Error("远程接口必须使用 HTTPS");
  if (url.username || url.password || url.search || url.hash) throw Error("接口地址不能包含凭据或查询参数");
  url.pathname = url.pathname.replace(/\/$/, "");
  if (!url.pathname.endsWith("/chat/completions")) url.pathname += "/chat/completions";
  return url.href;
};
const readBody = async (req) => {
  let body = "";
  for await (const part of req) {
    body += part;
    if (body.length > 12000) throw Error("请求过大");
  }
  return JSON.parse(body);
};
const validate = (body) => {
  if (typeof body.model !== "string" || !body.model.trim() || body.model.length > 150 || typeof body.apiKey !== "string" || !body.apiKey.trim() || body.apiKey.length > 500 || typeof body.provider !== "string") throw Error("请填写接口、模型和密钥");
  const url = endpointUrl(body.endpoint);
  if (!Number.isInteger(body.perCategory) || body.perCategory < 1 || body.perCategory > 20) throw Error("每类样本数必须在 1–20 之间");
  return { endpoint: url, model: body.model.trim(), provider: body.provider.slice(0, 80), perCategory: body.perCategory };
};
export async function apiSafetyRequest(req, res, root) {
  const url = new URL(req.url, "http://localhost");
  if (!url.pathname.startsWith("/api/v1/api-safety")) return false;
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(req.headers.host || "") || (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)) {
    reply(res, 403, { error: "Forbidden" }); return true;
  }
  const directory = path.join(root, "outputs", "api-safety");
  await fs.mkdir(directory, { recursive: true });
  if (req.method === "POST" && (url.pathname.endsWith("/validate") || url.pathname.endsWith("/runs"))) {
    let body;
    try {
      body = await readBody(req);
      const config = validate(body);
      if (url.pathname.endsWith("/validate")) {
        const response = await fetch(config.endpoint, { method: "POST", redirect: "error", signal: AbortSignal.timeout(45000), headers: { "Content-Type": "application/json", Authorization: `Bearer ${body.apiKey}` }, body: JSON.stringify({ model: config.model, messages: [{ role: "user", content: "Reply with OK." }], max_tokens: 8 }) });
        if (!response.ok) throw Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
        const data = await response.json();
        if (!data?.choices?.[0]?.message) throw Error("接口未返回兼容的聊天响应");
        reply(res, 200, { ok: true, model: config.model }); return true;
      }
      if ([...jobs.values()].some((job) => job.status === "running")) { reply(res, 409, { error: "已有运行中的 API 评测" }); return true; }
      config.datasetSource = (await datasetSnapshot(root, ["apiSafety"])).apiSafety;
      await fs.access(path.join(root, "models", "Qwen3Guard-Gen-0.6B", "model.safetensors"));
      const id = randomUUID();
      const input = path.join(directory, id + ".input.json");
      const output = path.join(directory, id + ".json");
      await fs.writeFile(input, JSON.stringify(config));
      const python = activePython(root);
      const child = spawn(python, [path.join(root, "engine", "api_eval.py"), input, output], { windowsHide: true, env: { ...process.env, NEUROLENS_API_KEY: body.apiKey, HF_HUB_OFFLINE: "1", PYTHONIOENCODING: "utf-8" } });
      const job = { id, status: "running", progress: 0, message: "开始接口评测", child };
      jobs.set(id, job);
      let stdout = "", stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString(); let at;
        while ((at = stdout.indexOf("\n")) >= 0) {
          const line = stdout.slice(0, at); stdout = stdout.slice(at + 1);
          try { const event = JSON.parse(line); if (event.progress !== undefined) job.progress = event.progress; if (event.message) job.message = event.message; if (event.error) job.error = event.error; } catch {}
        }
      });
      child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-2000); });
      child.on("error", (error) => { job.status = "failed"; job.error = error.message; });
      child.on("close", (code) => { if (job.status !== "cancelled") job.status = code === 0 ? "complete" : "failed"; if (code && !job.error) job.error = stderr; });
      reply(res, 202, { id }); return true;
    } catch (error) {
      const secret = typeof body?.apiKey === "string" ? body.apiKey : "";
      reply(res, 400, { error: secret ? error.message.replaceAll(secret, "[REDACTED]") : error.message }); return true;
    }
  }
  const match = url.pathname.match(/^\/api\/v1\/api-safety\/runs\/([a-f0-9-]+)$/);
  if (match) {
    const job = jobs.get(match[1]);
    if (req.method === "DELETE" && job) { job.status = "cancelled"; job.child.kill(); reply(res, 200, { status: "cancelled" }); return true; }
    if (req.method === "GET") {
      try { const result = JSON.parse(await fs.readFile(path.join(directory, match[1] + ".json"), "utf8")); reply(res, 200, { status: "complete", progress: 100, result }); }
      catch { if (job) { const { child, ...safe } = job; reply(res, 200, safe); } else reply(res, 404, { error: "找不到任务" }); }
      return true;
    }
  }
  reply(res, 404, { error: "Unknown API safety route" }); return true;
}
