import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Mic,
  MicOff,
  Sparkles,
  Zap,
  Brain,
  MessageSquare,
  Volume2,
  VolumeX,
  Loader2,
  CheckCircle2,
  Radio,
  FileAudio,
} from "lucide-react";
import { toast } from "sonner";
import { getFirebaseAuth } from "@/lib/firebase";
import { resolveChatModel } from "@/lib/live/ai-models";

type UpgradeOffer = {
  url: string;
  cta: string;
  message: string;
};

async function authenticatedPost(url: string, body: unknown) {
  const user = getFirebaseAuth().currentUser;
  const token = user ? await user.getIdToken() : "";
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

export function GeminiFeaturesPanel() {
  // Mode selection for AI prompt test
  const [modelMode, setModelMode] = useState<"general" | "complex" | "fast">("general");
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [generating, setGenerating] = useState(false);
  const [highThinking, setHighThinking] = useState(true);
  const [upgradeOffer, setUpgradeOffer] = useState<UpgradeOffer | null>(null);

  // Audio transcription state
  const [isRecording, setIsRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcription, setTranscription] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Live API Voice conversation state
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [liveStatus, setLiveStatus] = useState<"disconnected" | "connecting" | "connected">(
    "disconnected",
  );
  const [liveTranscript, setLiveTranscript] = useState<string[]>([]);
  const speechRecognitionRef = useRef<any>(null);

  // Handle Gemini Prompt Generation
  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Insira um prompt para a IA");
      return;
    }
    setGenerating(true);
    setResponse("");
    try {
      const res = await authenticatedPost("/api/public/gemini/generate", {
        prompt,
        mode: modelMode,
        enableHighThinking: modelMode === "complex" ? highThinking : false,
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "quota_exceeded" && data.upgrade) setUpgradeOffer(data.upgrade);
        throw new Error(data.message || "Erro ao consultar Gemini");
      }
      setResponse(data.text || "Nenhuma resposta gerada.");
      if (data.quotaReached && data.upgrade) setUpgradeOffer(data.upgrade);
      toast.success(
        `Gerado via ${data.modelUsed} ${data.thinkingEnabled ? "(Modo High Thinking Ativo)" : ""}`,
      );
    } catch (e: any) {
      toast.error(e?.message || "Erro na geração");
    } finally {
      setGenerating(false);
    }
  };

  // Handle Audio Transcription with Mic
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await sendAudioForTranscription(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      toast.info("Gravando áudio... Fale com clareza no microfone.");
    } catch {
      toast.error("Permissão de microfone negada ou indisponível");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const sendAudioForTranscription = async (blob: Blob) => {
    setTranscribing(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64data = reader.result as string;
        const res = await authenticatedPost("/api/public/gemini/transcribe", {
          audioBase64: base64data,
          mimeType: blob.type || "audio/webm",
        });
        const data = await res.json();
        if (!res.ok) {
          if (data.error === "quota_exceeded" && data.upgrade) setUpgradeOffer(data.upgrade);
          throw new Error(data.message || "Falha na transcrição");
        }
        if (data.quotaReached && data.upgrade) setUpgradeOffer(data.upgrade);
        setTranscription(data.transcription || "Nenhum texto identificado.");
        toast.success("Áudio transcrito com gemini-3.5-flash");
      };
    } catch (e: any) {
      toast.error(e?.message || "Erro ao transcrever áudio");
    } finally {
      setTranscribing(false);
    }
  };

  // Live Voice Conversation
  const toggleLiveVoice = () => {
    if (isLiveActive) {
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch {
          /* ignore stop error */
        }
      }
      setIsLiveActive(false);
      setLiveStatus("disconnected");
      toast.info("Sessão de voz em tempo real encerrada");
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast.error("O seu navegador não suporta reconhecimento de voz em tempo real.");
      return;
    }

    setLiveStatus("connecting");
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "pt-BR";

    recognition.onstart = () => {
      setIsLiveActive(true);
      setLiveStatus("connected");
      toast.success("Sessão de voz iniciada (gemini-3.1-flash-live-preview)");
      setLiveTranscript((prev) => [
        ...prev,
        "🎙 Live API (gemini-3.1-flash-live-preview) conectada. Pode falar!",
      ]);
    };

    recognition.onresult = async (event: any) => {
      const lastResultIndex = event.results.length - 1;
      const spokenText = event.results[lastResultIndex][0].transcript;
      setLiveTranscript((prev) => [...prev, `Você: "${spokenText}"`]);

      // Call live response endpoint
      try {
        const res = await authenticatedPost("/api/public/gemini/generate", {
          prompt: `Responda de forma rápida, fluida e natural como assistente de voz em 1 frase curta: "${spokenText}"`,
          mode: "fast",
        });
        const data = await res.json();
        if (!res.ok && data.error === "quota_exceeded" && data.upgrade) {
          setUpgradeOffer(data.upgrade);
          recognition.stop();
          return;
        }
        if (data.quotaReached && data.upgrade) setUpgradeOffer(data.upgrade);
        if (data.text) {
          setLiveTranscript((prev) => [...prev, `Gemini Live: "${data.text}"`]);
          // Speak output using Web Speech TTS
          if ("speechSynthesis" in window) {
            const utterance = new SpeechSynthesisUtterance(data.text);
            utterance.lang = "pt-BR";
            window.speechSynthesis.speak(utterance);
          }
        }
      } catch {
        toast.error("Erro na resposta de voz");
      }
    };

    recognition.onerror = () => {
      setLiveStatus("disconnected");
      setIsLiveActive(false);
    };

    recognition.onend = () => {
      if (isLiveActive) {
        try {
          recognition.start();
        } catch {
          /* ignore restart error */
        }
      }
    };

    speechRecognitionRef.current = recognition;
    recognition.start();
  };

  return (
    <div className="space-y-6 my-6">
      {upgradeOffer && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-400/40 bg-amber-500/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <strong className="text-amber-300">Sua franquia de tokens chegou ao limite.</strong>
            <p className="mt-1 text-white/75">{upgradeOffer.message}</p>
          </div>
          <a
            href={upgradeOffer.url}
            className="shrink-0 rounded-lg bg-amber-400 px-4 py-2 text-center font-bold text-black transition hover:bg-amber-300"
          >
            {upgradeOffer.cta}
          </a>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Recursos de Inteligência Gemini
          </h2>
          <p className="text-xs text-muted-foreground">
            Modelos de última geração Gemini ativados no aplicativo
          </p>
        </div>
      </div>

      {/* 1. Live Voice Conversations Card */}
      <Card className="p-4 border border-primary/20 bg-card/60 backdrop-blur">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Radio
              className={`h-5 w-5 ${isLiveActive ? "text-emerald-500 animate-pulse" : "text-muted-foreground"}`}
            />
            <div>
              <h3 className="font-semibold text-sm">Conversas por Voz em Tempo Real</h3>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                Live API ·{" "}
                <Badge variant="outline" className="text-[10px]">
                  gemini-3.1-flash-live-preview
                </Badge>
              </span>
            </div>
          </div>
          <Button
            variant={isLiveActive ? "destructive" : "default"}
            size="sm"
            onClick={toggleLiveVoice}
            className="gap-2"
          >
            {isLiveActive ? (
              <>
                <VolumeX className="h-4 w-4" /> Encerrar Conversa
              </>
            ) : (
              <>
                <Volume2 className="h-4 w-4" /> Iniciar Voz Live
              </>
            )}
          </Button>
        </div>

        {isLiveActive && (
          <div className="p-3 bg-muted/50 rounded-md border text-xs space-y-2 max-h-40 overflow-y-auto">
            <div className="flex items-center gap-1.5 text-emerald-600 font-medium">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
              Sessão de voz ativa. Fale no microfone para conversar em tempo real.
            </div>
            {liveTranscript.map((line, idx) => (
              <div key={idx} className="font-mono text-muted-foreground">
                {line}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 2. Audio Transcription Card */}
      <Card className="p-4 border bg-card/60">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileAudio className="h-5 w-5 text-blue-500" />
            <div>
              <h3 className="font-semibold text-sm">Transcrever Áudio com Microfone</h3>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                Transcrição com{" "}
                <Badge variant="outline" className="text-[10px]">
                  gemini-3.5-flash
                </Badge>
              </span>
            </div>
          </div>
          <Button
            variant={isRecording ? "destructive" : "secondary"}
            size="sm"
            onClick={isRecording ? stopRecording : startRecording}
            disabled={transcribing}
            className="gap-2"
          >
            {transcribing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Transcrevendo...
              </>
            ) : isRecording ? (
              <>
                <MicOff className="h-4 w-4" /> Parar Gravação
              </>
            ) : (
              <>
                <Mic className="h-4 w-4" /> Gravar Áudio
              </>
            )}
          </Button>
        </div>

        {transcription && (
          <div className="p-3 bg-muted/40 rounded-md border text-xs space-y-1">
            <span className="font-semibold text-foreground">Resultado da Transcrição:</span>
            <p className="text-muted-foreground font-mono italic">"{transcription}"</p>
          </div>
        )}
      </Card>

      {/* 3. Gemini Intelligence & High Thinking & Low Latency Panel */}
      <Card className="p-4 border space-y-4 bg-card/60">
        <div>
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Brain className="h-4 w-4 text-purple-500" /> Teste de Modelos & Modos Gemini
          </h3>
          <p className="text-xs text-muted-foreground">
            Selecione a velocidade ou capacidade de raciocínio desejada
          </p>
        </div>

        {/* Model Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Button
            variant={modelMode === "general" ? "default" : "outline"}
            size="sm"
            onClick={() => setModelMode("general")}
            className="flex flex-col items-start h-auto p-2.5 text-left gap-1"
          >
            <div className="flex items-center gap-1.5 font-semibold text-xs">
              <Sparkles className="h-3.5 w-3.5" /> Geral
            </div>
            <span className="text-[10px] opacity-80">gemini-3.5-flash</span>
          </Button>

          <Button
            variant={modelMode === "complex" ? "default" : "outline"}
            size="sm"
            onClick={() => setModelMode("complex")}
            className="flex flex-col items-start h-auto p-2.5 text-left gap-1"
          >
            <div className="flex items-center gap-1.5 font-semibold text-xs">
              <Brain className="h-3.5 w-3.5 text-purple-400" /> High Thinking
            </div>
            <span className="text-[10px] opacity-80">gemini-3.1-pro-preview</span>
          </Button>

          <Button
            variant={modelMode === "fast" ? "default" : "outline"}
            size="sm"
            onClick={() => setModelMode("fast")}
            className="flex flex-col items-start h-auto p-2.5 text-left gap-1"
          >
            <div className="flex items-center gap-1.5 font-semibold text-xs">
              <Zap className="h-3.5 w-3.5 text-amber-400" /> Baixa Latência
            </div>
            <span className="text-[10px] opacity-80">gemini-3.1-flash-lite</span>
          </Button>
        </div>

        {modelMode === "complex" && (
          <div className="flex items-center justify-between p-2 rounded border bg-purple-500/10 text-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-purple-500" />
              <span>Modo Raciocínio Profundo (ThinkingLevel.HIGH) ativo</span>
            </div>
            <Badge variant="secondary">gemini-3.1-pro-preview</Badge>
          </div>
        )}

        <div className="space-y-2">
          <Textarea
            placeholder="Digite aqui uma instrução ou pergunta para testar o Gemini..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={2}
            className="text-xs"
          />
          <Button size="sm" onClick={handleGenerate} disabled={generating} className="w-full gap-2">
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Processando com Gemini...
              </>
            ) : (
              <>
                <MessageSquare className="h-4 w-4" /> Gerar Resposta
              </>
            )}
          </Button>
        </div>

        {response && (
          <div className="p-3 bg-muted/60 rounded-md border text-xs space-y-1">
            <div className="font-semibold text-foreground flex items-center justify-between">
              <span>Resposta da IA:</span>
              <Badge variant="outline" className="text-[10px]">
                {resolveChatModel(modelMode)}
              </Badge>
            </div>
            <p className="text-muted-foreground whitespace-pre-wrap">{response}</p>
          </div>
        )}
      </Card>
    </div>
  );
}
