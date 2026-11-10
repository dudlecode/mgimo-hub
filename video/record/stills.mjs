// Пробные кадры ролика без полного рендера: одна сборка, затем кадры по списку.
// Запуск из папки video: node record/stills.mjs 502 871 1237   (номера кадров)
// Кадры сохраняются в out/stills, по четыре на лист.
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { createRequire } from "node:module";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const require = createRequire(path.resolve("../package.json"));
const sharp = require("sharp");
const browserExecutable = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const frames = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n));
const out = path.resolve("out/stills");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
const composition = await selectComposition({ serveUrl, id: "MGIMOHub", browserExecutable });
console.log("кадров в ролике:", composition.durationInFrames);
const files = [];
for (const frame of frames) {
  const output = `${out}/f${String(frame).padStart(5, "0")}.jpg`;
  await renderStill({ composition, serveUrl, frame: Math.min(frame, composition.durationInFrames - 1), output, imageFormat: "jpeg", jpegQuality: 88, scale: 0.5, browserExecutable });
  files.push(output);
}
for (let i = 0; i < files.length; i += 4) {
  const part = files.slice(i, i + 4);
  await sharp({ create: { width: 1930, height: part.length > 2 ? 1090 : 540, channels: 3, background: "#7a7a7a" } })
    .composite(part.map((input, j) => ({ input, left: (j % 2) * 970, top: Math.floor(j / 2) * 550 })))
    .jpeg({ quality: 88 })
    .toFile(`${out}/sheet-${String(i / 4 + 1).padStart(2, "0")}.jpg`);
}
console.log("листов:", Math.ceil(files.length / 4));
