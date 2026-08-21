import { useState } from "react";
import { toast } from "sonner";
import { getFirebaseAuth } from "@/lib/firebase";
import { claimReferral } from "@/lib/referrals.functions";
import {
  REFERRAL_LANDING_STORAGE_KEY,
  REFERRAL_SOURCE_STORAGE_KEY,
  REFERRAL_STORAGE_KEY,
  normalizeReferralCode,
} from "@/lib/referrals.shared";

export function SellerCodeField() {
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [appliedCode, setAppliedCode] = useState<string | null>(null);

  function clearStoredCode() {
    try {
      localStorage.removeItem(REFERRAL_STORAGE_KEY);
      localStorage.removeItem(REFERRAL_SOURCE_STORAGE_KEY);
      localStorage.removeItem(REFERRAL_LANDING_STORAGE_KEY);
    } catch {
      // O vínculo no servidor já é a fonte da verdade; limpeza local é best effort.
    }
  }

  async function applyCode() {
    const normalized = normalizeReferralCode(code);
    if (!normalized) {
      toast.error("Digite um código de vendedor válido.");
      return;
    }

    try {
      localStorage.setItem(REFERRAL_STORAGE_KEY, normalized);
      localStorage.setItem(REFERRAL_SOURCE_STORAGE_KEY, "seller_code");
      localStorage.setItem(REFERRAL_LANDING_STORAGE_KEY, window.location.pathname.slice(0, 240));
    } catch {
      toast.error("Não foi possível salvar o código neste dispositivo.");
      return;
    }

    const user = getFirebaseAuth().currentUser;
    if (!user) {
      setAppliedCode(normalized);
      toast.success("Código salvo. Ele será vinculado quando você entrar ou criar sua conta.");
      return;
    }

    setPending(true);
    try {
      const result = await claimReferral({
        data: {
          code: normalized,
          source: "seller_code",
          landingPath: window.location.pathname,
        },
      });
      clearStoredCode();
      if (result.ok) {
        setAppliedCode(normalized);
        toast.success("Código do vendedor aplicado.");
      } else if (result.reason === "already") {
        toast.info("Sua conta já possui um vendedor ou afiliado vinculado.");
      } else if (result.reason === "self") {
        toast.error("Você não pode usar o próprio código.");
      } else {
        toast.error("Código não encontrado ou ainda não ativado.");
      }
    } catch {
      toast.error("Não foi possível aplicar o código agora.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="card rf-link-card" aria-labelledby="seller-code-title">
      <div className="rf-head">
        <div>
          <h2 id="seller-code-title">Código promocional do vendedor</h2>
          <p className="site-page-note">
            Informe o código de quem apresentou o Pitch AI. Ele identifica a origem da venda e não
            altera o preço do seu plano.
          </p>
        </div>
        {appliedCode ? <span className="rf-status is-pago">Aplicado: {appliedCode}</span> : null}
      </div>
      <div className="rf-actions">
        <input
          className="rf-link"
          value={code}
          maxLength={16}
          autoComplete="off"
          placeholder="Ex.: ABCD1234"
          aria-label="Código promocional do vendedor"
          onChange={(event) => setCode(normalizeReferralCode(event.currentTarget.value))}
          onKeyDown={(event) => {
            if (event.key === "Enter") void applyCode();
          }}
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending || !code}
          onClick={() => void applyCode()}
        >
          {pending ? "Aplicando…" : "Aplicar código"}
        </button>
      </div>
    </section>
  );
}
