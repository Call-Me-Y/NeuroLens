import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = path.join(root, "apps/web");
const manifest = JSON.parse(
  await fs.readFile(path.join(app, "package.json"), "utf8"),
);
const visited = new Set();
const entries = [];
async function collect(name, from) {
  let cursor = from;
  let directory;
  while (true) {
    const candidate = path.join(cursor, "node_modules", name);
    try {
      await fs.access(path.join(candidate, "package.json"));
      directory = candidate;
      break;
    } catch {
      const parent = path.dirname(cursor);
      if (parent === cursor) throw new Error(`Missing package: ${name}`);
      cursor = parent;
    }
  }
  if (visited.has(directory)) return;
  visited.add(directory);
  const pkg = JSON.parse(
    await fs.readFile(path.join(directory, "package.json"), "utf8"),
  );
  const filenames = (await fs.readdir(directory)).filter((file) =>
    /^(licen[sc]e|copying|notice)(\.|$)/i.test(file),
  );
  const texts = [];
  for (const file of filenames) {
    if ((await fs.stat(path.join(directory, file))).isFile())
      texts.push(
        `${file}\n${await fs.readFile(path.join(directory, file), "utf8")}`,
      );
  }
  if (!texts.length) throw new Error(`License text missing: ${pkg.name}`);
  entries.push({
    name: pkg.name,
    text: `${pkg.name}@${pkg.version}\nLicense: ${pkg.license || "See license text"}\n${texts.join("\n\n")}`,
  });
  for (const dependency of Object.keys(pkg.dependencies || {}))
    await collect(dependency, directory);
}
for (const name of Object.keys(manifest.dependencies)) await collect(name, app);
entries.sort((a, b) => a.name.localeCompare(b.name));
await fs.mkdir(path.join(app, "public"), { recursive: true });
await fs.writeFile(
  path.join(app, "public/THIRD_PARTY_NOTICES.txt"),
  `NeuroLens frontend — third-party runtime dependencies\nGenerated from installed packages. Bundled distributions may include additional notices in their license text.\n\n${entries.map((entry) => entry.text).join("\n\n" + "=".repeat(80) + "\n\n")}\n`,
);
console.log(`Collected licenses for ${entries.length} runtime packages.`);
