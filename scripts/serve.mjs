import http from "node:http";
import { engineRequest } from "./engine-service.mjs";
import { apiSafetyRequest } from "./api-safety-service.mjs";
import { nerRequest } from "./ner-service.mjs";
import { localRecordsRequest } from "./local-records-service.mjs";
import { evaluationDirectory, scanEvaluationModels } from "./evaluation-models.mjs";
import { runtimeRequest } from "./runtime-service.mjs";
import { modelDownloadRequest } from "./model-download-service.mjs";
import { datasetRequest } from "./dataset-service.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../apps/web/dist",
);
const desktop = process.env.NEUROLENS_DESKTOP === "1";
const port = Number(process.env.PORT || (desktop ? 4174 : 4173));
const projectRoot = path.resolve(root, "../../..");
const browserProfile = path.basename(projectRoot).toLowerCase() === "app" &&
  path.basename(path.dirname(projectRoot)).toLowerCase() === "build"
  ? path.join(path.dirname(projectRoot), ".ui-profile")
  : path.join(projectRoot, ".ui-profile");
let lastClientActivity = Date.now();
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
try {
  await fs.access(path.join(root, "index.html"));
} catch {
  console.error("请先执行 npm run build 生成前端文件。");
  process.exit(1);
}
const server = http.createServer(async (req, res) => {
  lastClientActivity = Date.now();
  try {
    if (await engineRequest(req, res, projectRoot)) return;
    if (await apiSafetyRequest(req, res, projectRoot)) return;
    if (await nerRequest(req, res, projectRoot)) return;
    if (await localRecordsRequest(req, res, projectRoot)) return;
    if (await runtimeRequest(req, res, projectRoot)) return;
    if (await modelDownloadRequest(req, res, projectRoot)) return;
    if (await datasetRequest(req, res, projectRoot)) return;
    const pathname = decodeURIComponent(
      new URL(req.url, "http://127.0.0.1").pathname,
    );
    if (pathname === "/api/v1/models") {
      const origin = req.headers.origin;
      if (
        origin &&
        origin !== `http://127.0.0.1:${port}` &&
        origin !== `http://localhost:${port}`
      ) {
        res.writeHead(403);
        return res.end("Forbidden");
      }
      if (
        ![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)
      ) {
        res.writeHead(403);
        return res.end("Forbidden");
      }
      const requested = new URL(req.url, "http://127.0.0.1").searchParams.get(
        "path",
      );
      const defaultDirectory = path.join(projectRoot, "test");
      const directory = evaluationDirectory(projectRoot, requested);
      try {
        const models = await scanEvaluationModels(projectRoot, directory);
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        });
        return res.end(JSON.stringify({ directory, defaultDirectory, models }));
      } catch (error) {
        res.writeHead(400, {
          "Content-Type": "application/json; charset=utf-8",
        });
        return res.end(
          JSON.stringify({
            error: `无法读取目录：${error.code || "未知错误"}`,
          }),
        );
      }
    }
    if (pathname === "/health" || pathname === "/api/v1/capabilities") {
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      return res.end(
        JSON.stringify({
          status: "healthy",
          version: "0.1.0",
          mode: "local-compute",
          capabilities: {
            frontend: true,
            localRedaction: true,
            modelInference: true,
            externalApi: true,
          },
        }),
      );
    }
    if (pathname.startsWith("/api/")) {
      res.writeHead(501, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          error: "ENGINE_NOT_CONNECTED",
          message: "计算服务尚未接入；前端演示通过独立数据层提供。",
        }),
      );
    }
    let target = path.resolve(root, "." + pathname);
    if (target !== root && !target.startsWith(root + path.sep)) {
      res.writeHead(403);
      return res.end("Forbidden");
    }
    try {
      const stat = await fs.stat(target);
      if (!stat.isFile()) target = path.join(root, "index.html");
    } catch {
      if (path.extname(pathname)) {
        res.writeHead(404);
        return res.end("Not found");
      }
      target = path.join(root, "index.html");
    }
    const content = await fs.readFile(target);
    res.writeHead(200, {
      "Content-Type": types[path.extname(target)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control":
        path.extname(target) === ".html" ? "no-cache" : "public, max-age=3600",
    });
    res.end(content);
  } catch {
    res.writeHead(400);
    res.end("Bad request");
  }
});
async function openDesktopWindow() {
  const address = `http://127.0.0.1:${port}/home`;
  const edge = [
    path.join(process.env["PROGRAMFILES(X86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env.PROGRAMFILES || "", "Microsoft", "Edge", "Application", "msedge.exe"),
  ];
  for (const candidate of edge) {
    try {
      await fs.access(candidate);
      const browser = spawn(candidate, [`--app=${address}`, `--user-data-dir=${browserProfile}`, "--start-maximized", "--no-first-run", "--hide-crash-restore-bubble"], { cwd: projectRoot, windowsHide: false, stdio: "ignore" });
      browser.on("error", (error) => console.error(`无法打开应用窗口：${error.message}`));
      return;
    } catch { /* Try the other standard Edge installation path. */ }
  }
  spawn("rundll32.exe", ["url.dll,FileProtocolHandler", address], { windowsHide: true, stdio: "ignore" });
}
server.listen(port, "127.0.0.1", async () => {
  const address = `http://127.0.0.1:${port}/home`;
  console.log(`NeuroLens running at ${address}`);
  if (!desktop) return;
  await openDesktopWindow();
  const idleTimer = setInterval(() => {
    if (Date.now() - lastClientActivity > 5 * 60_000) {
      clearInterval(idleTimer);
      server.close(() => process.exit(0));
    }
  }, 30_000);
});
server.on("error", async (e) => {
  if (desktop && e.code === "EADDRINUSE") {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1500) });
      const health = await response.json();
      if (response.ok && health.status === "healthy" && health.mode === "local-compute") {
        await openDesktopWindow();
        setTimeout(() => process.exit(0), 1000);
        return;
      }
    } catch { /* Another service occupies this port. */ }
  }
  console.error(e.message);
  process.exit(1);
});
