import { buildScenes, CAM_DEBUG } from "../src/scenes";
import { camAt, placeSegs, resolveCam } from "../src/footage";
buildScenes();
let problems = 0;
for (const sc of CAM_DEBUG) {
  const placed = placeSegs(sc.segs);
  const keys = [...sc.cam].filter((k) => !(k.s === 1 && (k.d ?? 40) < 16)).sort((a, b) => a.at - b.at);
  const chain = placed.map((_, i) => {
    let first = i; while (first > 0 && placed[first].cont) first--;
    let last = i; while (last < placed.length - 1 && placed[last + 1].cont) last++;
    return { first, last };
  });
  const segKeys = placed.map((_, i) => {
    const { first, last } = chain[i];
    const start = first === 0 ? -1e6 : placed[first].start;
    const end = last === placed.length - 1 ? 1e6 : placed[last + 1].start;
    return resolveCam(keys.filter((k) => k.at >= start && k.at < end));
  });
  const total = placed.at(-1)!.start + placed.at(-1)!.d;
  let prev: { s: number; tx: number; ty: number; plan: number } | null = null;
  let maxV = 0;
  for (let f = 0; f < total; f++) {
    let top = 0;
    placed.forEach((p, i) => { if (f >= p.start) top = i; });
    const c = camAt(f, segKeys[top]);
    const plan = chain[top].first;
    if (prev && prev.plan === plan) {
      const v = Math.max(Math.abs(c.s - prev.s), Math.abs(c.tx - prev.tx), Math.abs(c.ty - prev.ty));
      maxV = Math.max(maxV, v);
      if (v > 0.03) { console.log(`  рывок ${sc.id} кадр ${f}: ${v.toFixed(3)}`); problems++; }
    }
    prev = { ...c, plan };
  }
  const seen = new Set<number>();
  segKeys.forEach((ks, i) => {
    const { first, last } = chain[i];
    if (seen.has(first)) return; seen.add(first);
    const planEnd = last === placed.length - 1 ? total : placed[last + 1].start;
    ks.forEach((k, j) => {
      if (k.s <= 1.001 || !k.label) return;
      const settled = k.at + (k.d ?? 40);
      const next = Math.min(ks[j + 1]?.at ?? planEnd, planEnd, k.until ?? 1e9);
      if (next - settled < 24) { console.log(`  короткая остановка ${sc.id} план ${first}: ${next - settled} кадров (${k.label})`); problems++; }
    });
  });
  console.log(`${sc.id.padEnd(12)} кусков ${placed.length}, макс. скорость камеры ${maxV.toFixed(3)}/кадр`);
}
console.log(problems ? `проблем: ${problems}` : "рывков и коротких остановок нет");
