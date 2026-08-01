import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/** Estados simulados da F0. Nenhum deles depende de rede. */
export type EstadoDemo =
  | "vazio"
  | "briefing_insuficiente"
  | "executando"
  | "adaptacao_local"
  | "preservacao_reprovada"
  | "parcial"
  | "cancelado"
  | "erro_provedor"
  | "consentimento_pendente"
  | "resultado_incerto"
  | "entregue";

export const ESTADOS_DEMO: { id: EstadoDemo; rotulo: string }[] = [
  { id: "vazio", rotulo: "Vazio" },
  { id: "briefing_insuficiente", rotulo: "Briefing insuficiente" },
  { id: "executando", rotulo: "Executando por etapa" },
  { id: "adaptacao_local", rotulo: "Adaptação local em curso" },
  { id: "preservacao_reprovada", rotulo: "Preservação reprovada" },
  { id: "parcial", rotulo: "Resultado parcial" },
  { id: "cancelado", rotulo: "Cancelado" },
  { id: "erro_provedor", rotulo: "Erro de provedor" },
  { id: "consentimento_pendente", rotulo: "Consentimento pendente" },
  { id: "resultado_incerto", rotulo: "Resultado externo incerto" },
  { id: "entregue", rotulo: "Entrega concluída" },
];

export type EstadoIaLocal = "ausente" | "baixando" | "pronta" | "incompativel" | "removida";

export const ESTADOS_IA_LOCAL: { id: EstadoIaLocal; rotulo: string }[] = [
  { id: "ausente", rotulo: "IA local ausente" },
  { id: "baixando", rotulo: "IA local baixando" },
  { id: "pronta", rotulo: "IA local pronta" },
  { id: "incompativel", rotulo: "Dispositivo incompatível" },
  { id: "removida", rotulo: "IA local removida" },
];

export type ModoPrivacidade = "local_estrita" | "hibrido_autorizado";

interface DemoContexto {
  estado: EstadoDemo;
  definirEstado: (estado: EstadoDemo) => void;
  iaLocal: EstadoIaLocal;
  definirIaLocal: (estado: EstadoIaLocal) => void;
  offline: boolean;
  definirOffline: (valor: boolean) => void;
  modo: ModoPrivacidade;
  definirModo: (modo: ModoPrivacidade) => void;
}

const Contexto = createContext<DemoContexto | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [estado, definirEstado] = useState<EstadoDemo>("entregue");
  const [iaLocal, definirIaLocal] = useState<EstadoIaLocal>("pronta");
  const [offline, definirOffline] = useState(false);
  const [modo, definirModo] = useState<ModoPrivacidade>("local_estrita");

  const valor = useMemo(
    () => ({
      estado,
      definirEstado,
      iaLocal,
      definirIaLocal,
      offline,
      definirOffline,
      modo,
      definirModo,
    }),
    [estado, iaLocal, offline, modo],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useDemo() {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error("useDemo precisa estar dentro de DemoProvider");
  return ctx;
}