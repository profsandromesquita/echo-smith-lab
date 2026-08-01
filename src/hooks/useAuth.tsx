import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/** Sessão do usuário no navegador. Fonte única de estado de autenticação na interface. */
export function useAuth() {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      setSessao(novaSessao);
      setCarregando(false);
    });

    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session);
      setCarregando(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return {
    sessao,
    usuario: sessao?.user ?? null,
    autenticado: Boolean(sessao),
    carregando,
  };
}

export async function sair() {
  await supabase.auth.signOut();
}