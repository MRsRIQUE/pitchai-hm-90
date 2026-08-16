import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { signOut } from "firebase/auth";
import { toast } from "sonner";
import { getFirebaseAuth } from "@/lib/firebase";

/**
 * Encerra a sessão do Firebase e devolve o usuário para a home.
 *
 * Existe como hook porque o mesmo comportamento aparece em três skins
 * diferentes — a pastilha do `LogoutButton`, o link da nav da LP e o botão do
 * painel — e só a aparência muda entre elas.
 */
export function useLogout() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function logout() {
    if (busy) return;
    setBusy(true);
    try {
      await signOut(getFirebaseAuth());
      toast.success("Você saiu da sua conta.");
      navigate({ to: "/" });
    } catch (err) {
      console.warn("[logout] Falha ao encerrar a sessão:", err);
      toast.error("Não foi possível sair agora. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return { logout, busy };
}
