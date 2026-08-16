import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Check, Loader2, Volume2, Puzzle, ShoppingBag, Rocket, ArrowRight } from "lucide-react";
import { aiHeaders } from "@/lib/live/ai-headers";
import { SAMPLE_PHRASE } from "@/lib/live/voices";
import { newProduct, type LiveConfig } from "@/lib/live/config";
import { cn } from "@/lib/utils";
import { ExtensionStatusBanner } from "@/components/live/ExtensionStatusBanner";

const STEPS = [
  { id: 1, title: "Instalar a extensão", icon: Puzzle },
  { id: 2, title: "Ligar o áudio", icon: Volume2 },
  { id: 3, title: "Escolher o produto", icon: ShoppingBag },
] as const;

export function SetupWizard({
  cfg,
  setCfg,
  onImportVitrine,
  importing,
  onFinish,
  syncToken,
}: {
  cfg: LiveConfig;
  setCfg: (updater: (cfg: LiveConfig) => LiveConfig) => void;
  onImportVitrine: () => Promise<void> | void;
  importing?: boolean;
  onFinish: () => void;
  syncToken?: string;
}) {
  const [step, setStep] = useState(1);
  const [testing, setTesting] = useState(false);
  const [audioOk, setAudioOk] = useState<boolean | null>(null);
  const [nome, setNome] = useState("");
  const [preco, setPreco] = useState("");

  const temProduto = cfg.produtos.length > 0;

  const testarVoz = async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/tts/preview", {
        method: "POST",
        headers: await aiHeaders(),
        body: JSON.stringify({
          text: SAMPLE_PHRASE,
          voice: cfg.voz.id,
          speed: cfg.voz.speed,
        }),
      });
      if (!res.ok) {
        const raw = await res.text();
        let message = raw || `Falha no serviço de voz (${res.status})`;
        try {
          const parsed = JSON.parse(raw) as { message?: string };
          if (parsed.message) message = parsed.message;
        } catch {
          // Mantém o corpo textual quando o servidor não devolve JSON.
        }
        throw new Error(message);
      }
      const audioUrl = URL.createObjectURL(await res.blob());
      const audio = new Audio(audioUrl);
      audio.addEventListener("ended", () => URL.revokeObjectURL(audioUrl), { once: true });
      audio.addEventListener("error", () => URL.revokeObjectURL(audioUrl), { once: true });
      await audio.play();
      setAudioOk(true);
      toast.success("Áudio funcionando");
    } catch (error) {
      setAudioOk(false);
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      toast.error("Não foi possível testar a voz", {
        description:
          error instanceof DOMException && error.name === "NotAllowedError"
            ? "O Chrome bloqueou a reprodução. Clique novamente em Testar voz."
            : message,
      });
    } finally {
      setTesting(false);
    }
  };

  const criarProduto = () => {
    if (!nome.trim()) {
      toast.error("Escreva o nome do produto");
      return;
    }
    setCfg((c) => ({
      ...c,
      produtos: [
        ...c.produtos.map((p) => ({ ...p, active: false })),
        { ...newProduct(), name: nome.trim(), price: preco.trim(), active: true },
      ],
    }));
    setNome("");
    setPreco("");
    toast.success("Produto adicionado");
  };

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/15 text-primary">
          <Rocket className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="font-display text-base font-bold">Vamos deixar tudo pronto</div>
          <div className="text-xs text-muted-foreground">
            3 passos rápidos — depois é só iniciar a live.
          </div>
        </div>
        <Button variant="ghost" size="sm" className="ml-auto shrink-0 text-xs" onClick={onFinish}>
          Pular
        </Button>
      </div>

      <ol className="mb-4 flex items-center gap-2">
        {STEPS.map((s) => (
          <li key={s.id} className="flex flex-1 items-center gap-2">
            <div
              className={cn(
                "grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 text-xs font-bold",
                step > s.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : step === s.id
                    ? "border-primary text-primary"
                    : "border-border text-muted-foreground",
              )}
            >
              {step > s.id ? <Check className="h-3.5 w-3.5" /> : s.id}
            </div>
            <span
              className={cn(
                "hidden truncate text-xs sm:block",
                step === s.id ? "font-semibold" : "text-muted-foreground",
              )}
            >
              {s.title}
            </span>
          </li>
        ))}
      </ol>

      {step === 1 && (
        <div className="space-y-4">
          <ExtensionStatusBanner syncToken={syncToken} />

          <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
            <h4 className="font-bold text-sm text-white flex items-center gap-2">
              <span>Como é fácil instalar no seu computador (menos de 2 min)</span>
            </h4>
            <div className="grid gap-2 text-xs text-slate-300 sm:grid-cols-3">
              <div className="rounded-lg bg-black/40 p-2.5 border border-white/10">
                <span className="font-bold text-[#A855F7]">1. Clique em Baixar</span>
                <p className="mt-1 text-slate-400">Você receberá o arquivo zip com a extensão.</p>
              </div>
              <div className="rounded-lg bg-black/40 p-2.5 border border-white/10">
                <span className="font-bold text-[#A855F7]">2. Extraia a Pasta</span>
                <p className="mt-1 text-slate-400">Descompacte o arquivo no seu computador.</p>
              </div>
              <div className="rounded-lg bg-black/40 p-2.5 border border-white/10">
                <span className="font-bold text-[#A855F7]">3. Arraste pro Chrome</span>
                <p className="mt-1 text-slate-400">Em chrome://extensions com Modo Dev ativo.</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button asChild className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold">
              <Link to="/download">Ver Passo a Passo Ilustrado Completo</Link>
            </Button>
            <Button variant="outline" onClick={() => setStep(2)}>
              Já instalei — continuar <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Clique para ouvir a voz da IA. Se você escutar, está tudo certo.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={testarVoz} disabled={testing}>
              {testing ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Volume2 className="mr-1.5 h-4 w-4" />
              )}
              Testar voz
            </Button>
            {audioOk === true && (
              <span className="text-xs font-medium text-primary">Ouviu? Então está pronto.</span>
            )}
          </div>
          {audioOk === false && (
            <div className="rounded-lg border border-border/60 p-3 text-xs text-muted-foreground">
              Não ouviu nada? Verifique o volume, e depois configure para onde a voz vai (VB-Cable
              no Windows, BlackHole no Mac) na seção
              <b className="text-foreground"> Como transmitir a voz da IA</b> do modo avançado.
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStep(1)}>
              Voltar
            </Button>
            <Button variant="outline" onClick={() => setStep(3)}>
              Continuar
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            A IA responde com base no produto ativo. Sincronize sua vitrine do TikTok ou cadastre um
            produto agora.
          </p>
          <Button variant="outline" onClick={() => void onImportVitrine()} disabled={importing}>
            {importing && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Sincronizar da vitrine
          </Button>
          <div className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">
            <Input
              placeholder="Nome do produto"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
            <Input
              placeholder="R$ 99,90"
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
            />
            <Button variant="outline" onClick={criarProduto}>
              Adicionar
            </Button>
          </div>
          {temProduto && (
            <p className="text-xs text-primary">{cfg.produtos.length} produto(s) prontos.</p>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setStep(2)}>
              Voltar
            </Button>
            <Button onClick={onFinish} disabled={!temProduto}>
              Tudo pronto — ir para a live
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
