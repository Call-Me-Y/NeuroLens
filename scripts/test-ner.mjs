import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const reservation = http.createServer();
reservation.listen(0, "127.0.0.1");
await once(reservation, "listening");
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const server = spawn(process.execPath, [path.join(root, "scripts/serve.mjs")], {
  cwd: root, windowsHide: true, env: { ...process.env, PORT: String(port) },
});
let logs = "";
server.stderr.on("data", (chunk) => { logs += chunk.toString(); });
const base = `http://127.0.0.1:${port}`;
try {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(base + "/health")).ok) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const text = "张明住在北京市海淀区中关村大街27号，电话13800138000。";
  const response = await fetch(base + "/api/v1/ner", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }),
  });
  const result = await response.json();
  assert.ok(response.ok, JSON.stringify(result) + logs);
  assert.equal(result.model, "chinese-ner-per-addr-rbt3");
  assert.ok(result.entities.some((entity) => entity.type === "姓名" && entity.text === "张明"));
  assert.ok(result.entities.some((entity) => entity.type === "地址" && entity.text.includes("北京市海淀区")));
  for (const entity of result.entities) assert.equal(text.slice(entity.start, entity.end), entity.text);
  const repeat = await fetch(base + "/api/v1/ner", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "李雷住在上海市徐汇区漕溪北路1号。" }),
  });
  assert.ok(repeat.ok, JSON.stringify(await repeat.json()));
  console.log(JSON.stringify({ model: result.model, entities: result.entities, repeatedRequest: true }));
} finally { server.kill(); }
