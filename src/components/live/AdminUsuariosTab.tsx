import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calculator, Sliders, UserCheck, Users } from "lucide-react";
import type { CompedAccess } from "@/lib/live/comped.functions";
import { courtesyRequest } from "./admin-usuarios/utils";
import { CustosTab } from "./admin-usuarios/CustosTab";
import { CalculadoraTab } from "./admin-usuarios/CalculadoraTab";
import { CotasTab } from "./admin-usuarios/CotasTab";
import { CortesiaTab } from "./admin-usuarios/CortesiaTab";

type SubTab = "custos" | "calculadora" | "cotas" | "cortesia";

/** Gestão avançada de usuários, cotas e verificação de custos de IA. */
export function UsuariosTab() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("custos");

  const { data: compedItems = [] } = useQuery({
    queryKey: ["admin", "comped"],
    queryFn: async () => (await courtesyRequest<{ items: CompedAccess[] }>("GET")).items,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveSubTab("custos")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeSubTab === "custos"
                ? "bg-[#7C3AED] text-white shadow"
                : "text-white/60 hover:text-white"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Verificação de Custos
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("calculadora")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeSubTab === "calculadora"
                ? "bg-[#7C3AED] text-white shadow"
                : "text-white/60 hover:text-white"
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            Simulador / Profiler de Custo
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("cotas")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeSubTab === "cotas"
                ? "bg-[#7C3AED] text-white shadow"
                : "text-white/60 hover:text-white"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            Cotas & Limites por Plano
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("cortesia")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeSubTab === "cortesia"
                ? "bg-[#7C3AED] text-white shadow"
                : "text-white/60 hover:text-white"
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            Acesso Free / Cortesia ({compedItems.length})
          </button>
        </div>
      </div>

      {activeSubTab === "custos" && <CustosTab />}
      {activeSubTab === "calculadora" && <CalculadoraTab />}
      {activeSubTab === "cotas" && <CotasTab />}
      {activeSubTab === "cortesia" && <CortesiaTab />}
    </div>
  );
}
