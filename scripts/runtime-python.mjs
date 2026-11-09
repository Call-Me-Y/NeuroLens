import fs from "node:fs";
import path from "node:path";

export const projectPython = (root) => path.join(root, ".venv", process.platform === "win32" ? "Scripts" : "bin", process.platform === "win32" ? "python.exe" : "python");
export const legacyPython = (root) => path.join(root, "..", "NLEnv", process.platform === "win32" ? "Scripts" : "bin", process.platform === "win32" ? "python.exe" : "python");

export function activePython(root) {
  if (process.env.NEUROLENS_PYTHON) return process.env.NEUROLENS_PYTHON;
  const project = projectPython(root);
  if (fs.existsSync(path.join(root, ".venv", ".neurolens-ready.json")) && fs.existsSync(project)) return project;
  return fs.existsSync(legacyPython(root)) ? legacyPython(root) : project;
}
