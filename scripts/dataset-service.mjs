import fs from "node:fs/promises";
import path from "node:path";

export const defaultDatasets = {
  analysisBenign: { title: "良性行为样本", path: "data/JBB-Behaviors/benign-behaviors.csv", promptColumn: "Goal", categoryColumn: "Category", note: "神经元分析的良性请求；混合模式与风险样本交替取样。" },
  analysisHarmful: { title: "风险行为样本", path: "data/JBB-Behaviors/harmful-behaviors.csv", promptColumn: "Goal", categoryColumn: "Category", note: "神经元分析的风险请求。" },
  apiSafety: { title: "API 安全评测集", path: "data/JailBench/JailBench.csv", promptColumn: "query", categoryColumn: "一级领域", note: "API 评测按五个一级领域等量抽样。" },
};
const roleNames = Object.keys(defaultDatasets);
const configPath = (root) => path.join(root, "data", "datasets.config.json");

export async function getDatasetConfig(root) {
  let saved = {};
  try { saved = JSON.parse(await fs.readFile(configPath(root), "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const roles = {};
  for (const role of roleNames) roles[role] = { ...defaultDatasets[role], ...(saved.roles?.[role] || {}) };
  return { version: 1, roles };
}

export async function resolveDatasetPath(root, relative) {
  if (typeof relative !== "string" || relative.length > 260 || path.isAbsolute(relative)) throw Error("请输入 data 目录下的相对 CSV 路径");
  const full = path.resolve(root, relative.replaceAll("/", path.sep));
  const base = await fs.realpath(path.join(root, "data"));
  const real = await fs.realpath(full);
  if (!real.startsWith(base + path.sep) || path.extname(real).toLowerCase() !== ".csv") throw Error("数据文件必须是 data 目录中的 CSV");
  return real;
}

function parseCsv(text, onRow) {
  let columns = null, row = [], field = "", quoted = false;
  const push = () => {
    row.push(field); field = "";
    if (row.every((item) => !item.trim())) { row = []; return; }
    if (!columns) columns = row.map((item) => item.replace(/^\uFEFF/, "").trim());
    else onRow(columns, row);
    row = [];
  };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index++; }
      else quoted = !quoted;
    } else if (!quoted && char === ",") { row.push(field); field = ""; }
    else if (!quoted && char === "\n") push();
    else if (!quoted && char === "\r" && text[index + 1] === "\n") { /* CRLF */ }
    else field += char;
  }
  if (quoted) throw Error("CSV 引号未闭合");
  if (field || row.length) push();
  return columns || [];
}

export async function inspectCsv(file, promptColumn, categoryColumn) {
  const content = await fs.readFile(file, "utf8");
  let rows = 0, usable = 0;
  const categories = {};
  const columns = parseCsv(content, (headers, values) => {
    rows++;
    const prompt = values[headers.indexOf(promptColumn)]?.trim();
    if (prompt) {
      usable++;
      if (categoryColumn) {
        const category = values[headers.indexOf(categoryColumn)]?.trim();
        if (category) categories[category] = (categories[category] || 0) + 1;
      }
    }
  });
  return { rows, columns, usable, categories };
}

async function validateRole(root, role, config) {
  if (!roleNames.includes(role)) throw Error("未知数据集用途");
  if (typeof config?.title !== "string" || !config.title.trim() || config.title.length > 50 || typeof config.note !== "string" || config.note.length > 300) throw Error("请填写有效的数据集名称和说明");
  if (typeof config.promptColumn !== "string" || !config.promptColumn.trim() || config.promptColumn.length > 80) throw Error("请输入问题字段名");
  if (role === "apiSafety" && (typeof config.categoryColumn !== "string" || !config.categoryColumn.trim() || config.categoryColumn.length > 80)) throw Error("请输入分类字段名");
  if (config.categoryColumn && (typeof config.categoryColumn !== "string" || config.categoryColumn.length > 80)) throw Error("分类字段名无效");
  const file = await resolveDatasetPath(root, config.path);
  const result = await inspectCsv(file, config.promptColumn, config.categoryColumn || undefined);
  if (!result.columns.includes(config.promptColumn) || (config.categoryColumn && !result.columns.includes(config.categoryColumn))) throw Error(`字段不匹配：可用字段为 ${result.columns.join("、")}`);
  if (role === "apiSafety") {
    const counts = Object.values(result.categories);
    if (counts.length !== 5 || counts.some((count) => count < 20)) throw Error("API 评测文件需包含五个类别，且每类至少 20 条有效问题");
  } else if (result.usable < 32) throw Error("神经元分析文件需至少 32 条有效问题");
  return { ...config, title: config.title.trim(), note: config.note.trim(), path: path.relative(root, file).replaceAll(path.sep, "/"), promptColumn: config.promptColumn.trim(), categoryColumn: config.categoryColumn?.trim() || "" };
}

