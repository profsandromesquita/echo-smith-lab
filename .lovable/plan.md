## Objetivo

Três correções pontuais, estritamente dentro da Fase F1. Nada de F2, nenhum mock, DemoProvider, ControleDemo ou layout aprovado é alterado.

---

## 1. Estado de sessão na landing page

Arquivo: `src/routes/index.tsx` (apenas o bloco `<nav>` do topo).

- Usar o hook existente `useAuth()` para saber se há sessão.
- Sem sessão: exibir apenas **Entrar** (mesmo botão primário atual, sem o segundo botão).
- Com sessão: exibir apenas **Abrir workspace**.
- Enquanto a sessão carrega (e durante o SSR): reservar o mesmo espaço com um placeholder de mesmas dimensões, para não causar salto de layout nem divergência de hidratação.
- Classes, tamanhos, espaçamentos e tipografia permanecem exatamente os atuais. O CTA do herói (“Ver o workspace”) não muda.

---

## 2. Endurecimento da verificação de papel

Nova migração (as duas já aplicadas não são tocadas).

Conteúdo da migração:

- Criar `public.tem_papel(_role app_role) returns boolean`, `stable`, `security definer`, `set search_path = ''`, que lê `auth.uid()` internamente e consulta `public.user_roles`. O chamador informa somente o papel — não existe parâmetro de UUID.
- Revogar `EXECUTE` de `public.has_role(uuid, app_role)` de `anon` e `authenticated`, mantendo-a disponível apenas para uso interno em políticas RLS (owner/`service_role`). Assim nenhum cliente autenticado consegue sondar o papel de outro UUID.
- Conceder `EXECUTE` em `public.tem_papel(app_role)` a `authenticated`.
- Reafirmar as permissões de `user_roles`: `SELECT` para `authenticated` (com policy restrita a `auth.uid() = user_id`), sem `INSERT`/`UPDATE`/`DELETE` para usuários comuns; `ALL` para `service_role`.

Código afetado: `src/lib/conta.functions.ts` — `verificarAdmin` e `obterConta` passam a chamar `context.supabase.rpc("tem_papel", { _role: "admin_tecnico" })`. As duas continuam sendo funções de servidor autenticadas; a decisão de papel segue exclusivamente no servidor. O gate de `/admin/agentes` e o `MenuConta` seguem inalterados na estrutura, apenas consumindo o resultado.

Após a migração, os tipos gerados do backend são atualizados automaticamente antes desse ajuste de código.

---

## 3. Higiene das variáveis de ambiente

- Adicionar `.env` ao `.gitignore`.
- Remover `.env` do versionamento mantendo o arquivo em disco e todas as variáveis do ambiente Lovable Cloud intactas (nada é reconfigurado nem trocado).
- Criar `.env.example` apenas com os nomes das variáveis públicas já usadas (`SUPABASE_PROJECT_ID`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) e valores fictícios.
- Nenhuma secret key ou service-role key entra no repositório.

---

## Fora de escopo

Persistência de chats/mensagens, Voz de Marca, privacidade/consentimento, Registry, jobs, qualquer chamada a provedor de IA, redesenho visual e alterações em mocks da F0.

---

## Validação

Navegador (Playwright) e verificações automáticas:

- cadastro, login, recarregamento com sessão persistida e logout;
- landing sem sessão (só “Entrar”) e com sessão (só “Abrir workspace”);
- `/app` sem sessão redireciona para `/auth`;
- conta comum bloqueada em `/admin/agentes`;
- conta administrativa liberada;
- chamada tentando consultar papel de outro UUID rejeitada (a função antiga deixa de ser executável pelo cliente);
- build e lint limpos;
- console sem erros;
- `ControleDemo` e demais mocks da F0 funcionando como antes.

## Entrega

Ao final, resumo dos arquivos alterados/criados e da nova migração.
