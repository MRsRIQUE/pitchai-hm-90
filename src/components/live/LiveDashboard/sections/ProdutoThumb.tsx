import { useEffect, useState } from "react";
import type { Product } from "@/lib/live/config";
import { iniciaisDoProduto, urlDaImagem } from "./produto";

/**
 * Foto do produto com fallback.
 *
 * O fallback trata dois casos, não um: produto sem `imageUrl` E produto cuja
 * URL falha ao carregar. O segundo não é hipótese remota — a CDN do TikTok
 * responde 403 para hotlink com frequência, e sem o `onError` a UI ficaria com
 * o ícone de imagem quebrada do navegador no lugar do produto.
 */
export function ProdutoThumb({
  produto,
  tamanho = 40,
  preencher = false,
}: {
  produto: Product;
  tamanho?: number;
  preencher?: boolean;
}) {
  const url = urlDaImagem(produto);
  const [falhou, setFalhou] = useState(false);

  // Trocar de produto (ou de URL) precisa dar uma nova chance à imagem.
  useEffect(() => {
    setFalhou(false);
  }, [url]);

  const base: React.CSSProperties = {
    width: preencher ? "100%" : tamanho,
    height: preencher ? "100%" : tamanho,
    flex: "none",
    borderRadius: "var(--app-r-sm)",
    border: "1px solid var(--app-line)",
    background: "var(--app-surface-2)",
    overflow: "hidden",
  };

  if (!url || falhou) {
    return (
      <div
        style={{
          ...base,
          display: "grid",
          placeItems: "center",
          color: "var(--app-ink-3)",
          fontSize: Math.max(10, Math.round(tamanho * 0.32)),
          fontWeight: 700,
          letterSpacing: "-0.02em",
        }}
        aria-hidden="true"
      >
        {iniciaisDoProduto(produto.name)}
      </div>
    );
  }

  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      // O 403 de hotlink da CDN do TikTok é disparado pelo Referer. Sem enviá-lo
      // a maioria das fotos carrega; o onError segue como rede de segurança.
      referrerPolicy="no-referrer"
      onError={() => setFalhou(true)}
      style={{ ...base, objectFit: "cover" }}
    />
  );
}
