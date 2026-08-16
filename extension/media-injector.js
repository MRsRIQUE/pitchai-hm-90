// Pitch AI — fonte virtual de vídeo/áudio para o TikTok LIVE.
// Executado no MAIN world para interceptar getUserMedia e RTCPeerConnection.
(function () {
  "use strict";

  if (window.__pitchaiMediaInjector) return;
  window.__pitchaiMediaInjector = true;

  const TAG = "[PitchAI Media]";
  const CONTROL_SOURCE = "__pitchai_media_control__";
  const ACK_SOURCE = "__pitchai_media_ack__";
  const PANEL_ORIGIN_RX = /^chrome-extension:\/\/[a-p]{32}$/;

  // Dispositivos virtuais: é o que faz a Pitch AI aparecer nos seletores
  // "Fonte de vídeo" / "Fonte de áudio" do TikTok, como o OBS faz no sistema.
  const VIRTUAL_GROUP = "pitchai-virtual";
  const VIRTUAL_VIDEO_ID = "pitchai-virtual-video";
  const VIRTUAL_AUDIO_ID = "pitchai-virtual-audio";
  const DEVICE_SPECS = {
    video: { deviceId: VIRTUAL_VIDEO_ID, kind: "videoinput", base: "Pitch AI — Câmera Virtual" },
    audio: { deviceId: VIRTUAL_AUDIO_ID, kind: "audioinput", base: "Pitch AI — Microfone Virtual" },
  };
  const TONE_LEVEL = 0.02; // ~-34 dBFS: acende o medidor sem sujar a transmissão
  const SILENCE_RMS = 0.002;

  const state = {
    enabled: false,
    published: false,
    force: true,
    tone: true,
    videoUrl: null,
    audioUrl: null,
    videoName: "",
    audioName: "",
    width: 1280,
    height: 720,
    fps: 30,
    loop: true,
    audioMode: "video",
    videoEl: null,
    audioEl: null,
    canvas: null,
    ctx: null,
    rafId: null,
    canvasStream: null,
    videoTrack: null,
    audioCtx: null,
    destNode: null,
    sourceGain: null,
    analyser: null,
    toneOsc: null,
    toneGain: null,
    toneTimer: null,
    videoSrcNode: null,
    audioSrcNode: null,
    audioTrack: null,
    pcs: new Set(),
    syntheticTracks: new WeakSet(),
    issuedTracks: new Set(),
    senderOriginals: new Map(),
    senderInjected: new Map(),
    pageGUM: null,
    pageEnumerate: null,
    insidePageGUM: false,
    insidePageEnumerate: false,
    lastConstraints: null,
  };

  window.__pitchaiMediaState = state;

  const mediaDevices = navigator.mediaDevices;
  const initialGUM = mediaDevices?.getUserMedia || null;
  const prototypeGUM = window.MediaDevices?.prototype?.getUserMedia || null;
  const nativeGUM = prototypeGUM
    ? prototypeGUM.call.bind(prototypeGUM, mediaDevices)
    : initialGUM
      ? initialGUM.bind(mediaDevices)
      : null;

  if (initialGUM && prototypeGUM && initialGUM !== prototypeGUM) {
    state.pageGUM = initialGUM;
  }

  const initialEnumerate = mediaDevices?.enumerateDevices || null;
  const prototypeEnumerate = window.MediaDevices?.prototype?.enumerateDevices || null;
  const nativeEnumerate = prototypeEnumerate
    ? prototypeEnumerate.call.bind(prototypeEnumerate, mediaDevices)
    : initialEnumerate
      ? initialEnumerate.bind(mediaDevices)
      : null;

  if (initialEnumerate && prototypeEnumerate && initialEnumerate !== prototypeEnumerate) {
    state.pageEnumerate = initialEnumerate;
  }

  const clampInt = (value, fallback, min, max) => {
    const number = Number.parseInt(value, 10);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  };

  const isLiveTrack = (track, kind) =>
    Boolean(track && track.kind === kind && track.readyState === "live");

  function markSynthetic(track) {
    if (track) state.syntheticTracks.add(track);
    return track;
  }

  function isSynthetic(track) {
    return Boolean(track && state.syntheticTracks.has(track));
  }

  function appendHiddenMedia(element) {
    element.style.cssText =
      "position:fixed;left:-99999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none";
    (document.documentElement || document.body).appendChild(element);
    return element;
  }

  function ensureVideoElement() {
    if (state.videoEl) return state.videoEl;
    const video = document.createElement("video");
    video.setAttribute("playsinline", "");
    video.preload = "auto";
    video.loop = state.loop;
    state.videoEl = appendHiddenMedia(video);
    return video;
  }

  function ensureAudioElement() {
    if (state.audioEl) return state.audioEl;
    const audio = document.createElement("audio");
    audio.preload = "auto";
    audio.loop = state.loop;
    state.audioEl = appendHiddenMedia(audio);
    return audio;
  }

  function ensureCanvas() {
    if (!state.canvas) {
      state.canvas = document.createElement("canvas");
      state.ctx = state.canvas.getContext("2d", { alpha: false });
    }
    if (state.canvas.width !== state.width) state.canvas.width = state.width;
    if (state.canvas.height !== state.height) state.canvas.height = state.height;
    return state.canvas;
  }

  // Sem vídeo carregado ainda o track precisa existir e continuar produzindo
  // quadros, senão o preview do TikTok nasce congelado.
  function drawPlaceholder(ctx, width, height) {
    ctx.fillStyle = "#0d0d12";
    ctx.fillRect(0, 0, width, height);

    const bar = Math.max(4, Math.round(height / 160));
    const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 500);
    ctx.fillStyle = "#a78bfa";
    ctx.fillRect(0, height - bar, width * pulse, bar);

    if (typeof ctx.fillText !== "function") return;
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = `${Math.round(height / 20)}px system-ui,Arial,sans-serif`;
    ctx.fillText("Pitch AI — fonte virtual", width / 2, height / 2 - height / 40);
    ctx.fillStyle = "#8a8a96";
    ctx.font = `${Math.round(height / 34)}px system-ui,Arial,sans-serif`;
    ctx.fillText(
      state.videoUrl ? "carregando vídeo…" : "escolha um vídeo no Estúdio da Pitch AI",
      width / 2,
      height / 2 + height / 18,
    );
  }

  function startCanvasPump() {
    ensureCanvas();
    if (state.rafId) return;

    const draw = () => {
      const { canvas, ctx, videoEl } = state;
      if (!canvas || !ctx) return;

      if (videoEl?.readyState >= 2 && videoEl.videoWidth && videoEl.videoHeight) {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const canvasRatio = canvas.width / canvas.height;
        const videoRatio = videoEl.videoWidth / videoEl.videoHeight;
        let width;
        let height;
        if (videoRatio > canvasRatio) {
          height = canvas.height;
          width = height * videoRatio;
        } else {
          width = canvas.width;
          height = width / videoRatio;
        }
        try {
          ctx.drawImage(
            videoEl,
            (canvas.width - width) / 2,
            (canvas.height - height) / 2,
            width,
            height,
          );
        } catch {}
      } else {
        drawPlaceholder(ctx, canvas.width, canvas.height);
      }
      state.rafId = requestAnimationFrame(draw);
    };

    state.rafId = requestAnimationFrame(draw);
  }

  function ensureVideoTrack(force = false) {
    const canvas = ensureCanvas();
    startCanvasPump();
    if (force || !isLiveTrack(state.videoTrack, "video")) {
      if (force && state.videoTrack?.readyState === "live") state.videoTrack.stop();
      state.canvasStream = canvas.captureStream(state.fps);
      state.videoTrack = markSynthetic(state.canvasStream.getVideoTracks()[0] || null);
      try {
        if (state.videoTrack) state.videoTrack.contentHint = "motion";
      } catch {}
    }
    return state.videoTrack;
  }

  function ensureAudioGraph() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error("Web Audio não está disponível nesta página");
    if (!state.audioCtx || state.audioCtx.state === "closed") {
      state.audioCtx = new AudioContextClass();
      state.destNode = null;
      state.sourceGain = null;
      state.analyser = null;
      state.toneOsc = null;
      state.toneGain = null;
      state.videoSrcNode = null;
      state.audioSrcNode = null;
    }
    const ctx = state.audioCtx;
    if (!state.destNode || !isLiveTrack(state.audioTrack, "audio")) {
      state.destNode = ctx.createMediaStreamDestination();
      state.audioTrack = markSynthetic(state.destNode.stream.getAudioTracks()[0] || null);
      state.sourceGain = null;
      state.toneGain = null;
    }

    // As fontes reais passam pelo sourceGain (que o analyser mede); o sinal
    // mínimo entra direto no destino, fora da medição, para não se auto-manter.
    if (!state.sourceGain) {
      state.sourceGain = ctx.createGain();
      state.sourceGain.connect(state.destNode);
      if (typeof ctx.createAnalyser === "function") {
        state.analyser = ctx.createAnalyser();
        state.analyser.fftSize = 1024;
        state.sourceGain.connect(state.analyser);
      }
    }
    if (!state.toneGain && typeof ctx.createOscillator === "function") {
      state.toneGain = ctx.createGain();
      state.toneGain.gain.value = 0;
      state.toneGain.connect(state.destNode);
      state.toneOsc = ctx.createOscillator();
      state.toneOsc.frequency.value = 120;
      state.toneOsc.connect(state.toneGain);
      try {
        state.toneOsc.start();
      } catch {}
    }

    startSilenceGuard();
    return ctx;
  }

  // "Nenhum áudio detectado" vem de um medidor RMS na página. Com o mix mudo
  // injetamos um sinal baixíssimo; ele se apaga sozinho quando o clipe tem som.
  function startSilenceGuard() {
    if (state.toneTimer) return;
    const buffer = new Float32Array(1024);
    state.toneTimer = setInterval(() => {
      const { analyser, toneGain, audioCtx } = state;
      if (!toneGain || !audioCtx) return;
      let rms = 0;
      if (analyser && typeof analyser.getFloatTimeDomainData === "function") {
        analyser.getFloatTimeDomainData(buffer);
        let sum = 0;
        for (let index = 0; index < buffer.length; index += 1) {
          sum += buffer[index] * buffer[index];
        }
        rms = Math.sqrt(sum / buffer.length);
      }
      const target = state.tone && rms < SILENCE_RMS ? TONE_LEVEL : 0;
      try {
        toneGain.gain.setTargetAtTime(target, audioCtx.currentTime, 0.15);
      } catch {
        toneGain.gain.value = target;
      }
    }, 400);
  }

  function disconnectNode(node) {
    try {
      node?.disconnect();
    } catch {}
  }

  async function configureAudio() {
    const audioContext = ensureAudioGraph();
    disconnectNode(state.videoSrcNode);
    disconnectNode(state.audioSrcNode);
    if (state.audioEl && state.audioMode !== "separate") state.audioEl.pause();

    if (state.audioMode === "video") {
      const video = ensureVideoElement();
      if (!state.videoSrcNode) state.videoSrcNode = audioContext.createMediaElementSource(video);
      state.videoSrcNode.connect(state.sourceGain);
    } else if (state.audioMode === "separate" && state.audioUrl) {
      const audio = ensureAudioElement();
      audio.loop = state.loop;
      if (audio.src !== state.audioUrl) audio.src = state.audioUrl;
      if (!state.audioSrcNode) state.audioSrcNode = audioContext.createMediaElementSource(audio);
      state.audioSrcNode.connect(state.sourceGain);
      try {
        await audio.play();
      } catch (error) {
        console.warn(TAG, "áudio separado não iniciou:", error?.message);
      }
    }
    // Sem fonte conectada (modo "none", ou "separate" sem arquivo) o destino
    // produz silêncio — o track continua válido para a página.

    // Não aguardamos o resume: sem um gesto na própria página o Chrome deixa a
    // promise pendente, o que penduraria a captura. O primeiro clique na aba
    // destrava pelo armPlaybackOnGesture().
    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }
    return state.audioTrack;
  }

  // tolerantPlay: usado quando a página pede a captura. Aí o stream precisa ser
  // entregue mesmo sem gesto do usuário — o vídeo começa no primeiro clique.
  async function prime({ restart = false, forceVideoTrack = false, tolerantPlay = false } = {}) {
    const video = ensureVideoElement();
    video.loop = state.loop;
    if (state.videoUrl && video.src !== state.videoUrl) video.src = state.videoUrl;
    if (restart) {
      try {
        video.currentTime = 0;
      } catch {}
      try {
        if (state.audioEl) state.audioEl.currentTime = 0;
      } catch {}
    }
    ensureVideoTrack(forceVideoTrack);
    await configureAudio();
    if (!state.videoUrl) return;
    if (!tolerantPlay) {
      await video.play();
      return;
    }
    try {
      await video.play();
    } catch (error) {
      console.warn(TAG, "vídeo aguardando gesto do usuário:", error?.message);
    }
  }

  function armPlaybackOnGesture() {
    const resume = async () => {
      if (state.audioCtx?.state === "suspended") {
        try {
          await state.audioCtx.resume();
        } catch {}
      }
      if (state.enabled && state.videoUrl && state.videoEl?.paused) {
        try {
          await state.videoEl.play();
        } catch {}
      }
    };
    document.addEventListener("pointerdown", resume, true);
    document.addEventListener("keydown", resume, true);
  }

  function requestedNumber(value) {
    if (value && typeof value === "object") {
      return value.exact ?? value.ideal ?? value.max ?? value.min;
    }
    return value;
  }

  function applyVideoConstraints(videoConstraints) {
    if (!videoConstraints || typeof videoConstraints !== "object") return false;
    const oldFps = state.fps;
    state.width = clampInt(requestedNumber(videoConstraints.width), state.width, 160, 3840);
    state.height = clampInt(requestedNumber(videoConstraints.height), state.height, 90, 2160);
    state.fps = clampInt(requestedNumber(videoConstraints.frameRate), state.fps, 1, 60);
    ensureCanvas();
    return oldFps !== state.fps;
  }

  function deviceLabel(kind) {
    const spec = DEVICE_SPECS[kind];
    const name =
      kind === "video"
        ? state.videoName
        : state.audioMode === "separate"
          ? state.audioName
          : state.videoName;
    return name ? `${spec.base} (${name})` : spec.base;
  }

  // Herdar do protótipo real mantém `instanceof MediaDeviceInfo` verdadeiro; as
  // propriedades próprias sombreiam os getters nativos (que exigiriam slots).
  function makeDeviceInfo(kind) {
    const spec = DEVICE_SPECS[kind];
    const fields = {
      deviceId: spec.deviceId,
      kind: spec.kind,
      label: deviceLabel(kind),
      groupId: VIRTUAL_GROUP,
    };
    const Base = window.InputDeviceInfo || window.MediaDeviceInfo || null;
    let info;
    try {
      info = Base ? Object.create(Base.prototype) : {};
    } catch {
      info = {};
    }
    for (const [key, value] of Object.entries(fields)) {
      try {
        Object.defineProperty(info, key, { value, enumerable: true, configurable: true });
      } catch {
        info[key] = value;
      }
    }
    const capabilities =
      kind === "video"
        ? {
            deviceId: spec.deviceId,
            groupId: VIRTUAL_GROUP,
            width: { min: 160, max: 3840 },
            height: { min: 90, max: 2160 },
            frameRate: { min: 1, max: 60 },
            aspectRatio: { min: 0.1, max: 10 },
            facingMode: [],
            resizeMode: ["none"],
          }
        : {
            deviceId: spec.deviceId,
            groupId: VIRTUAL_GROUP,
            channelCount: { min: 1, max: 2 },
            sampleRate: { min: 8000, max: 96000 },
            echoCancellation: [false],
            autoGainControl: [false],
            noiseSuppression: [false],
          };
    try {
      Object.defineProperty(info, "toJSON", { value: () => ({ ...fields }), configurable: true });
      Object.defineProperty(info, "getCapabilities", {
        value: () => capabilities,
        configurable: true,
      });
    } catch {}
    return info;
  }

  const isVirtualId = (id) => id === VIRTUAL_VIDEO_ID || id === VIRTUAL_AUDIO_ID;

  async function fakeEnumerateDevices() {
    let list = [];
    try {
      if (state.pageEnumerate && !state.insidePageEnumerate) {
        state.insidePageEnumerate = true;
        try {
          list = await state.pageEnumerate.call(mediaDevices);
        } finally {
          state.insidePageEnumerate = false;
        }
      } else if (nativeEnumerate) {
        list = await nativeEnumerate();
      }
    } catch (error) {
      console.warn(TAG, "enumerateDevices real falhou:", error?.message);
      list = [];
    }
    const devices = Array.from(list || []).filter((device) => !isVirtualId(device?.deviceId));
    // Só publicamos as fontes virtuais depois que o usuário preparou o Estúdio,
    // para não poluir a lista de quem não usa o recurso.
    if (state.published) devices.push(makeDeviceInfo("video"), makeDeviceInfo("audio"));
    return devices;
  }

  function announceDevices() {
    try {
      mediaDevices?.dispatchEvent?.(new Event("devicechange"));
    } catch {}
    try {
      if (typeof mediaDevices?.ondevicechange === "function") {
        mediaDevices.ondevicechange(new Event("devicechange"));
      }
    } catch {}
  }

  function installEnumerateHook() {
    if (!mediaDevices) return;
    try {
      Object.defineProperty(mediaDevices, "enumerateDevices", {
        configurable: true,
        enumerable: true,
        get: () => fakeEnumerateDevices,
        set: (candidate) => {
          if (typeof candidate === "function" && candidate !== fakeEnumerateDevices) {
            state.pageEnumerate = candidate;
          }
        },
      });
    } catch {
      try {
        mediaDevices.enumerateDevices = fakeEnumerateDevices;
      } catch {}
    }
    try {
      if (window.MediaDevices?.prototype) {
        Object.defineProperty(window.MediaDevices.prototype, "enumerateDevices", {
          configurable: true,
          writable: true,
          value: fakeEnumerateDevices,
        });
      }
    } catch {}
  }

  function collectIds(constraint, key) {
    const found = [];
    const push = (value) => {
      if (typeof value === "string") found.push(value);
      else if (Array.isArray(value)) value.forEach(push);
      else if (value && typeof value === "object") {
        push(value.exact);
        push(value.ideal);
      }
    };
    if (constraint && typeof constraint === "object") push(constraint[key]);
    return found;
  }

  function targetsVirtual(constraint) {
    if (!constraint || typeof constraint !== "object") return false;
    return (
      collectIds(constraint, "deviceId").some(isVirtualId) ||
      collectIds(constraint, "groupId").includes(VIRTUAL_GROUP)
    );
  }

  const wantsKind = (value) => value !== undefined && value !== null && value !== false;

  // A página lê label/getSettings() para casar o track com o item escolhido na
  // lista de dispositivos; sem isso o seletor não fixa a fonte da Pitch AI.
  function brandTrack(track, kind) {
    if (!track) return track;
    const spec = DEVICE_SPECS[kind];
    const nativeSettings =
      typeof track.getSettings === "function" ? track.getSettings.bind(track) : null;
    const nativeApply =
      typeof track.applyConstraints === "function" ? track.applyConstraints.bind(track) : null;
    const define = (key, value) => {
      try {
        Object.defineProperty(track, key, { value, configurable: true, writable: true });
      } catch {}
    };

    define("label", deviceLabel(kind));
    define("getSettings", () => {
      const base = nativeSettings ? nativeSettings() : {};
      const extra =
        kind === "video"
          ? { width: state.width, height: state.height, frameRate: state.fps, resizeMode: "none" }
          : {
              sampleRate: state.audioCtx?.sampleRate || 48000,
              channelCount: 2,
              echoCancellation: false,
              autoGainControl: false,
              noiseSuppression: false,
            };
      return { ...base, ...extra, deviceId: spec.deviceId, groupId: VIRTUAL_GROUP };
    });
    // Constraints que não fazem sentido para canvas/WebAudio não podem derrubar
    // o fluxo da página: aceitamos e ignoramos o que não se aplica.
    define("applyConstraints", async (constraints) => {
      if (kind === "video" && constraints) applyVideoConstraints(constraints);
      if (!nativeApply) return;
      try {
        await nativeApply(constraints);
      } catch {}
    });
    return track;
  }

  function cloneForConsumer(masterTrack, kind) {
    if (!masterTrack || masterTrack.readyState !== "live") return null;
    const clone = markSynthetic(masterTrack.clone());
    brandTrack(clone, kind);
    state.issuedTracks.add(clone);
    clone.addEventListener("ended", () => state.issuedTracks.delete(clone), { once: true });
    return clone;
  }

  async function buildSyntheticTracks({ video: wantVideo, audio: wantAudio, constraints }) {
    const fpsChanged = applyVideoConstraints(
      typeof constraints.video === "object" ? constraints.video : null,
    );
    state.lastConstraints = constraints;
    await prime({ forceVideoTrack: fpsChanged, tolerantPlay: true });

    const tracks = [];
    if (wantVideo) {
      const videoTrack = cloneForConsumer(ensureVideoTrack(), "video");
      if (videoTrack) tracks.push(videoTrack);
    }
    if (wantAudio) {
      const audioTrack = cloneForConsumer(state.audioTrack, "audio");
      if (audioTrack) tracks.push(audioTrack);
    }
    return tracks;
  }

  function passthrough(constraints) {
    if (state.pageGUM && !state.insidePageGUM) {
      state.insidePageGUM = true;
      try {
        return state.pageGUM.call(mediaDevices, constraints);
      } finally {
        state.insidePageGUM = false;
      }
    }
    if (nativeGUM) return nativeGUM(constraints);
    return Promise.reject(
      new DOMException("getUserMedia não está disponível", "NotSupportedError"),
    );
  }

  async function fakeGUM(rawConstraints) {
    const constraints = rawConstraints || {};
    const wantVideo = wantsKind(constraints.video);
    const wantAudio = wantsKind(constraints.audio);
    if (!wantVideo && !wantAudio) return passthrough(rawConstraints);
    // Enquanto o Estúdio não publicar as fontes, o hook é transparente — inclusive
    // para um deviceId que o TikTok tenha guardado de uma sessão anterior.
    if (!state.published) return passthrough(rawConstraints);

    const forced = state.enabled && state.force;
    const virtualVideo = wantVideo && (targetsVirtual(constraints.video) || forced);
    const virtualAudio = wantAudio && (targetsVirtual(constraints.audio) || forced);
    if (!virtualVideo && !virtualAudio) return passthrough(rawConstraints);

    // Escolher a fonte virtual no TikTok já liga o injetor, como o OBS faz.
    state.enabled = true;

    const tracks = await buildSyntheticTracks({
      video: virtualVideo,
      audio: virtualAudio,
      constraints,
    });

    // Combinação permitida: câmera virtual + microfone real, por exemplo.
    const realConstraints = {};
    if (wantVideo && !virtualVideo) realConstraints.video = constraints.video;
    if (wantAudio && !virtualAudio) realConstraints.audio = constraints.audio;
    if (Object.keys(realConstraints).length) {
      const realStream = await passthrough(realConstraints);
      tracks.push(...realStream.getTracks());
    }

    if (!tracks.length) {
      throw new DOMException("Não foi possível criar a mídia virtual", "NotReadableError");
    }
    return new MediaStream(tracks);
  }

  try {
    Object.defineProperty(fakeGUM, "name", { value: "getUserMedia" });
  } catch {}

  function installGumHook() {
    if (!mediaDevices) return;
    try {
      Object.defineProperty(mediaDevices, "getUserMedia", {
        configurable: true,
        enumerable: true,
        get: () => fakeGUM,
        set: (candidate) => {
          if (typeof candidate === "function" && candidate !== fakeGUM) state.pageGUM = candidate;
        },
      });
    } catch {
      try {
        mediaDevices.getUserMedia = fakeGUM;
      } catch {}
    }
    try {
      if (window.MediaDevices?.prototype) {
        Object.defineProperty(window.MediaDevices.prototype, "getUserMedia", {
          configurable: true,
          writable: true,
          value: fakeGUM,
        });
      }
    } catch {}
  }

  function installPeerConnectionHook() {
    const NativePeerConnection = window.RTCPeerConnection;
    if (!NativePeerConnection || NativePeerConnection.__pitchaiMediaHooked) return;
    const HookedPeerConnection = new Proxy(NativePeerConnection, {
      construct(target, args, newTarget) {
        const pc = Reflect.construct(
          target,
          args,
          newTarget === HookedPeerConnection ? target : newTarget,
        );
        state.pcs.add(pc);
        pc.addEventListener("connectionstatechange", () => {
          if (pc.connectionState === "closed") state.pcs.delete(pc);
        });
        return pc;
      },
    });
    try {
      Object.defineProperty(HookedPeerConnection, "__pitchaiMediaHooked", { value: true });
    } catch {}
    window.RTCPeerConnection = HookedPeerConnection;
    try {
      window.webkitRTCPeerConnection = HookedPeerConnection;
    } catch {}
  }

  function masterForKind(kind) {
    if (kind === "video") return ensureVideoTrack();
    if (kind === "audio") return state.audioTrack;
    return null;
  }

  async function injectIntoLiveSenders() {
    let replaced = 0;
    for (const pc of [...state.pcs]) {
      if (pc.connectionState === "closed") {
        state.pcs.delete(pc);
        continue;
      }
      let senders;
      try {
        senders = pc.getSenders();
      } catch {
        continue;
      }
      for (const sender of senders) {
        const kind = sender.track?.kind;
        if (kind !== "video" && kind !== "audio") continue;
        const master = masterForKind(kind);
        if (!isLiveTrack(master, kind)) continue;
        if (sender.track && !isSynthetic(sender.track) && !state.senderOriginals.has(sender)) {
          state.senderOriginals.set(sender, sender.track);
        }
        const replacement = cloneForConsumer(master, kind);
        if (!replacement) continue;
        try {
          await sender.replaceTrack(replacement);
          const previous = state.senderInjected.get(sender);
          if (previous?.readyState === "live") previous.stop();
          state.senderInjected.set(sender, replacement);
          replaced += 1;
        } catch {
          replacement.stop();
        }
      }
    }
    return replaced;
  }

  async function restoreLiveSenders() {
    const targets = [];
    for (const pc of [...state.pcs]) {
      if (pc.connectionState === "closed") continue;
      let senders;
      try {
        senders = pc.getSenders();
      } catch {
        continue;
      }
      for (const sender of senders) {
        if (isSynthetic(sender.track)) targets.push(sender);
      }
    }
    if (!targets.length) return { targets: 0, restored: 0, failed: 0, missing: 0 };

    let needVideo = false;
    let needAudio = false;
    for (const sender of targets) {
      const original = state.senderOriginals.get(sender);
      if (isLiveTrack(original, sender.track.kind) && !isSynthetic(original)) continue;
      if (sender.track.kind === "video") needVideo = true;
      if (sender.track.kind === "audio") needAudio = true;
    }

    let realStream = null;
    let acquireError = null;
    if (nativeGUM && (needVideo || needAudio)) {
      try {
        realStream = await nativeGUM({ video: needVideo, audio: needAudio });
      } catch (error) {
        acquireError = error;
      }
    }

    let restored = 0;
    let failed = 0;
    let missing = 0;
    for (const sender of targets) {
      const kind = sender.track.kind;
      let replacement = state.senderOriginals.get(sender);
      if (!isLiveTrack(replacement, kind) || isSynthetic(replacement)) {
        const master =
          kind === "video" ? realStream?.getVideoTracks()[0] : realStream?.getAudioTracks()[0];
        replacement = master?.clone() || null;
      }
      if (!replacement) {
        missing += 1;
        continue;
      }
      try {
        await sender.replaceTrack(replacement);
        const injected = state.senderInjected.get(sender);
        if (injected?.readyState === "live") injected.stop();
        state.senderInjected.delete(sender);
        state.senderOriginals.delete(sender);
        restored += 1;
      } catch {
        failed += 1;
        if (replacement !== state.senderOriginals.get(sender)) replacement.stop();
      }
    }
    realStream?.getTracks().forEach((track) => track.stop());
    return { targets: targets.length, restored, failed, missing, acquireError };
  }

  function stopUnusedIssuedTracks() {
    const stillSending = new Set(state.senderInjected.values());
    for (const track of [...state.issuedTracks]) {
      if (!stillSending.has(track) && track.readyState === "live") track.stop();
      if (track.readyState === "ended") state.issuedTracks.delete(track);
    }
  }

  function setObjectUrl(kind, file) {
    if (!(file instanceof Blob)) return;
    const urlKey = kind === "video" ? "videoUrl" : "audioUrl";
    const nameKey = kind === "video" ? "videoName" : "audioName";
    const element = kind === "video" ? state.videoEl : state.audioEl;
    if (state[urlKey]) URL.revokeObjectURL(state[urlKey]);
    state[urlKey] = URL.createObjectURL(file);
    state[nameKey] = typeof file.name === "string" ? file.name : `${kind} selecionado`;
    if (element) element.src = state[urlKey];
  }

  function applyConfig(payload = {}) {
    const config = payload.config || {};
    const oldFps = state.fps;
    state.width = clampInt(config.width, state.width, 160, 3840);
    state.height = clampInt(config.height, state.height, 90, 2160);
    state.fps = clampInt(config.fps, state.fps, 1, 60);
    state.loop = config.loop !== false;
    if (typeof config.force === "boolean") state.force = config.force;
    if (typeof config.tone === "boolean") state.tone = config.tone;
    if (["video", "separate", "none"].includes(config.audioMode)) {
      state.audioMode = config.audioMode;
    }
    if (payload.videoFile) setObjectUrl("video", payload.videoFile);
    if (payload.audioFile) setObjectUrl("audio", payload.audioFile);
    ensureCanvas();
    return oldFps !== state.fps;
  }

  function publicStatus(message = "") {
    return {
      enabled: state.enabled,
      published: state.published,
      force: state.force,
      tone: state.tone,
      deviceLabels: { video: deviceLabel("video"), audio: deviceLabel("audio") },
      videoName: state.videoName,
      audioName: state.audioName,
      width: state.width,
      height: state.height,
      fps: state.fps,
      audioMode: state.audioMode,
      peerConnections: state.pcs.size,
      message,
    };
  }

  async function runCommand(command, payload) {
    if (command === "status")
      return publicStatus(state.enabled ? "Fonte virtual ativa" : "Desligada");
    if (command === "refresh") {
      announceDevices();
      return publicStatus("Lista de dispositivos atualizada");
    }
    if (command === "activate") {
      const fpsChanged = applyConfig(payload);
      if (!state.videoUrl) throw new Error("Selecione um vídeo primeiro");
      if (state.audioMode === "separate" && !state.audioUrl) {
        throw new Error("Selecione o arquivo de áudio separado");
      }
      state.enabled = true;
      // Publica as fontes virtuais e avisa a página, para que apareçam nos
      // seletores mesmo com a janela de configuração já aberta.
      state.published = true;
      announceDevices();
      try {
        await prime({ restart: true, forceVideoTrack: fpsChanged });
      } catch (error) {
        if (error?.name === "NotAllowedError") {
          return publicStatus("Fonte preparada; clique na câmera/preview do TikTok para ativar");
        }
        state.enabled = false;
        state.published = false;
        announceDevices();
        throw error;
      }
      const replaced = await injectIntoLiveSenders();
      return publicStatus(
        replaced
          ? `${replaced} track(s) atualizado(s) no TikTok`
          : `Selecione "${DEVICE_SPECS.video.base}" em Fonte de vídeo e "${DEVICE_SPECS.audio.base}" em Fonte de áudio`,
      );
    }
    if (command === "deactivate") {
      state.enabled = false;
      state.published = false;
      announceDevices();
      const result = await restoreLiveSenders();
      stopUnusedIssuedTracks();
      state.videoEl?.pause();
      state.audioEl?.pause();
      if (state.audioCtx?.state === "running") await state.audioCtx.suspend();
      const pending = result.failed + result.missing;
      return publicStatus(
        pending
          ? `${pending} track(s) não restaurado(s); reinicie o preview do TikTok`
          : result.targets
            ? `${result.restored} track(s) real(is) restaurado(s)`
            : "Fonte virtual desligada",
      );
    }
    throw new Error("Comando de mídia desconhecido");
  }

  function isPanelMessage(event, data) {
    if (window.top !== window || data.relay) return false;
    if (!PANEL_ORIGIN_RX.test(event.origin)) return false;
    const frame = document.querySelector("#pitchai-frame iframe");
    if (!frame || event.source !== frame.contentWindow) return false;
    try {
      return new URL(frame.src).origin === event.origin;
    } catch {
      return false;
    }
  }

  function isRelayMessage(event, data) {
    return (
      window.top !== window &&
      data.relay === true &&
      event.source === window.parent &&
      event.origin === window.location.origin
    );
  }

  function relayToChildren(data) {
    for (let index = 0; index < window.frames.length; index += 1) {
      try {
        window.frames[index].postMessage({ ...data, relay: true }, window.location.origin);
      } catch {}
    }
  }

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || data.source !== CONTROL_SOURCE || typeof data.command !== "string") return;
    const fromPanel = isPanelMessage(event, data);
    const fromParent = isRelayMessage(event, data);
    if (!fromPanel && !fromParent) return;

    relayToChildren(data);
    Promise.resolve(runCommand(data.command, data.payload || {}))
      .then((status) => {
        if (!fromPanel) return;
        event.source?.postMessage(
          { source: ACK_SOURCE, requestId: data.requestId, ok: true, status },
          event.origin,
        );
      })
      .catch((error) => {
        console.warn(TAG, error);
        if (!fromPanel) return;
        event.source?.postMessage(
          {
            source: ACK_SOURCE,
            requestId: data.requestId,
            ok: false,
            error: error?.message || "Falha ao configurar a fonte virtual",
          },
          event.origin,
        );
      });
  });

  installGumHook();
  installEnumerateHook();
  installPeerConnectionHook();
  armPlaybackOnGesture();
  console.log(TAG, "pronto");
})();
