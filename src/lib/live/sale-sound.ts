/**
 * Som de "caixa registradora" gerado via WebAudio — sem arquivo externo.
 * Um clique curto (ruído) + dois sinos metálicos rápidos.
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

/** Destrava o áudio do navegador — chame dentro de um clique do usuário. */
export async function unlockSaleSound(): Promise<void> {
  const ac = getCtx();
  if (!ac) return;
  if (ac.state === "suspended") await ac.resume().catch(() => undefined);
}

function bell(ac: AudioContext, at: number, freq: number, gain: number) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, at);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(at);
  osc.stop(at + 0.5);
}

function clack(ac: AudioContext, at: number, gain: number) {
  const frames = Math.floor(ac.sampleRate * 0.06);
  const buf = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / frames, 3);
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 1200;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(filter);
  filter.connect(g);
  g.connect(ac.destination);
  src.start(at);
}

/** Toca o "ka-ching". `volume` de 0 a 1. */
export async function playSaleSound(volume = 0.8): Promise<void> {
  const ac = getCtx();
  if (!ac) return;
  if (ac.state === "suspended") await ac.resume().catch(() => undefined);
  const v = Math.max(0, Math.min(1, volume));
  const t = ac.currentTime + 0.02;
  clack(ac, t, 0.35 * v);
  bell(ac, t + 0.03, 1318.5, 0.22 * v); // E6
  bell(ac, t + 0.12, 1975.5, 0.18 * v); // B6
}
