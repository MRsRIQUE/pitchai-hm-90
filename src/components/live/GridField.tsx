import { useEffect, useRef } from "react";

const GRID_GAP = 56;
const SAMPLE_STEP = 13;
const PULL = 30;
const RADIUS = 240;
const SPRING = 8;

interface Sample {
  sx: number;
  sy: number;
  ox: number;
  oy: number;
  tx: number;
  ty: number;
}

/**
 * Quadriculado de fundo deformável: o mouse "puxa" as linhas em direção ao
 * cursor com queda radial (mola, baseada em dt, independente do fps).
 * Performance: o grid parado vive num canvas offscreen e por frame só a
 * região do cursor é redesenhada (blit + banda deformada).
 */
export function GridField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const landing = document.querySelector(".landing");

    let color = "rgba(12, 12, 13, 0.055)";
    let cssW = 0;
    let cssH = 0;
    let dpr = 1;
    let staticCanvas: HTMLCanvasElement | null = null;
    let vLines: { x: number; samples: Sample[] }[] = [];
    let hLines: { y: number; samples: Sample[] }[] = [];
    let mouseX = -9999;
    let mouseY = -9999;
    let mouseActive = false;
    let raf = 0;
    let lastT = 0;
    let lastMoveT = 0;
    let animating = false;

    const start = () => {
      if (!animating) {
        animating = true;
        lastT = 0;
        raf = requestAnimationFrame(frame);
      }
    };
    const stop = () => {
      animating = false;
    };

    const readColor = () => {
      if (!landing) return;
      const v = getComputedStyle(landing).getPropertyValue("--grid-line").trim();
      if (v) color = v;
    };

    const rebuild = () => {
      vLines = [];
      hLines = [];
      for (let x = 0.5; x <= cssW; x += GRID_GAP) {
        const samples: Sample[] = [];
        for (let y = 0; y <= cssH; y += SAMPLE_STEP)
          samples.push({ sx: x, sy: y, ox: 0, oy: 0, tx: 0, ty: 0 });
        vLines.push({ x, samples });
      }
      for (let y = 0.5; y <= cssH; y += GRID_GAP) {
        const samples: Sample[] = [];
        for (let x = 0; x <= cssW; x += SAMPLE_STEP)
          samples.push({ sx: x, sy: y, ox: 0, oy: 0, tx: 0, ty: 0 });
        hLines.push({ y, samples });
      }
    };

    const drawStaticInto = (c: HTMLCanvasElement) => {
      const g = c.getContext("2d");
      if (!g) return;
      g.clearRect(0, 0, c.width, c.height);
      g.strokeStyle = color;
      g.lineWidth = 1;
      for (const line of vLines) {
        g.beginPath();
        line.samples.forEach((s, i) => {
          if (i === 0) g.moveTo(s.sx, s.sy);
          else g.lineTo(s.sx, s.sy);
        });
        g.stroke();
      }
      for (const line of hLines) {
        g.beginPath();
        line.samples.forEach((s, i) => {
          if (i === 0) g.moveTo(s.sx, s.sy);
          else g.lineTo(s.sx, s.sy);
        });
        g.stroke();
      }
    };

    const rebuildStatic = () => {
      if (!staticCanvas) {
        staticCanvas = document.createElement("canvas");
      }
      staticCanvas.width = canvas.width;
      staticCanvas.height = canvas.height;
      const g = staticCanvas.getContext("2d");
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawStaticInto(staticCanvas);
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      cssW = canvas.clientWidth;
      cssH = canvas.clientHeight;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      rebuild();
      rebuildStatic();
    };

    const pull = (dx: number, dy: number) => {
      const d = Math.hypot(dx, dy);
      const k = Math.exp(-d / (RADIUS / 3)) * PULL;
      if (k < 0.5) return [0, 0];
      const inv = d > 0.001 ? 1 / d : 0;
      return [-dx * inv * k, -dy * inv * k];
    };

    const drawDeformedLine = (
      line: { samples: Sample[] },
      axis: "x" | "y",
      band: number,
      k: number,
    ) => {
      let started = false;
      ctx.beginPath();
      for (const s of line.samples) {
        const pos = axis === "x" ? s.sy : s.sx;
        if (pos < band - k - 1 || pos > band + k + 1) {
          started = false;
          continue;
        }
        const px = s.sx + s.ox;
        const py = s.sy + s.oy;
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
    };

    const frame = (t: number) => {
      const dt = Math.min(0.05, lastT ? (t - lastT) / 1000 : 0.016);
      lastT = t;
      const ease = 1 - Math.exp(-SPRING * dt);

      const b = RADIUS + 32;
      let maxOffset = 0;

      for (const line of vLines) {
        if (line.x < mouseX - b || line.x > mouseX + b) continue;
        for (const s of line.samples) {
          if (s.sy < mouseY - b || s.sy > mouseY + b) continue;
          if (mouseActive) {
            const [tx, ty] = pull(s.sx - mouseX, s.sy - mouseY);
            s.tx = tx;
            s.ty = ty;
          } else {
            s.tx = 0;
            s.ty = 0;
          }
          s.ox += (s.tx - s.ox) * ease;
          s.oy += (s.ty - s.oy) * ease;
          const m = Math.max(Math.abs(s.ox), Math.abs(s.oy));
          if (m > maxOffset) maxOffset = m;
        }
      }
      for (const line of hLines) {
        if (line.y < mouseY - b || line.y > mouseY + b) continue;
        for (const s of line.samples) {
          if (s.sx < mouseX - b || s.sx > mouseX + b) continue;
          if (mouseActive) {
            const [tx, ty] = pull(s.sx - mouseX, s.sy - mouseY);
            s.tx = tx;
            s.ty = ty;
          } else {
            s.tx = 0;
            s.ty = 0;
          }
          s.ox += (s.tx - s.ox) * ease;
          s.oy += (s.ty - s.oy) * ease;
          const m = Math.max(Math.abs(s.ox), Math.abs(s.oy));
          if (m > maxOffset) maxOffset = m;
        }
      }

      const idle =
        (!mouseActive && maxOffset < 0.35) ||
        (mouseActive &&
          performance.now() - lastMoveT > 160 &&
          maxOffset < 0.35);
      if (idle) {
        stop();
        return;
      }

      ctx.clearRect(0, 0, cssW, cssH);
      if (staticCanvas) ctx.drawImage(staticCanvas, 0, 0, cssW, cssH);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      ctx.save();
      ctx.beginPath();
      ctx.rect(mouseX - b, mouseY - b, b * 2, b * 2);
      ctx.clip();

      for (const line of vLines) {
        if (line.x < mouseX - b || line.x > mouseX + b) continue;
        drawDeformedLine(line, "x", mouseY, b);
      }
      for (const line of hLines) {
        if (line.y < mouseY - b || line.y > mouseY + b) continue;
        drawDeformedLine(line, "y", mouseX, b);
      }
      ctx.restore();

      raf = requestAnimationFrame(frame);
    };

    const drawStatic = () => {
      ctx.clearRect(0, 0, cssW, cssH);
      if (staticCanvas) ctx.drawImage(staticCanvas, 0, 0, cssW, cssH);
    };

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
      mouseActive = mouseX >= 0 && mouseY >= 0 && mouseX <= rect.width && mouseY <= rect.height;
      if (mouseActive) start();
    };
    const onLeave = () => {
      mouseActive = false;
    };

    resize();
    readColor();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const mo = new MutationObserver(() => {
      readColor();
      rebuildStatic();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", onLeave);
    window.addEventListener("blur", onLeave);

    if (reduced) {
      drawStatic();
    } else {
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("blur", onLeave);
    };
  }, []);

  return (
    <div className="grid-field" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
