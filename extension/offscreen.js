let audioContext = null;

function context() {
  const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext || audioContext.state === "closed") audioContext = new Ctor();
  return audioContext;
}

function bell(ac, at, frequency, volume) {
  const oscillator = ac.createOscillator();
  const gain = ac.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(frequency, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.48);
  oscillator.connect(gain);
  gain.connect(ac.destination);
  oscillator.start(at);
  oscillator.stop(at + 0.52);
}

async function playSaleSound(rawVolume) {
  const ac = context();
  if (!ac) throw new Error("WebAudio indisponível");
  if (ac.state === "suspended") await ac.resume();
  const volume = Math.max(0, Math.min(1, Number(rawVolume) || 0.8));
  const at = ac.currentTime + 0.02;

  const frames = Math.floor(ac.sampleRate * 0.07);
  const buffer = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < frames; index += 1) {
    data[index] = (Math.random() * 2 - 1) * Math.pow(1 - index / frames, 3);
  }
  const source = ac.createBufferSource();
  const filter = ac.createBiquadFilter();
  const gain = ac.createGain();
  source.buffer = buffer;
  filter.type = "highpass";
  filter.frequency.value = 1200;
  gain.gain.value = 0.38 * volume;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ac.destination);
  source.start(at);

  bell(ac, at + 0.03, 1318.5, 0.24 * volume);
  bell(ac, at + 0.14, 1975.5, 0.2 * volume);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "PITCHAI_OFFSCREEN_SALE_SOUND") return undefined;
  playSaleSound(message.volume)
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
  return true;
});
