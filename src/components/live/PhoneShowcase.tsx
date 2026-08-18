import { useEffect, useRef, useState } from "react";
import { useReducedMotionSafe } from "@/hooks/use-reduced-motion-safe";

/**
 * Aparelho do hero: `phone-frame.png` com a tela vazada e os vídeos do produto
 * por trás, tocando em sequência.
 *
 * O encaixe do vídeo na tela inclinada é todo CSS (`.phone-video-media` em
 * `landing-motion.css`): a matriz e o clip-path saem da medição do alfa do
 * próprio PNG.
 */

const VIDEOS = Array.from({ length: 10 }, (_, index) => ({
  src: `/videos/demo-${String(index + 1).padStart(2, "0")}.mp4`,
  label: `Demonstração ${index + 1} da Pitch AI ao vivo`,
}));

export function PhoneShowcase() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [current, setCurrent] = useState(0);
  const [failed, setFailed] = useState(false);
  const reduce = useReducedMotionSafe();

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (reduce) {
      video.pause();
      return;
    }

    video.load();
    video.play().catch(() => {
      // o navegador pode segurar o autoplay até o hero ficar visível
    });
  }, [current, reduce]);

  return (
    <div className="phone-video-showcase">
      {/*
        O recorte da tela é da CAIXA, não do vídeo: com o clip-path aplicado ao
        próprio <video> o navegador tirava o clipe da camada do compositor e
        rasterizava quadro a quadro (medido: o aparelho sozinho derrubava o hero
        de 123 para 78fps). A caixa carrega a geometria e o `overflow`; o vídeo,
        por dentro, fica limpo.
      */}
      <div className="phone-video-media">
        {!failed ? (
          <video
            ref={videoRef}
            src={VIDEOS[current].src}
            aria-label={VIDEOS[current].label}
            autoPlay={!reduce}
            muted
            playsInline
            preload="metadata"
            onEnded={() => {
              if (!reduce) setCurrent((current + 1) % VIDEOS.length);
            }}
            onError={() => setFailed(true)}
          />
        ) : (
          <span className="phone-video-media--fallback" aria-hidden="true" />
        )}
      </div>
      <img
        className="phone-video-frame"
        src="/assets/pitchai/phone-frame.png"
        alt=""
        aria-hidden="true"
        width={967}
        height={1626}
      />
    </div>
  );
}

export default PhoneShowcase;
