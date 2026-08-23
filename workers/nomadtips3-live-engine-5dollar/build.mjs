import { readFile, mkdir, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";

const chunks = [];
for (let i = 1; i <= 6; i++) {
  const name = `source-parts/part${String(i).padStart(2, "0")}.b64`;
  chunks.push((await readFile(new URL(name, import.meta.url), "utf8")).trim());
}

const compressed = Buffer.from(chunks.join(""), "base64");
const source = gunzipSync(compressed);
await mkdir(new URL("src/", import.meta.url), { recursive: true });
await writeFile(new URL("src/index.js", import.meta.url), source);
console.log(`Rebuilt src/index.js (${source.length} bytes)`);
