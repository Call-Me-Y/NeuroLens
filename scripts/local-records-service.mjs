import fs from "node:fs/promises";
import path from "node:path";

export async function localRecordsRequest(req, res, root) {
  if (new URL(req.url, "http://localhost").pathname !== "/api/v1/records") return false;
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(req.headers.host || "") || (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)) {
    res.writeHead(403); res.end(); return true;
  }
  if (req.method !== "GET") { res.writeHead(405); res.end(); return true; }
  const records = [];
  for (const [folder, kind] of [["runs", "神经元分析"], ["api-safety", "API 安全评测"]]) {
    const directory = path.join(root, "outputs", folder);
    let files;
    try { files = await fs.readdir(directory); } catch { continue; }
    for (const file of files.filter((name) => /^[a-f0-9-]+\.input\.json$/.test(name))) {
      const id = file.slice(0, -".input.json".length);
      try {
        const output = path.join(directory, id + ".json");
        const stats = await fs.stat(output);
        const config = JSON.parse(await fs.readFile(path.join(directory, file), "utf8"));
        if (kind === "神经元分析") {
          const model = path.basename(config.modelPath || "本地模型");
          records.push({ id, runId: id, kind, name: `神经元分析 · ${model}`, status: "已完成", date: stats.mtime.toLocaleString("zh-CN"), createdAt: stats.mtime.toISOString(), model, count: config.count || 0, config: { directory: path.dirname(config.modelPath || ""), modelPath: config.modelPath, dataset: config.dataset, count: config.count, tokens: config.tokens, layer: Number(config.layer || 0) + 1 } });
        } else {
          records.push({ id, runId: id, kind, name: `API 评测 · ${config.model}`, status: "已完成", date: stats.mtime.toLocaleString("zh-CN"), createdAt: stats.mtime.toISOString(), model: config.model, count: config.count || (config.perCategory || 0) * 5, config: { provider: config.provider, endpoint: config.endpoint, model: config.model, perCategory: config.perCategory } });
        }
      } catch { /* An unfinished run has no completed output to import. */ }
    }
  }
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify({ records }));
  return true;
}
