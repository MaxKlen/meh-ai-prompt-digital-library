import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "out");
const templatePath = path.join(root, "scripts", "service-worker-template.js");

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

const template = await fs.readFile(templatePath, "utf8");
const files = (await walk(outDir))
  .filter((file) => path.basename(file) !== "sw.js")
  .sort();
const resources = [];
for (const file of files) {
  const bytes = await fs.readFile(file);
  const relative = path.relative(outDir, file).split(path.sep).join("/");
  resources.push({
    url: relative === "index.html" ? "/" : `/${relative}`,
    revision: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.byteLength,
  });
}

const versionInput = JSON.stringify(resources) + template;
const version = createHash("sha256").update(versionInput).digest("hex").slice(0, 16);
const worker = template
  .replace("__VERSION__", JSON.stringify(version))
  .replace("__PRECACHE__", JSON.stringify(resources));
await fs.writeFile(path.join(outDir, "sw.js"), worker);
console.log(`Generated out/sw.js (${resources.length} assets, ${resources.reduce((sum, item) => sum + item.bytes, 0)} bytes, version ${version})`);
