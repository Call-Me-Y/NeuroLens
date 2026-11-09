import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "apps", "web", "public", "brand");
mkdirSync(output, { recursive: true });
for (const name of ["icon.ico"]) {
  copyFileSync(join(root, "pic", name), join(output, name));
}
