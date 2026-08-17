"use client";

import { useEffect, useRef } from "react";

/**
 * Fundo de "líquido" roxo realista via shader WebGL2. O nível sobe na entrada
 * e fica ondulando/sloshando, com fluxo interno, brilho de superfície e
 * bolhas subindo — bem mais orgânico que ondas SVG.
 *
 * Renderiza em transparência (alpha) para que o glow/background da página
 * continue aparecendo acima do líquido.
 */

const VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform vec2 uResolution;
uniform float uTime;

vec3 permute(vec3 x){ return mod(((x * 34.0) + 1.0) * x, 289.0); }

float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm(vec2 p){
  float v = 0.5 * snoise(p);
  v += 0.25 * snoise(p * 2.13 + vec2(11.3, 7.1));
  v += 0.125 * snoise(p * 4.07 + vec2(3.7, 19.1));
  return v;
}

void main(){
  vec2 aspect = vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
  vec2 p = vUv * aspect;
  float t = uTime;

  // Entrada: o líquido sobe do fundo nos primeiros instantes.
  float intro = smoothstep(0.0, 2.8, t);
  float slosh = 0.05 * sin(t * 0.5) + 0.024 * sin(t * 1.17 + 1.3);
  float level = 0.56 * intro + slosh * intro;

  // Superfície ondulada (duas escalas de ruído).
  float surf = fbm(vec2(p.x * 2.1, t * 0.33)) * 0.045
             + fbm(vec2(p.x * 4.8, t * 0.62 + 41.0)) * 0.02;
  float surfY = level + surf;

  float body = 1.0 - smoothstep(surfY - 0.007, surfY + 0.007, vUv.y);
  if (body <= 0.003) { outColor = vec4(0.0); return; }

  float depth = clamp((surfY - vUv.y) / 0.55, 0.0, 1.0);

  // Fluxo interno (swirls) + caustics.
  vec2 flow = vec2(p.x * 1.5 + 0.4 * fbm(vec2(vUv.y * 1.2, t * 0.22 + 7.0)), vUv.y * 2.6 - t * 0.18);
  float interior = fbm(flow);
  float caustic = fbm(vec2(p.x * 3.4 + t * 0.5, vUv.y * 3.0 - t * 0.3));

  vec3 deep = vec3(0.06, 0.02, 0.14);
  vec3 mid  = vec3(0.18, 0.07, 0.34);
  vec3 top  = vec3(0.34, 0.19, 0.55);

  vec3 col = mix(mid, deep, depth);
  col = mix(col, top, smoothstep(0.0, 0.18, 1.0 - depth));
  col += (interior - 0.5) * 0.20 * (1.0 - depth * 0.35);
  col += caustic * 0.13 * (1.0 - depth * 0.5);

  // Linha de brilho na superfície.
  float surfLine = smoothstep(surfY, surfY - 0.014, vUv.y);
  col += vec3(0.62, 0.46, 0.85) * surfLine * (0.22 + 0.3 * interior);

  // Bolhas subindo.
  float bub = 0.0;
  for (float i = 0.0; i < 5.0; i++) {
    float sp = 0.10 + 0.045 * i;
    float bx = 0.5 + 0.45 * sin(t * (0.4 + 0.12 * i) + i * 2.4);
    float by = fract(i * 0.19 + t * sp) * (surfY + 0.02);
    vec2 bp = vec2(bx * aspect.x, by);
    float d = length(p - bp);
    float r = 0.005 + 0.003 * i;
    bub += smoothstep(r, 0.0, d);
  }
  col += bub * 0.3 * vec3(0.70, 0.60, 0.90);

  outColor = vec4(col * body, body);
}`;

export function LiquidBackground({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      depth: false,
      stencil: false,
      antialias: true,
      premultipliedAlpha: true,
    });
    if (!gl) return;

    function compile(type: number, src: string): WebGLShader {
      const s = gl!.createShader(type)!;
      gl!.shaderSource(s, src);
      gl!.compileShader(s);
      if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) {
        console.error("[LiquidBackground] shader:", gl!.getShaderInfoLog(s));
      }
      return s;
    }

    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("[LiquidBackground] link:", gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return;
    }

    const uRes = gl.getUniformLocation(program, "uResolution");
    const uTime = gl.getUniformLocation(program, "uTime");

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(1, Math.round(canvas!.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas!.clientHeight * dpr));
      if (canvas!.width !== w || canvas!.height !== h) {
        canvas!.width = w;
        canvas!.height = h;
      }
      gl!.viewport(0, 0, canvas!.width, canvas!.height);
    }
    resize();

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = mq.matches;
    let time = 0;
    let last = performance.now();
    let raf = 0;
    let running = false;

    function render() {
      gl!.useProgram(program);
      gl!.uniform2f(uRes, canvas!.width, canvas!.height);
      gl!.uniform1f(uTime, time);
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
    }

    function frame(now: number) {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      if (!reduced) time += dt;
      render();
      if (reduced) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    }

    function start() {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }

    function onMotion() {
      reduced = mq.matches;
      start();
    }
    mq.addEventListener("change", onMotion);
    start();

    const ro = new ResizeObserver(() => {
      resize();
      start();
    });
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mq.removeEventListener("change", onMotion);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
