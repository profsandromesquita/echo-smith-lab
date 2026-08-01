import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TITULO = "Entrar na Copyforja";
const DESCRICAO =
  "Acesse seu workspace de copywriting com pastas por cliente, voz de marca e curadoria auditada.";

/** Só aceitamos caminhos internos como destino pós-login. */
function destinoSeguro(valor: unknown): string {
  return typeof valor === "string" && valor.startsWith("/") && !valor.startsWith("//")
    ? valor
    : "/app";
}

export const Route = createFileRoute("/auth")({
  validateSearch: (busca: Record<string, unknown>) => ({
    destino: destinoSeguro(busca["destino"]),
  }),
  head: () => ({
    meta: [
      { title: TITULO },
      { name: "description", content: DESCRICAO },
      { property: "og:title", content: TITULO },
      { property: "og:description", content: DESCRICAO },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Pagina,
});

function Pagina() {
  const { destino } = Route.useSearch();
  const navigate = useNavigate();
  const { autenticado, carregando } = useAuth();

  useEffect(() => {
    if (!carregando && autenticado) {
      void navigate({ to: destino, replace: true });
    }
  }, [autenticado, carregando, destino, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center font-display text-2xl">Copyforja</h1>
        <Tabs defaultValue="entrar">
          <TabsList className="w-full">
            <TabsTrigger value="entrar" className="flex-1">
              Entrar
            </TabsTrigger>
            <TabsTrigger value="criar" className="flex-1">
              Criar conta
            </TabsTrigger>
          </TabsList>

          <TabsContent value="entrar">
            <Formulario modo="entrar" destino={destino} />
          </TabsContent>
          <TabsContent value="criar">
            <Formulario modo="criar" destino={destino} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

const MENSAGENS: Record<string, string> = {
  "invalid login credentials": "E-mail ou senha incorretos.",
  "email not confirmed": "Confirme seu e-mail antes de entrar.",
  "user already registered": "Já existe uma conta com este e-mail. Use a aba Entrar.",
  "password should be at least 6 characters": "A senha precisa ter pelo menos 6 caracteres.",
  "anonymous sign-ins are disabled": "Cadastro indisponível no momento.",
};

function traduzirErro(mensagem: string): string {
  const chave = mensagem.trim().toLowerCase();
  if (MENSAGENS[chave]) return MENSAGENS[chave];
  if (chave.includes("pwned") || chave.includes("compromised")) {
    return "Essa senha aparece em vazamentos conhecidos. Escolha outra.";
  }
  if (chave.includes("rate limit")) {
    return "Muitas tentativas seguidas. Aguarde um instante e tente de novo.";
  }
  if (chave.includes("password")) return "Senha inválida. Use pelo menos 6 caracteres.";
  if (chave.includes("email")) return "E-mail inválido ou já cadastrado.";
  return "Não foi possível concluir. Tente novamente.";
}

function Formulario({ modo, destino }: { modo: "entrar" | "criar"; destino: string }) {
  const criando = modo === "criar";
  const acao = criando ? "Criar conta" : "Entrar";
  const navigate = useNavigate();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    setEnviando(true);
    try {
      if (criando) {
        const { error } = await supabase.auth.signUp({
          email,
          password: senha,
          options: {
            emailRedirectTo: `${window.location.origin}/auth`,
            data: { nome_exibicao: nome.trim() || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Conta criada. Bem-vindo à Copyforja.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
      }
      await navigate({ to: destino, replace: true });
    } catch (erro) {
      toast.error(traduzirErro(erro instanceof Error ? erro.message : ""));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card asChild>
      <form onSubmit={enviar}>
      <CardHeader>
        <CardTitle className="text-base">{acao}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {criando && (
          <div className="space-y-1.5">
            <Label htmlFor="nome-criar">Como quer ser chamado</Label>
            <Input
              id="nome-criar"
              autoComplete="name"
              placeholder="Jainara"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor={`email-${modo}`}>E-mail</Label>
          <Input
            id={`email-${modo}`}
            type="email"
            required
            autoComplete="email"
            placeholder="voce@estudio.com.br"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`senha-${modo}`}>Senha</Label>
          <Input
            id={`senha-${modo}`}
            type="password"
            required
            minLength={6}
            autoComplete={criando ? "new-password" : "current-password"}
            placeholder="••••••••"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
          {criando && (
            <p className="text-xs text-muted-foreground">Mínimo de 6 caracteres.</p>
          )}
        </div>
      </CardContent>
      <CardFooter>
        <Button type="submit" className="w-full" disabled={enviando}>
          {enviando && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {acao}
        </Button>
      </CardFooter>
      </form>
    </Card>
  );
}