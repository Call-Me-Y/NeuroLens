import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { isEvaluationModel } from "./evaluation-models.mjs";
import { activePython } from "./runtime-python.mjs";
import { datasetSnapshot } from "./dataset-service.mjs";
const jobs = new Map();
let admitting = false;
export async function engineRequest(req, res, root) {
  const url = new URL(req.url, "http://localhost");
  if (!url.pathname.startsWith("/api/v1/engine")) return false;
  const reply = (status, data) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(data));
  };
  const origin = req.headers.origin;
  if (
    !/^((127\.0\.0\.1)|(localhost)):\d+$/.test(req.headers.host || "") ||
    (origin && origin !== `http://${req.headers.host}`)
  ) {
    reply(403, { error: "Forbidden" });
    return true;
  }
  const directory = path.join(root, "outputs", "runs");
  await fs.mkdir(directory, { recursive: true });
  if (req.method === "POST" && url.pathname === "/api/v1/engine/runs") {
    if (admitting || [...jobs.values()].some((j) => j.status === "running")) {
      reply(409, { error: "已有运行中的任务" });
      return true;
    }
    admitting = true;
    try {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 8192) throw new Error("请求过大");
      }
      const config = JSON.parse(body);
      if (
        !["benign", "harmful", "mixed"].includes(config.dataset) ||
        !Number.isInteger(config.count) ||
        config.count < 2 ||
        config.count > 32 ||
        !Number.isInteger(config.tokens) ||
        config.tokens < 1 ||
        config.tokens > 128 ||
        !Number.isInteger(config.layer) ||
        config.layer < 0 ||
        config.layer > 80 ||
        typeof config.modelPath !== "string"
      )
        throw new Error("参数无效");
      if (!isEvaluationModel(root, config.modelPath))
        throw new Error("裁判和脱敏模型不能用作评测对象，请选择 test 文件夹中的模型");
      await fs.access(path.join(config.modelPath, "config.json"));
      config.datasetSources = await datasetSnapshot(root, ["analysisBenign", "analysisHarmful"]);
      try {
        await fs.access(path.join(root, "models", "Qwen3Guard-Gen-0.6B", "model.safetensors"));
      } catch {
        throw new Error("缺少 Qwen3Guard-Gen-0.6B 模型权重，请先下载到项目 models 文件夹");
      }
      const id = randomUUID(),
        input = path.join(directory, id + ".input.json"),
        output = path.join(directory, id + ".json");
      await fs.writeFile(input, JSON.stringify(config));
      const python = activePython(root);
      const child = spawn(
        python,
        [path.join(root, "engine", "run.py"), input, output],
        {
          windowsHide: true,
          env: {
            ...process.env,
            PYTHONIOENCODING: "utf-8",
            HF_HUB_OFFLINE: "1",
          },
        },
      );
      const job = {
        id,
        status: "running",
        progress: 0,
        message: "启动计算进程",
        child,
      };
      jobs.set(id, job);
      let buffer = "";
      child.stdout.on("data", (chunk) => {
        buffer += chunk.toString();
        let pos;
        while ((pos = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, pos);
          buffer = buffer.slice(pos + 1);
          try {
            const event = JSON.parse(line);
            if (event.progress !== undefined) job.progress = event.progress;
            if (event.message) job.message = event.message;
            if (event.error) job.error = event.error;
          } catch {}
        }
      });
      let log = "";
      child.stderr.on("data", (c) => {
        log = (log + c).slice(-16000);
      });
      child.on("error", (e) => {
        job.status = "failed";
        job.error = e.message;
      });
      child.on("close", async (code) => {
        if (job.status !== "cancelled")
          job.status = code === 0 ? "complete" : "failed";
        if (code && !job.error) job.error = log.slice(-2000);
        await fs
          .writeFile(path.join(directory, id + ".log"), log)
          .catch(() => {});
      });
      reply(202, { id });
    } catch (e) {
      reply(400, { error: e.message });
    } finally {
      admitting = false;
    }
    return true;
  }
  const match = url.pathname.match(/^\/api\/v1\/engine\/runs\/([a-f0-9-]+)$/);
  if (match) {
    const job = jobs.get(match[1]);
    if (req.method === "DELETE" && job) {
      job.status = "cancelled";
      job.child.kill();
      reply(200, { status: "cancelled" });
      return true;
    }
    if (req.method === "GET") {
      try {
        const result = JSON.parse(
          await fs.readFile(path.join(directory, match[1] + ".json"), "utf8"),
        );
        reply(200, { status: "complete", progress: 100, result });
      } catch {
        if (job) {
          const { child, ...data } = job;
          reply(200, data);
        } else reply(404, { error: "找不到任务" });
      }
      return true;
    }
  }
  reply(404, { error: "Unknown engine route" });
  return true;
}
