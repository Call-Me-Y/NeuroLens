import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const mock = http.createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  const data = JSON.parse(body);
  assert.equal(req.headers.authorization, "Bearer local-test-key");
  res.setHeader("Content-Type", "application/json");
  if (data.messages[0].content === "Reply with OK.") {
    return res.end(JSON.stringify({ choices: [{ message: { content: "OK" } }] }));
  }
  if (++mock.calls === 2) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: "test rejection local-test-key" }));
  }
  res.end(JSON.stringify({ choices: [{ message: { content: mock.calls === 3 ? "" : "I cannot help with that request." } }], usage: { total_tokens: 12 } }));
});
mock.calls = 0;
mock.listen(0, "127.0.0.1");
await once(mock, "listening");
const mockPort = mock.address().port;
const reservation = http.createServer();
reservation.listen(0, "127.0.0.1");
await once(reservation, "listening");
const appPort = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const app = spawn(process.execPath, [path.join(root, "scripts/serve.mjs")], {
  cwd: root,
  windowsHide: true,
  env: { ...process.env, PORT: String(appPort) },
});
let logs = "", id;
app.stderr.on("data", (chunk) => { logs += chunk.toString(); });
const base = `http://127.0.0.1:${appPort}`;
const config = { provider: "本地测试", endpoint: `http://127.0.0.1:${mockPort}/v1`, model: "mock-model", apiKey: "local-test-key", perCategory: 1 };
async function post(route) {
  const response = await fetch(base + route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
  const data = await response.json();
  assert.ok(response.ok, JSON.stringify(data));
  return data;
}
try {
  for (let i = 0; i < 50; i++) {
    try { const response = await fetch(base + "/health"); if (response.ok) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.equal((await post("/api/v1/api-safety/validate")).ok, true);
  const missingKey = await fetch(base + "/api/v1/api-safety/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...config, apiKey: "" }) });
  assert.equal(missingKey.status, 400);
  id = (await post("/api/v1/api-safety/runs")).id;
  let job;
  for (let i = 0; i < 240; i++) {
    job = await (await fetch(base + "/api/v1/api-safety/runs/" + id)).json();
    if (job.status === "complete" || job.status === "failed") break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.equal(job.status, "complete", JSON.stringify(job) + logs);
  const { result } = job;
  assert.equal(result.source, "api-computed");
  assert.equal(result.dataset.total, 10800);
  assert.equal(result.samples.length, 5);
  assert.equal(result.dataset.sampling.perCategory, 1);
  assert.equal(new Set(result.samples.map((row) => row.category)).size, 5);
  assert.equal(result.samples[0].output, "I cannot help with that request.");
  assert.ok(["正确拒绝", "安全"].includes(result.samples[0].judgment));
  assert.equal(result.samples[1].judgment, "未判定");
  assert.match(result.samples[1].error, /401/);
  assert.equal(result.samples[2].judgment, "正确拒绝");
  assert.equal(result.samples[2].output, "");
  assert.equal(JSON.stringify(result).includes(config.apiKey), false);
  assert.equal((await fs.readFile(path.join(root, "outputs/api-safety", id + ".input.json"), "utf8")).includes(config.apiKey), false);
  console.log(JSON.stringify({ status: job.status, judgments: result.samples.map((row) => row.judgment), categories: result.dataset.sampling.categories.length, failedRequests: result.samples.filter((row) => row.error).length, datasetSize: result.dataset.total }));
} finally {
  app.kill();
  await new Promise((resolve) => mock.close(resolve));
  if (id) for (const ext of [".input.json", ".json"]) await fs.rm(path.join(root, "outputs/api-safety", id + ext), { force: true });
}
