import fs from "node:fs/promises";
import path from "node:path";

const internalModels = new Set([
  "qwen3guard-gen-0.6b",
  "chinese-ner-per-addr-rbt3",
]);

export function isEvaluationModel(root, modelPath) {
  const relative = path.relative(path.join(root, "models"), path.resolve(modelPath));
  const [name, ...rest] = relative.split(path.sep);
  return !(internalModels.has(name.toLowerCase()) && rest.length === 0);
}

export function evaluationDirectory(root, requested) {
  const defaultDirectory = path.join(root, "test");
  const directory = requested ? path.resolve(requested) : defaultDirectory;
  return directory === path.join(root, "models") ? defaultDirectory : directory;
}

export async function scanEvaluationModels(root, directory) {
  const candidates = [
    directory,
    ...(await fs.readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(directory, entry.name)),
  ];
  const models = [];
  for (const dir of candidates) {
    if (!isEvaluationModel(root, dir)) continue;
    try {
      const config = JSON.parse(await fs.readFile(path.join(dir, "config.json"), "utf8"));
      const files = await fs.readdir(dir);
      if (!config.model_type) continue;
      models.push({
        name: path.basename(dir),
        path: dir,
        modelType: config.model_type,
        layers: config.num_hidden_layers,
        hidden: config.hidden_size,
        weights: files.some((file) => /\.(safetensors|bin)$/.test(file)),
      });
    } catch {
      // A directory without a readable model config is not a selectable model.
    }
  }
  return models;
}