export async function datasetSnapshot(root, names) {
  const config = await getDatasetConfig(root);
  const result = {};
  for (const name of names) result[name] = await validateRole(root, name, config.roles[name]);
  return result;
}

async function catalog(root) {
  const base = path.join(root, "data");
  const output = [];
  async function visit(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) { await visit(full); continue; }
      if (!entry.isFile() || ![".csv", ".jsonl", ".raw"].includes(path.extname(entry.name).toLowerCase())) continue;
      const relative = path.relative(root, full).replaceAll(path.sep, "/");
      const stat = await fs.stat(full);
      const format = path.extname(entry.name).slice(1).toUpperCase();
      let rows = 0, columns = [];
      if (format === "CSV") ({ rows, columns } = await inspectCsv(full));
      else rows = (await fs.readFile(full, "utf8")).split(/\r?\n/).filter((line) => line.trim()).length;
      output.push({ path: relative, name: entry.name, format, bytes: stat.size, rows, columns, group: relative.includes("/utility/") ? "通用效用" : relative.includes("/JBB-Behaviors/") ? "JBB 行为" : relative.includes("/JailBench/") ? "JailBench" : "迁移数据" });
    }
  }
  await visit(base);
  return output.sort((a, b) => a.path.localeCompare(b.path));
}

let writing = false;
const reply = (res, status, data) => { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(data)); };
export async function datasetRequest(req, res, root) {
  const url = new URL(req.url, "http://localhost");
  if (!url.pathname.startsWith("/api/v1/datasets")) return false;
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(req.headers.host || "") || (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)) { reply(res, 403, { error: "Forbidden" }); return true; }
  try {
    if (req.method === "GET" && url.pathname === "/api/v1/datasets/config") {
      reply(res, 200, await getDatasetConfig(root)); return true;
    }
    if (req.method === "GET" && url.pathname === "/api/v1/datasets") {
      const config = await getDatasetConfig(root);
      const files = await catalog(root);
      const roles = {};
      for (const role of roleNames) {
        const info = config.roles[role];
        try { roles[role] = { ...info, status: "ready", ...(await inspectCsv(await resolveDatasetPath(root, info.path), info.promptColumn, info.categoryColumn)) }; }
        catch (error) { roles[role] = { ...info, status: "error", error: error.message }; }
      }
      reply(res, 200, { roles, files }); return true;
    }
    if (req.method === "PUT" && url.pathname === "/api/v1/datasets/config") {
      if (writing) { reply(res, 409, { error: "配置正在保存" }); return true; }
      writing = true;
      try {
        let body = "";
        for await (const chunk of req) { body += chunk; if (body.length > 2000) throw Error("配置内容过大"); }
        const input = JSON.parse(body);
        const config = await getDatasetConfig(root);
        config.roles[input.role] = await validateRole(root, input.role, input.config);
        const temporary = configPath(root) + ".tmp";
        await fs.writeFile(temporary, JSON.stringify(config, null, 2), "utf8");
        await fs.rename(temporary, configPath(root));
        reply(res, 200, { role: input.role, config: config.roles[input.role] });
      } finally { writing = false; }
      return true;
    }
    reply(res, 404, { error: "Unknown dataset route" });
  } catch (error) { reply(res, 400, { error: error.message }); }
  return true;
}
