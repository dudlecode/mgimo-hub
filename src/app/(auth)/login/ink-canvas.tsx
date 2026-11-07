"use client";

import { useEffect, useRef } from "react";

// Чернила в воде: шейдер с «вихревым» fBm-шумом (domain warping). Монохром, в тёмной теме инвертирован.
const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `
precision mediump float;
uniform vec2 u_res; uniform float u_time; uniform float u_dark; uniform float u_bloom; uniform float u_clear;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p){ float v = 0.0; float a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = m * p; a *= 0.5; } return v; }
void main(){
  vec2 uv = gl_FragCoord.xy / u_res.y;
  vec2 c = vec2(0.5 * u_res.x / u_res.y, 0.5);
  float t = u_time * 0.035;
  vec2 p = uv * 0.85 + vec2(0.0, 0.15);
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(p + 3.6 * q + vec2(1.7, 9.2) + 0.6 * t), fbm(p + 3.6 * q + vec2(8.3, 2.8) - 0.4 * t));
  float f = fbm(p + 3.0 * r);
  float v = f * 1.2 + 0.28 * r.x;
  // плавный переход «бумага → тушь» с усиленным контрастом
  float ink = smoothstep(0.30, 0.86, v);
  ink = ink * ink * (3.0 - 2.0 * ink);
  // тонкие нити по изолиниям поля, как растекающиеся усики туши
  float lines = 1.0 - smoothstep(0.0, 0.05, abs(fract(v * 3.0) - 0.5) - 0.43);
  ink = clamp(ink + lines * smoothstep(0.30, 0.60, v) * (1.0 - ink) * 0.35, 0.0, 1.0);
  float d = length(uv - c);
  float R = u_bloom * 1.9;
  ink *= 1.0 - smoothstep(R - 0.55, R, d);
  ink *= 1.0 - u_clear * (1.0 - smoothstep(0.06, 0.42, d));
  vec3 paper = mix(vec3(0.980), vec3(0.039), u_dark);
  vec3 inkc = mix(vec3(0.03, 0.035, 0.05), vec3(0.58), u_dark);
  vec3 col = mix(paper, inkc, ink);
  col += (hash(gl_FragCoord.xy + fract(u_time)) - 0.5) * 0.022;
  gl_FragColor = vec4(col, 1.0);
}`;

const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

/** phase: intro — чернила растекаются из центра, под логотипом чистое пятно; ready — пятно затягивается. */
export function InkCanvas({ ready, instant }: { ready: boolean; instant: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const state = useRef({ ready, instant, readyAt: 0 });

  useEffect(() => {
    state.current.ready = ready;
    state.current.instant = instant;
    if (ready && !state.current.readyAt) state.current.readyAt = performance.now();
  }, [ready, instant]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: false, powerPreference: "low-power" });
    if (!gl) {
      canvas.dataset.fallback = "1";
      return;
    }
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      canvas.dataset.fallback = "1";
      return;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = (n: string) => gl.getUniformLocation(prog, n);
    const uRes = u("u_res"), uTime = u("u_time"), uDark = u("u_dark"), uBloom = u("u_bloom"), uClear = u("u_clear");

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scale = 0.6; // считаем в пониженном разрешении: чернилам резкость не нужна, а батарея скажет спасибо
    const resize = () => {
      const w = Math.max(1, Math.floor(canvas.clientWidth * scale));
      const h = Math.max(1, Math.floor(canvas.clientHeight * scale));
      // Высоту пересчитываем только при заметной разнице (поворот экрана): адресная строка телефона
      // при прокрутке меняет высоту на 50-80 px, и рисунок чернил «прыгал» бы при каждом её движении
      const heightJump = Math.abs(h - canvas.height) > canvas.height * 0.2;
      if (canvas.width !== w || heightJump) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };
    const start = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      resize();
      const s = state.current;
      const elapsed = (now - start) / 1000;
      const bloom = s.instant || reduce ? 1 : ease(elapsed / 2.4);
      const clear = s.instant || reduce ? 0 : s.ready && s.readyAt ? 1 - ease((now - s.readyAt) / 1100) : 1;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, 20 + elapsed);
      gl.uniform1f(uDark, document.documentElement.classList.contains("dark") ? 1 : 0);
      gl.uniform1f(uBloom, bloom);
      gl.uniform1f(uClear, clear);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reduce && document.visibilityState === "visible") raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const onVis = () => {
      if (document.visibilityState === "visible" && !reduce) {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return <canvas ref={ref} className="ink-canvas block h-full w-full" aria-hidden />;
}
