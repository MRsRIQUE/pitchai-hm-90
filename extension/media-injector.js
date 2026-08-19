// Pitch AI — fonte virtual de vídeo/áudio para o TikTok LIVE.
// Executado no MAIN world para interceptar getUserMedia e RTCPeerConnection.
(function () {
  "use strict";

  if (window.__pitchaiMediaInjector) return;
  window.__pitchaiMediaInjector = true;

  const TAG = "[PitchAI Media]";
  const CONTROL_SOURCE = "__pitchai_media_control__";
  const ACK_SOURCE = "__pitchai_media_ack__";
  // Conversa entre frames tem canal próprio: postada no window do frame de
  // cima, ela também chega ao content script de lá, que não pode confundi-la
  // com a resposta da fala (mesmo requestId).
  const RELAY_ACK_SOURCE = "__pitchai_media_relay_ack__";
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

  // Ducking: a voz da IA entra no mesmo microfone virtual, então o áudio do
  // vídeo precisa sair da frente enquanto ela fala.
  const DUCK_LEVEL = 0.12; // ~-18 dB: o vídeo continua audível, mas atrás da voz
  const DUCK_ATTACK_MS = 120; // descida rápida, ainda sem estalo
  const DUCK_RELEASE_MS = 400; // subida mais lenta: soa natural
  const GAIN_FADE_MS = 80; // mute/volume manual
  const VOICE_FADE_MS = 25; // abre e fecha a fala sem clique
  const VOICE_CLAIM_MS = 1500; // espera um frame filho assumir a fala
  const VOICE_MAX_MS = 180000; // teto de segurança de uma fala repassada
  // Quem captura o microfone virtual costuma ser um iframe. Ele avisa o frame
  // de cima, senão o status do topo diria "ninguém está usando o microfone".
  const OWNER_SOURCE = "__pitchai_media_owner__";
  // Clique/tecla do vendedor repassado do frame de cima para baixo: é o que
  // libera o AudioContext e o áudio do vídeo no frame que captura a live.
  const GESTURE_SOURCE = "__pitchai_media_gesture__";
  const OWNER_TTL_MS = 12000;
  const INACTIVE_CODE = "media-inactive"; // o content.js usa para cair no VB-Cable
  const INACTIVE_MSG = "Fonte virtual de áudio inativa: toque a voz pelo dispositivo";
  // O content script roda no mesmo mundo isolado da página; o canal dele só
  // pode mexer em áudio. Ligar/desligar a fonte continua sendo só do painel.
  const CONTENT_COMMANDS = new Set(["speak", "stopSpeak", "duck", "status"]);

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
    pumpStarted: false,
    drawTimer: null,
    lastRafAt: 0,
    pumpFps: 0,
    framesDrawn: 0,
    canvasStream: null,
    videoTrack: null,
    videoSource: "canvas", // "canvas" | "element"
    elementStream: null,
    elementTrack: null,
    blackTicks: 0,
    audioCtx: null,
    destNode: null,
    sourceGain: null,
    analyser: null,
    voiceGain: null, // voz da IA -> destNode (e analyser, senão o tom sobe por baixo dela)
    voiceGainValue: 1,
    voiceNodes: null, // fala em andamento: { source, envelope, finish }
    voiceActive: false,
    voiceDuckLevel: DUCK_LEVEL, // nível em uso pela fala atual
    voiceDuckAuto: true, // "abaixar o vídeo quando a IA falar" (padrão do painel)
    voiceDuckDefault: DUCK_LEVEL, // nível usado quando o "speak" não manda o dele
    videoGain: 1, // volume manual do áudio do vídeo
    videoMuted: false, // mute manual: manda sobre o ducking
    ducking: false, // derivado: duck manual OU fala em andamento
    duckManual: false,
    duckManualLevel: DUCK_LEVEL,
    childOwnerAt: 0, // último aviso de um frame filho que entrega o microfone
    ownerTicks: 0,
    toneOsc: null,
    toneGain: null,
    toneTimer: null,
    playTimer: null,
    mutedFallback: false,
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

  // O elemento precisa ficar imperceptível, mas NÃO "invisível" para o Chrome:
  // fora da viewport ou com opacity:0 o navegador suspende o decodificador de
  // vídeo e mantém só o áudio — que é exatamente o sintoma de áudio ok/vídeo
  // preto. Por isso: dentro da viewport, 2px, opacidade mínima porém não zero.
  function appendHiddenMedia(element) {
    element.style.cssText =
      "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;" +
      "z-index:2147483647;pointer-events:none;border:0;padding:0;margin:0";
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

  function paintFrame() {
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
      state.framesDrawn += 1;
    } else {
      drawPlaceholder(ctx, canvas.width, canvas.height);
    }
  }

  function startCanvasPump() {
    ensureCanvas();
    if (state.pumpStarted) return;
    state.pumpStarted = true;

    const rafLoop = () => {
      state.lastRafAt = Date.now();
      paintFrame();
      state.rafId = requestAnimationFrame(rafLoop);
    };
    try {
      state.rafId = requestAnimationFrame(rafLoop);
    } catch {}

    // O TikTok captura dentro de um iframe que pode não estar sendo renderizado
    // (display:none). Nesses documentos o requestAnimationFrame NUNCA dispara —
    // o canvas ficaria sem nenhum quadro e a página mostra "Sem feed de vídeo",
    // mesmo com o áudio (WebAudio não depende de renderização) funcionando.
    // Este timer garante os quadros e fica quieto quando o rAF dá conta.
    const startTimer = () => {
      clearInterval(state.drawTimer);
      state.pumpFps = state.fps;
      state.drawTimer = setInterval(
        () => {
          if (state.fps !== state.pumpFps) {
            startTimer();
            return;
          }
          if (Date.now() - state.lastRafAt < 250) return;
          paintFrame();
        },
        Math.max(16, Math.round(1000 / state.fps)),
      );
    };
    startTimer();
  }

  // Caminho alternativo ao canvas: captura direto do <video>, pela pipeline de
  // mídia. Não passa por drawImage, então sobrevive a GPUs cujo decodificador
  // decodifica mas não devolve o quadro para leitura (preto no canvas).
  function ensureElementTrack(force = false) {
    const video = ensureVideoElement();
    if (typeof video.captureStream !== "function") return null;
    if (force || !isLiveTrack(state.elementTrack, "video")) {
      try {
        state.elementStream = video.captureStream();
      } catch (error) {
        console.warn(TAG, "captureStream do elemento falhou:", error?.message);
        return null;
      }
      // O áudio continua saindo pelo grafo WebAudio; a trilha desta captura
      // fica desligada para não duplicar a voz na transmissão.
      state.elementStream.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
      state.elementTrack = markSynthetic(state.elementStream.getVideoTracks()[0] || null);
      if (state.elementTrack) {
        try {
          state.elementTrack.contentHint = "motion";
        } catch {}
      }
    }
    return state.elementTrack;
  }

  // Amostra barata: se o vídeo avança e o canvas segue totalmente preto, o
  // drawImage não está recebendo quadro nenhum.
  function canvasLooksBlack() {
    const { canvas, ctx } = state;
    if (!canvas || !ctx || !canvas.width || !canvas.height) return false;
    try {
      const points = [
        [0.25, 0.25],
        [0.75, 0.35],
        [0.5, 0.5],
        [0.5, 0.75],
      ];
      for (const [px, py] of points) {
        const pixel = ctx.getImageData(
          Math.floor(canvas.width * px),
          Math.floor(canvas.height * py),
          1,
          1,
        ).data;
        if (pixel[0] > 8 || pixel[1] > 8 || pixel[2] > 8) return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  async function switchToElementSource(reason) {
    if (state.videoSource === "element") return;
    const track = ensureElementTrack(true);
    if (!track) return;
    state.videoSource = "element";
    state.blackTicks = 0;
    console.warn(TAG, "trocando a fonte de vídeo para o elemento:", reason);
    try {
      await injectIntoLiveSenders();
    } catch (error) {
      console.warn(TAG, "troca de fonte não chegou aos envios:", error?.message);
    }
  }

  function ensureVideoTrack(force = false) {
    if (state.videoSource === "element") {
      const elementTrack = ensureElementTrack(force);
      if (elementTrack) return elementTrack;
      state.videoSource = "canvas"; // sem suporte a captureStream: volta ao canvas
    }

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
      state.voiceGain = null;
      state.toneOsc = null;
      state.toneGain = null;
      state.videoSrcNode = null;
      state.audioSrcNode = null;
    }
    const ctx = state.audioCtx;
    if (!state.destNode || !isLiveTrack(state.audioTrack, "audio")) {
      // Destino novo: a fala em andamento estaria tocando para o nó antigo.
      stopVoicePlayback();
      state.destNode = ctx.createMediaStreamDestination();
      state.audioTrack = markSynthetic(state.destNode.stream.getAudioTracks()[0] || null);
      // O analyser cai junto: preso ao sourceGain antigo, ele mediria silêncio
      // para sempre e o guarda deixaria o tom tocando por cima de tudo.
      state.sourceGain = null;
      state.analyser = null;
      state.voiceGain = null;
      state.toneGain = null;
    }

    // As fontes reais passam pelo sourceGain (que o analyser mede); o sinal
    // mínimo entra direto no destino, fora da medição, para não se auto-manter.
    if (!state.sourceGain) {
      state.sourceGain = ctx.createGain();
      // Nó recém-criado, ainda sem sinal: pode nascer no alvo sem estalar.
      state.sourceGain.gain.value = videoTargetGain();
      state.sourceGain.connect(state.destNode);
    }
    if (!state.analyser && typeof ctx.createAnalyser === "function") {
      state.analyser = ctx.createAnalyser();
      state.analyser.fftSize = 1024;
      state.sourceGain.connect(state.analyser);
    }
    // A voz também é medida pelo analyser: o guarda de silêncio mede o RMS ali
    // e, sem isso, o tom de 120 Hz tocaria por baixo da fala.
    if (!state.voiceGain) {
      state.voiceGain = ctx.createGain();
      state.voiceGain.gain.value = state.voiceGainValue;
      state.voiceGain.connect(state.destNode);
      if (state.analyser) state.voiceGain.connect(state.analyser);
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
      // Reavisa o frame de cima de tempos em tempos: o aviso tem validade, para
      // o status voltar a "ninguém capturando" quando a captura acabar.
      state.ownerTicks += 1;
      if (state.ownerTicks % 8 === 0 && ownsVirtualAudio()) announceAudioOwner();
    }, 400);
  }

  function disconnectNode(node) {
    try {
      node?.disconnect();
    } catch {}
  }

  const clampGain = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(2, Math.max(0, number)) : fallback;
  };

  const clampMs = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(5000, Math.max(10, number)) : fallback;
  };

  // Todo ajuste de volume vai por rampa: mexer no gain de uma vez estala.
  function rampGain(param, target, ms) {
    const ctx = state.audioCtx;
    if (!param || !ctx) return;
    const now = ctx.currentTime;
    const seconds = Math.max(0.01, ms / 1000);
    try {
      const current = param.value;
      param.cancelScheduledValues(now);
      param.setValueAtTime(current, now);
      param.linearRampToValueAtTime(target, now + seconds);
    } catch {
      try {
        param.value = target;
      } catch {}
    }
  }

  // O mute manual manda sobre o ducking, e o duck nunca levanta o volume:
  // ele só pode puxar para baixo o que o vendedor já escolheu.
  function videoTargetGain() {
    if (state.videoMuted) return 0;
    let target = state.videoGain;
    if (state.voiceActive) target = Math.min(target, state.voiceDuckLevel);
    if (state.duckManual) target = Math.min(target, state.duckManualLevel);
    return target;
  }

  function syncVideoGain(ms = GAIN_FADE_MS) {
    state.ducking = state.duckManual || state.voiceActive;
    if (state.sourceGain) rampGain(state.sourceGain.gain, videoTargetGain(), ms);
  }

  // Só o frame que entregou o microfone virtual à página pode falar: nos outros
  // o destino não vai a lugar nenhum e a fala se perderia em silêncio.
  function ownsVirtualAudio() {
    if (!state.published || !isLiveTrack(state.audioTrack, "audio")) return false;
    for (const track of state.issuedTracks) {
      if (isLiveTrack(track, "audio")) return true;
    }
    for (const track of state.senderInjected.values()) {
      if (isLiveTrack(track, "audio")) return true;
    }
    return false;
  }

  function announceAudioOwner() {
    if (window.top === window) return;
    try {
      window.parent.postMessage({ source: OWNER_SOURCE }, window.location.origin);
    } catch {}
  }

  // Vale para a aba inteira: este frame entrega o microfone virtual, ou um
  // filho avisou que entrega.
  function audioOwnerInTab() {
    return ownsVirtualAudio() || Date.now() - state.childOwnerAt < OWNER_TTL_MS;
  }

  function inactiveError(message) {
    const error = new Error(message || INACTIVE_MSG);
    error.code = INACTIVE_CODE;
    return error;
  }

  function releaseVoiceNodes(nodes) {
    // Depois do fade: desconectar no mesmo instante cortaria a cauda da fala.
    setTimeout(() => {
      disconnectNode(nodes.source);
      disconnectNode(nodes.envelope);
    }, VOICE_FADE_MS + 80);
  }

  // Corta a fala em andamento (comando "stopSpeak", troca de destino, nova
  // fala). A promise do "speak" correspondente resolve como não concluída.
  function stopVoicePlayback() {
    const nodes = state.voiceNodes;
    if (!nodes) return false;
    state.voiceNodes = null;
    rampGain(nodes.envelope.gain, 0, VOICE_FADE_MS);
    try {
      nodes.source.onended = null;
    } catch {}
    try {
      nodes.source.stop((state.audioCtx?.currentTime || 0) + VOICE_FADE_MS / 1000);
    } catch {}
    nodes.finish?.(false);
    return true;
  }

  async function resumeAudioContext(ctx) {
    if (ctx.state === "running") return;
    // Sem gesto na página o resume fica pendente para sempre: não dá para
    // esperar por ele, senão a fala pendura o content.js.
    try {
      await Promise.race([ctx.resume(), new Promise((resolve) => setTimeout(resolve, 600))]);
    } catch {}
  }

  async function toArrayBuffer(value) {
    if (!value) return null;
    if (value instanceof ArrayBuffer) return value.byteLength ? value.slice(0) : null;
    if (ArrayBuffer.isView(value)) {
      return value.byteLength
        ? value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
        : null;
    }
    if (typeof Blob !== "undefined" && value instanceof Blob) {
      const buffer = await value.arrayBuffer();
      return buffer.byteLength ? buffer : null;
    }
    return null;
  }

  function decodeVoice(ctx, data) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ok = (buffer) => {
        if (settled) return;
        settled = true;
        if (buffer) resolve(buffer);
        else reject(new Error("Não foi possível decodificar a voz"));
      };
      const fail = (error) => {
        if (settled) return;
        settled = true;
        reject(new Error(error?.message || "Não foi possível decodificar a voz"));
      };
      try {
        const maybe = ctx.decodeAudioData(data, ok, fail);
        if (maybe && typeof maybe.then === "function") maybe.then(ok, fail);
      } catch (error) {
        fail(error);
      }
    });
  }

  // Toca a voz da IA dentro do microfone virtual e só resolve quando ela
  // termina — é isso que mantém o content.js sincronizado com a fala.
  async function speakVoice(payload = {}) {
    if (!ownsVirtualAudio()) throw inactiveError();
    const data = await toArrayBuffer(payload.audio);
    if (!data) throw new Error("O áudio da voz chegou vazio");

    const ctx = ensureAudioGraph();
    await resumeAudioContext(ctx);
    if (ctx.state !== "running") {
      throw inactiveError("Áudio suspenso: clique uma vez na página do TikTok");
    }

    const buffer = await decodeVoice(ctx, data);
    stopVoicePlayback(); // uma fala por vez

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const envelope = ctx.createGain();
    envelope.gain.value = 0;
    source.connect(envelope);
    envelope.connect(state.voiceGain);

    state.voiceGainValue = clampGain(payload.gain, state.voiceGainValue);
    rampGain(state.voiceGain.gain, state.voiceGainValue, VOICE_FADE_MS);
    // Nível da fala manda; sem ele vale o padrão do painel (1 = não abaixa).
    state.voiceDuckLevel = clampGain(
      payload.duckLevel,
      state.voiceDuckAuto ? state.voiceDuckDefault : 1,
    );
    state.voiceActive = true;
    syncVideoGain(clampMs(payload.attackMs, DUCK_ATTACK_MS));

    const releaseMs = clampMs(payload.releaseMs, DUCK_RELEASE_MS);
    const nodes = { source, envelope, finish: null, guard: 0, done: false };
    state.voiceNodes = nodes;

    const startedAt = Date.now();
    const spoke = await new Promise((resolve) => {
      nodes.finish = (value) => {
        if (nodes.done) return;
        nodes.done = true;
        clearTimeout(nodes.guard);
        if (state.voiceNodes === nodes) state.voiceNodes = null;
        releaseVoiceNodes(nodes);
        state.voiceActive = false;
        syncVideoGain(releaseMs);
        resolve(value);
      };
      // Se o contexto for suspenso no meio, o onended nunca chega: o teto pela
      // duração do buffer impede que a fala prenda quem está esperando.
      nodes.guard = setTimeout(
        () => nodes.finish(false),
        Math.round(buffer.duration * 1000) + 1200,
      );
      source.onended = () => nodes.finish(true);
      rampGain(envelope.gain, 1, VOICE_FADE_MS);
      try {
        source.start();
      } catch (error) {
        console.warn(TAG, "voz não iniciou:", error?.message);
        nodes.finish(false);
      }
    });

    return {
      ...publicStatus(spoke ? "Voz reproduzida no microfone virtual" : "Fala interrompida"),
      spoke,
      durationMs: Date.now() - startedAt,
    };
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

    // O mute manual e o ducking valem para a fonte nova também: reconfigurar
    // não pode devolver o volume cheio no meio de uma fala.
    syncVideoGain();

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
    await startPlayback(video, tolerantPlay);
    startPlaybackWatchdog();
  }

  // Autoplay: o Chrome só libera play() sem gesto se o elemento estiver mudo —
  // e o clique do usuário acontece no iframe do painel, que não vale como gesto
  // para esta página. Então tocamos mudo para os quadros fluírem e tiramos o
  // mudo no primeiro clique da página, que é quando o áudio poderia sair.
  async function startPlayback(video, tolerant) {
    try {
      video.muted = false;
      await video.play();
      state.mutedFallback = false;
      return;
    } catch (error) {
      if (error?.name !== "NotAllowedError" && !tolerant) throw error;
    }
    video.muted = true;
    try {
      await video.play();
      state.mutedFallback = true;
    } catch (error) {
      state.mutedFallback = false;
      console.warn(TAG, "vídeo não iniciou:", error?.message);
      if (!tolerant) throw error;
    }
  }

  // Cobre o caso de o elemento parar sozinho (troca de src, aba em segundo
  // plano) enquanto a fonte virtual está no ar.
  function startPlaybackWatchdog() {
    if (state.playTimer) return;
    state.playTimer = setInterval(() => {
      const video = state.videoEl;
      if (!state.enabled || !state.videoUrl || !video) return;
      if (video.paused) {
        startPlayback(video, true).catch(() => {});
        return;
      }
      // Tocando e com o canvas totalmente preto: o quadro decodificado não está
      // chegando ao drawImage (falha de readback do decodificador por hardware).
      // Depois de ~6s assim, trocamos para a captura direta do elemento.
      if (state.videoSource !== "canvas" || video.currentTime < 0.3) return;
      state.blackTicks = canvasLooksBlack() ? state.blackTicks + 1 : 0;
      if (state.blackTicks >= 3) {
        switchToElementSource("canvas preto com o vídeo tocando");
      }
    }, 2000);
  }

  // Gesto do usuário vale por DOCUMENTO: clicar no topo não destrava o
  // AudioContext nem tira o mudo do iframe que entregou o microfone virtual — e
  // é lá que a fala e o ducking acontecem. Sem isso, "clique uma vez na página
  // do TikTok" destravava o frame errado e a voz caía no dispositivo. O aviso
  // só anda para BAIXO na árvore de frames, então não há ciclo.
  function relayGestureToChildren() {
    for (let index = 0; index < window.frames.length; index += 1) {
      try {
        window.frames[index].postMessage({ source: GESTURE_SOURCE }, window.location.origin);
      } catch {}
    }
  }

  async function onUserGesture() {
    relayGestureToChildren();
    if (state.audioCtx?.state === "suspended") {
      try {
        await state.audioCtx.resume();
      } catch {}
    }
    const video = state.videoEl;
    if (!state.enabled || !state.videoUrl || !video) return;
    if (state.mutedFallback && video.muted) {
      video.muted = false;
      state.mutedFallback = false;
    }
    if (video.paused) {
      try {
        await video.play();
      } catch {}
    }
  }

  function armPlaybackOnGesture() {
    document.addEventListener("pointerdown", onUserGesture, true);
    document.addEventListener("keydown", onUserGesture, true);
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
          ? state.videoSource === "element"
            ? { resizeMode: "none" } // captura direta: vale a resolução do arquivo
            : { width: state.width, height: state.height, frameRate: state.fps, resizeMode: "none" }
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
    // Entregamos o microfone virtual: o frame de cima precisa saber, é ele que
    // responde o status para o painel e para o content script.
    if (kind === "audio") announceAudioOwner();
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
          // Um envio que nasce depois da troca de fonte precisa nascer com ela.
          if (
            pc.connectionState === "connected" &&
            state.enabled &&
            state.videoSource === "element"
          ) {
            injectIntoLiveSenders().catch(() => {});
          }
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
    // O painel manda o ducking automático junto do activate: assim a escolha
    // do vendedor volta sozinha depois de recarregar a aba.
    if (typeof config.duckAuto === "boolean") state.voiceDuckAuto = config.duckAuto;
    if (config.duckAutoLevel !== undefined) {
      state.voiceDuckDefault = clampGain(config.duckAutoLevel, state.voiceDuckDefault);
    }
    if (payload.videoFile) setObjectUrl("video", payload.videoFile);
    if (payload.audioFile) setObjectUrl("audio", payload.audioFile);
    ensureCanvas();
    return oldFps !== state.fps;
  }

  // "decodificados" é a prova definitiva: se o tempo do vídeo avança e esse
  // contador não, quem parou foi o decodificador — não o nosso laço de desenho.
  function videoDiagnostics() {
    const video = state.videoEl;
    if (!video) return { elemento: "ausente" };
    let decoded = null;
    try {
      decoded =
        video.getVideoPlaybackQuality?.().totalVideoFrames ?? video.webkitDecodedFrameCount ?? null;
    } catch {}
    return {
      ready: video.readyState,
      paused: video.paused,
      muted: video.muted,
      tempo: Math.round((video.currentTime || 0) * 10) / 10,
      largura: video.videoWidth,
      decodificados: decoded,
      erro: video.error?.message || null,
    };
  }

  function publicStatus(message = "") {
    return {
      video: videoDiagnostics(),
      videoSource: state.videoSource,
      enabled: state.enabled,
      published: state.published,
      force: state.force,
      tone: state.tone,
      muted: state.mutedFallback,
      videoMuted: state.videoMuted,
      videoGain: state.videoGain,
      ducking: state.ducking,
      duckLevel: state.duckManual ? state.duckManualLevel : state.voiceDuckLevel,
      voiceActive: state.voiceActive,
      voiceGain: state.voiceGainValue,
      duckAuto: state.voiceDuckAuto,
      duckAutoLevel: state.voiceDuckDefault,
      audioOwner: audioOwnerInTab(),
      audioOwnerHere: ownsVirtualAudio(),
      audioContext: state.audioCtx?.state || "ausente",
      playing: Boolean(state.videoEl && !state.videoEl.paused),
      framesDrawn: state.framesDrawn,
      rafAlive: Date.now() - state.lastRafAt < 1000,
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

  async function runCommand(command, payload = {}) {
    if (command === "status")
      return publicStatus(state.enabled ? "Fonte virtual ativa" : "Desligada");
    if (command === "refresh") {
      announceDevices();
      return publicStatus("Lista de dispositivos atualizada");
    }
    // Mute/volume manual do áudio do vídeo. Fica guardado no state, então
    // sobrevive a "refresh", troca de fonte e reconfiguração do grafo.
    if (command === "audio") {
      if (typeof payload.muted === "boolean") state.videoMuted = payload.muted;
      if (payload.gain !== undefined) state.videoGain = clampGain(payload.gain, state.videoGain);
      syncVideoGain();
      return publicStatus(
        state.videoMuted
          ? "Áudio do vídeo mudo"
          : `Áudio do vídeo em ${Math.round(state.videoGain * 100)}%`,
      );
    }
    // Ducking manual (o do "speak" é automático e independe deste).
    if (command === "duck") {
      const on = Boolean(payload.on);
      state.duckManual = on;
      if (payload.level !== undefined) {
        state.duckManualLevel = clampGain(payload.level, DUCK_LEVEL);
      }
      syncVideoGain(
        on
          ? clampMs(payload.attackMs, DUCK_ATTACK_MS)
          : clampMs(payload.releaseMs, DUCK_RELEASE_MS),
      );
      return publicStatus(on ? "Áudio do vídeo abaixado" : "Áudio do vídeo restaurado");
    }
    // Padrão do ducking automático da fala (chave do painel). Não mexe no
    // volume agora: vale a partir da próxima fala que não mandar o nível dela.
    if (command === "duckAuto") {
      if (payload.on !== undefined) state.voiceDuckAuto = Boolean(payload.on);
      if (payload.level !== undefined) {
        state.voiceDuckDefault = clampGain(payload.level, DUCK_LEVEL);
      }
      return publicStatus(
        state.voiceDuckAuto
          ? `Ao falar, o vídeo cai para ${Math.round(state.voiceDuckDefault * 100)}%`
          : "O vídeo não abaixa quando a IA fala",
      );
    }
    if (command === "speak") return speakVoice(payload);
    if (command === "stopSpeak") {
      const cut = stopVoicePlayback();
      return publicStatus(cut ? "Fala interrompida" : "Nenhuma fala em andamento");
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
      // Sem gesto na página o vídeo só toca mudo e o AudioContext fica suspenso:
      // é preciso um clique na própria página do TikTok para liberar o áudio.
      const needsClick = state.mutedFallback || state.audioCtx?.state === "suspended";
      const base = replaced
        ? `${replaced} track(s) atualizado(s) no TikTok`
        : `Selecione "${DEVICE_SPECS.video.base}" em Fonte de vídeo e "${DEVICE_SPECS.audio.base}" em Fonte de áudio`;
      return publicStatus(
        needsClick ? `${base} · clique uma vez na página do TikTok para liberar o áudio` : base,
      );
    }
    if (command === "deactivate") {
      state.enabled = false;
      state.published = false;
      state.mutedFallback = false;
      // Suspender o contexto com uma fala tocando congelaria o onended: quem
      // pediu a voz ficaria esperando até o teto de segurança.
      stopVoicePlayback();
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

  // O content.js roda no mundo isolado da MESMA janela, então a mensagem dele
  // volta com event.source === window. A página consegue forjar isso, por isso
  // a allowlist CONTENT_COMMANDS limita o estrago possível ao áudio.
  function isContentMessage(event, data) {
    return !data.relay && event.source === window && event.origin === window.location.origin;
  }

  function relayToChildren(data) {
    for (let index = 0; index < window.frames.length; index += 1) {
      try {
        window.frames[index].postMessage({ ...data, relay: true }, window.location.origin);
      } catch {}
    }
  }

  function isChildFrame(source) {
    for (let index = 0; index < window.frames.length; index += 1) {
      try {
        if (window.frames[index] === source) return true;
      } catch {}
    }
    return false;
  }

  function postAck(target, origin, source, message) {
    try {
      target?.postMessage({ source, ...message }, origin);
    } catch {}
  }

  // Quem responde ao pedido: o painel/content recebem o ack direto; um pedido
  // que veio por relay é respondido para o frame de cima, que repassa adiante.
  function makeResponder(event, data, origins) {
    if (origins.fromPanel || origins.fromContent) {
      const target = event.source;
      const origin = event.origin;
      return {
        claim() {},
        finish(result) {
          postAck(target, origin, ACK_SOURCE, {
            requestId: data.requestId,
            ok: Boolean(result.ok),
            status: result.status,
            error: result.error,
            code: result.code,
          });
        },
      };
    }
    const origin = window.location.origin;
    return {
      claim() {
        postAck(window.parent, origin, RELAY_ACK_SOURCE, {
          requestId: data.requestId,
          phase: "claim",
        });
      },
      finish(result) {
        postAck(window.parent, origin, RELAY_ACK_SOURCE, {
          requestId: data.requestId,
          phase: "done",
          ok: Boolean(result.ok),
          status: result.status,
          error: result.error,
          code: result.code,
        });
      },
    };
  }

  const relayWaits = new Map();
  let relaySeq = 0;

  function settleRelayWait(requestId, result) {
    const wait = relayWaits.get(requestId);
    if (!wait) return;
    relayWaits.delete(requestId);
    clearTimeout(wait.claimTimer);
    clearTimeout(wait.doneTimer);
    wait.responder.finish(result);
  }

  function handleRelayAck(event, data) {
    if (event.origin !== window.location.origin || !isChildFrame(event.source)) return;
    const wait = relayWaits.get(data.requestId);
    if (!wait) return;
    if (data.phase === "claim") {
      wait.claimed = true;
      clearTimeout(wait.claimTimer);
      wait.responder.claim(); // propaga o "assumi" para cima na cadeia de frames
      return;
    }
    settleRelayWait(data.requestId, {
      ok: data.ok,
      status: data.status,
      error: data.error,
      code: data.code,
    });
  }

  // "speak" é o único comando que precisa chegar em UM frame específico: o que
  // entregou o microfone virtual. No TikTok isso costuma ser um iframe, então
  // repassamos e esperamos o frame que assumir a fala responder.
  function handleSpeak(data, responder) {
    if (ownsVirtualAudio()) {
      responder.claim();
      Promise.resolve(runCommand("speak", data.payload || {}))
        .then((status) => responder.finish({ ok: true, status }))
        .catch((error) => {
          console.warn(TAG, error);
          responder.finish({
            ok: false,
            error: error?.message || "Falha ao reproduzir a voz",
            code: error?.code,
          });
        });
      return;
    }
    // Sem fonte publicada, nenhum frame vai assumir: responde na hora para o
    // content.js cair no dispositivo sem esperar os 1,5s do repasse.
    if (!state.published || !window.frames.length) {
      responder.finish({ ok: false, error: INACTIVE_MSG, code: INACTIVE_CODE });
      return;
    }
    const relayId = data.requestId || `pitchai-voice-${++relaySeq}`;
    const wait = { responder, claimed: false, claimTimer: 0, doneTimer: 0 };
    relayWaits.set(relayId, wait);
    wait.claimTimer = setTimeout(() => {
      if (wait.claimed) return;
      settleRelayWait(relayId, { ok: false, error: INACTIVE_MSG, code: INACTIVE_CODE });
    }, VOICE_CLAIM_MS);
    wait.doneTimer = setTimeout(() => {
      settleRelayWait(relayId, { ok: false, error: "A fala não terminou a tempo" });
    }, VOICE_MAX_MS);
    relayToChildren({ ...data, requestId: relayId });
  }

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.source === ACK_SOURCE) return;
    if (data.source === RELAY_ACK_SOURCE) {
      handleRelayAck(event, data);
      return;
    }
    if (data.source === GESTURE_SOURCE) {
      // Só do frame de cima e da mesma origem. Mesmo forjado pela página, não
      // faz nada além do que um clique dela própria já faria.
      if (
        window.top !== window &&
        event.source === window.parent &&
        event.origin === window.location.origin
      ) {
        onUserGesture();
      }
      return;
    }
    if (data.source === OWNER_SOURCE) {
      if (event.origin === window.location.origin && isChildFrame(event.source)) {
        state.childOwnerAt = Date.now();
        announceAudioOwner(); // sobe a notícia até o topo
      }
      return;
    }
    if (data.source !== CONTROL_SOURCE || typeof data.command !== "string") return;
    const fromPanel = isPanelMessage(event, data);
    const fromContent = !fromPanel && isContentMessage(event, data);
    const fromParent = !fromPanel && !fromContent && isRelayMessage(event, data);
    if (!fromPanel && !fromContent && !fromParent) return;
    if (fromContent && !CONTENT_COMMANDS.has(data.command)) return;

    const origins = { fromPanel, fromContent, fromParent };
    const answerable = fromPanel || fromContent || data.command === "speak";
    const responder = answerable
      ? makeResponder(event, data, origins)
      : { claim() {}, finish() {} };

    if (data.command === "speak") {
      handleSpeak(data, responder);
      return;
    }

    relayToChildren(data);
    Promise.resolve(runCommand(data.command, data.payload || {}))
      .then((status) => responder.finish({ ok: true, status }))
      .catch((error) => {
        console.warn(TAG, error);
        responder.finish({
          ok: false,
          error: error?.message || "Falha ao configurar a fonte virtual",
          code: error?.code,
        });
      });
  });

  installGumHook();
  installEnumerateHook();
  installPeerConnectionHook();
  armPlaybackOnGesture();
  console.log(TAG, "pronto");
})();
