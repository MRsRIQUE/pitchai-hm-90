import { useEffect, useRef } from "react";
import { useReducedMotionSafe } from "@/hooks/use-reduced-motion-safe";

/**
 * Campo de partículas em canvas 2D, portado da landing de referência.
 *
 * Duas camadas com parâmetros distintos:
 *   fundo  — 150 pontos, rgba(255,255,255,.3), size 0.15,  10-20s, passo  80-140px
 *   frente —  50 pontos, rgba(255,255,255,.6), size 0.235,  5-10s, passo 100-200px
 *
 * `size` é multiplicado pelo rem da raiz e o raio desenhado é `size / 2`.
 * O canvas usa devicePixelRatio (o original desenha em 1x e borra em retina) e
 * o `dt` é limitado a 50ms — sem isso, uma aba em segundo plano volta com as
 * partículas teleportadas.
 *
 * Fora de cena o canvas encolhe para 1x1 e as partículas são descartadas: seis
 * campos de viewport inteira em dpr 2 seriam ~80MB de buffer parado.
 */

type Layer = {
  count: number;
  color: string;
  remSize: number;
  speedRange: [number, number];
  stepRange: [number, number];
  parallaxStrength: number;
};

const LAYERS: Layer[] = [
  {
    count: 150,
    color: "rgba(255, 255, 255, 0.3)",
    remSize: 0.15,
    speedRange: [10, 20],
    stepRange: [80, 140],
    parallaxStrength: 10,
  },
  {
    count: 50,
    color: "rgba(255, 255, 255, 0.6)",
    remSize: 0.235,
    speedRange: [5, 10],
    stepRange: [100, 200],
    parallaxStrength: 30,
  },
];

const PARALLAX_DURATION = 0.6;

type Particle = {
  color: string;
  size: number;
  stepRange: [number, number];
  speedRange: [number, number];
  parallaxStrength: number;
  x: number;
  y: number;
  t: number;
  duration: number;
  offsetX: number;
  offsetY: number;
  startOffsetX: number;
  startOffsetY: number;
  targetOffsetX: number;
  targetOffsetY: number;
  parallaxT: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
};

export function Particles({ scale = 1, className = "" }: { scale?: number; className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotionSafe();

  useEffect(() => {
    if (reduce) return undefined;

    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return undefined;

    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    let width = 0;
    let height = 0;
    let rem = 16;
    let particles: Particle[] = [];
    let raf = 0;
    let last = 0;
    let visible = false;

    // o original começa com o ponteiro no centro do container
    const mouse = { x: 0, y: 0 };

    const setNewTarget = (p: Particle) => {
      const [minStep, maxStep] = p.stepRange;
      const dx =
        (Math.random() - 0.5) * (maxStep - minStep) + (Math.random() > 0.5 ? minStep : -minStep);
      const dy =
        (Math.random() - 0.5) * (maxStep - minStep) + (Math.random() > 0.5 ? minStep : -minStep);
      p.startX = p.x;
      p.startY = p.y;
      p.targetX = Math.max(0, Math.min(p.x + dx, width));
      p.targetY = Math.max(0, Math.min(p.y + dy, height));
      p.t = 0;
      const [minSpeed, maxSpeed] = p.speedRange;
      p.duration = Math.random() * (maxSpeed - minSpeed) + minSpeed;
    };

    const build = () => {
      particles = [];
      LAYERS.forEach((layer) => {
        const total = Math.max(1, Math.round(layer.count * scale));
        for (let i = 0; i < total; i += 1) {
          const x = Math.random() * width;
          const y = Math.random() * height;
          const p: Particle = {
            color: layer.color,
            size: layer.remSize * rem,
            stepRange: layer.stepRange,
            speedRange: layer.speedRange,
            parallaxStrength: layer.parallaxStrength,
            x,
            y,
            t: 0,
            duration: 1,
            offsetX: 0,
            offsetY: 0,
            startOffsetX: 0,
            startOffsetY: 0,
            targetOffsetX: 0,
            targetOffsetY: 0,
            parallaxT: 1,
            startX: x,
            startY: y,
            targetX: x,
            targetY: y,
          };
          setNewTarget(p);
          particles.push(p);
        }
      });
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      width = wrap.clientWidth;
      height = wrap.clientHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      mouse.x = width / 2;
      mouse.y = height / 2;
      build();
    };

    const update = (p: Particle, dt: number) => {
      p.t += dt / p.duration;
      const t = Math.min(p.t, 1);
      p.x = p.startX + (p.targetX - p.startX) * t;
      p.y = p.startY + (p.targetY - p.startY) * t;
      if (t >= 1) setNewTarget(p);

      // o original usa width/4 como centro do parallax — não width/2
      const centerX = width / 4;
      const centerY = height / 4;
      const newOffsetX = ((mouse.x - centerX) / centerX) * p.parallaxStrength;
      const newOffsetY = ((mouse.y - centerY) / centerY) * p.parallaxStrength;

      if (
        Math.abs(p.targetOffsetX - newOffsetX) > 0.5 ||
        Math.abs(p.targetOffsetY - newOffsetY) > 0.5
      ) {
        p.startOffsetX = p.offsetX;
        p.startOffsetY = p.offsetY;
        p.targetOffsetX = newOffsetX;
        p.targetOffsetY = newOffsetY;
        p.parallaxT = 0;
      }

      if (p.parallaxT < 1) {
        p.parallaxT += dt / PARALLAX_DURATION;
        const pt = Math.min(p.parallaxT, 1);
        const eased = Math.sin((pt * Math.PI) / 2);
        p.offsetX = p.startOffsetX + (p.targetOffsetX - p.startOffsetX) * eased;
        p.offsetY = p.startOffsetY + (p.targetOffsetY - p.startOffsetY) * eased;
      }
    };

    const frame = (time: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible) return;

      const dt = last ? Math.min((time - last) / 1000, 0.05) : 0;
      last = time;

      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        update(p, dt);
        ctx.beginPath();
        ctx.arc(p.x + p.offsetX, p.y + p.offsetY, p.size / 2, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = wrap.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };

    const release = () => {
      particles = [];
      canvas.width = 1;
      canvas.height = 1;
      canvas.style.width = "0px";
      canvas.style.height = "0px";
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting === visible) return;
        visible = entry.isIntersecting;
        if (visible) {
          last = 0;
          resize();
        } else {
          release();
        }
      },
      { threshold: 0 },
    );

    const onResize = () => {
      if (visible) resize();
    };

    observer.observe(wrap);
    window.addEventListener("resize", onResize);
    document.addEventListener("mousemove", onMouseMove, { passive: true });
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("mousemove", onMouseMove);
    };
  }, [reduce, scale]);

  if (reduce) return null;

  return (
    <div className={`particles-block ${className}`} ref={wrapRef} aria-hidden="true">
      <canvas className="particles-canvas" ref={canvasRef} />
    </div>
  );
}

export default Particles;
