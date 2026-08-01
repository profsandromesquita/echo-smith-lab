# Fase F1 — Autenticação real e isolamento multi-conta

Escopo exclusivo da F1 conforme o roteiro aprovado: ativar o Lovable Cloud, implementar autenticação real, papéis (`usuario` / `admin_tecnico`) em tabela separada com RLS e proteger as rotas do produto. **Nada de F2 em diante.**

Estado verificado: o projeto ainda não tem backend (`src/integrations` inexistente), `/auth` é formulário puramente visual com link direto para `/app`, e `AppShell` monta `DemoProvider` + `ControleDemo` com dados de `src/lib/fixtures.ts`.

## 1. Objetivo

Sair do acesso aberto e simulado para acesso autenticado real, com cada conta isolada por RLS desde a primeira tabela, e um papel de administrador técnico verificável no servidor — pré-requisito de todas as fases seguintes.

## 2. Funcionalidades

1. Ativação do Lovable Cloud (banco, auth, funções de backend).
2. Cadastro e login por e-mail e senha, com confirmação automática de e-mail ligada para não travar o teste.
3. Sessão persistente com recuperação automática e logout explícito.
4. Perfil mínimo do usuário criado automaticamente no cadastro (id, nome de exibição, data de criação).
5. Papéis em tabela dedicada `user_roles` + enum `app_role` + função `has_role` com `security definer` — nunca papel no perfil.
6. Proteção de rotas: tudo sob o produto exige sessão; `/admin/agentes` exige papel de administrador técnico, validado no servidor e não apenas na interface.
7. Identidade real na interface: nome/e-mail e ação "Sair" no cabeçalho do `AppShell`, substituindo o acesso anônimo.

## 3. Rotas e componentes afetados (alteração localizada, sem redesenho)

| Alvo | Mudança |
| :-- | :-- |
| `src/routes/auth.tsx` | Mesmo layout aprovado; os formulários passam a submeter de verdade, com validação, erros em pt-BR e estado de carregamento. Remove o aviso "autenticação real entra em uma fase posterior" e o link direto para `/app`. |
| `src/routes/app/index.tsx`, `src/routes/app/c.$chatId.tsx`, `src/routes/config/*`, `src/routes/admin/agentes.tsx` | Passam a exigir sessão; sem sessão, redirecionam para `/auth`. Conteúdo visual inalterado. |
| `src/components/layout/AppShell.tsx` | Acréscimo de um menu de conta no canto direito do cabeçalho (nome, e-mail, sair). Estrutura de três colunas, drawers e `ControleDemo` preservados. |
| `src/routes/index.tsx` (landing) | Apenas o botão de topo reflete o estado de sessão ("Entrar" x "Abrir workspace"). Sem redesenho. |
| `src/routes/onboarding.tsx` | Mantém-se visual; só passa a ser alcançável após login. |
| Novos | Gate de rota autenticada, hook de sessão, funções de servidor de perfil/papel. |

## 4. Estados simulados substituídos por comportamento real

- Login/cadastro fictícios → autenticação real com erros reais (credencial inválida, e-mail já usado, senha fraca).
- Usuário implícito e anônimo → usuário autenticado com identidade visível.
- Acesso irrestrito a `/admin/agentes` → acesso condicionado a papel verificado no servidor.

**Continuam simulados nesta fase:** pastas, chats, mensagens, variações, timeline do pipeline, ranking, voz de marca, preferências, privacidade, IA local e Registry — tudo segue vindo de `fixtures.ts` e do `ControleDemo`.

## 5. Dados e persistência

Uma única migração, com `GRANT` explícito para cada tabela nova:

- `public.profiles` — `id` (referencia o usuário), `nome_exibicao`, `criado_em`. RLS: cada um lê e edita apenas o próprio registro.
- `public.user_roles` — `id`, `user_id`, `role` (enum `app_role`: `usuario`, `admin_tecnico`), único por par. Leitura da própria linha; escrita apenas por processo privilegiado.
- `public.has_role(_user_id, _role)` — `security definer`, usada pelas políticas e pela verificação de administrador.
- Gatilho de cadastro: cria o perfil e atribui o papel `usuario` a cada nova conta.

Nenhum dado de conteúdo (chats, variações, briefings) é persistido na F1.

## 6. Fora do escopo

Pastas, chats e mensagens no banco (F2); voz de marca persistida (F3); privacidade, consentimentos, retenção e logs (F4); Registry versionado e infraestrutura de jobs (F5); qualquer chamada a provedor de IA (F6+); login social; recuperação de senha por e-mail; convites, times ou colaboração; painel de administração funcional além do controle de acesso; qualquer Secret ou integração externa.

## 7. Dependências da F0

Design system e tokens de `src/styles.css`; componentes de `ui/` (form, input, tabs, card, dropdown); shell de três colunas; rotas já existentes; `sonner` já montado no `__root` para as mensagens de erro e sucesso.

## 8. Riscos de regressão e mitigação

- **Rota protegida em prerender/SSR sem sessão** — o gate redireciona no cliente; nenhuma função protegida é chamada em `loader` de rota pública.
- **`ControleDemo` e `DemoProvider` quebrarem** — o gate envolve a rota, não o interior do `AppShell`; nenhum provider existente é removido.
- **Deriva visual** — o menu de conta reutiliza componentes já aprovados e só ocupa espaço livre do cabeçalho; nenhuma alteração em espaçamento, tipografia ou cor.
- **Escalada de privilégio** — papel jamais no perfil nem no cliente; toda decisão de administrador passa por `has_role` no servidor.
- **Tabela inacessível por falta de `GRANT`** — grants incluídos na mesma migração.
- **Bloqueio da navegação atual** — checagem em 375, 768 e 1440 após a mudança, com login real.

## 9. Critérios de aceite

1. Cadastro cria conta, perfil e papel `usuario`; login e logout funcionam e a sessão sobrevive ao recarregamento.
2. Sem sessão, `/app`, `/app/c/:id`, `/config/*`, `/onboarding` e `/admin/agentes` redirecionam para `/auth`.
3. Com sessão comum, `/admin/agentes` nega acesso com mensagem clara; com papel `admin_tecnico`, libera.
4. A negação de administrador se mantém mesmo alterando estado no navegador (validação no servidor).
5. Duas contas distintas não enxergam dados uma da outra em nenhuma tabela criada.
6. Erros de autenticação aparecem em pt-BR, sem termos técnicos vazando.
7. Identidade e ação de sair visíveis no cabeçalho do workspace.
8. Layout aprovado íntegro em 375/768/1440, sem scroll horizontal; `ControleDemo` e todos os estados simulados da F0 continuam funcionando.
9. Nenhuma credencial no frontend; nenhuma tabela sem RLS e sem grants.
10. Console sem erros; verificação de tipos e build passam.

## 10. Testes

- Fluxo real no navegador: cadastro → logout → login → recarregar → acessar rota protegida → sair.
- Redirecionamento de cada rota protegida sem sessão.
- Acesso a `/admin/agentes` com conta comum e com conta promovida a administrador.
- Isolamento entre duas contas.
- Regressão visual da F0 nos três breakpoints, com verificação dos estados do `ControleDemo`.
- Varredura de segurança do banco após a migração.

## 11. Detalhes técnicos

Cliente gerado do Cloud no navegador para sessão e chamadas com RLS. Lógica sensível em `createServerFn` com middleware de autenticação; a verificação de administrador roda no servidor via `has_role` usando o cliente autenticado, nunca com cliente privilegiado. Gate de rota implementado como layout autenticado envolvendo as rotas do produto, com redirecionamento no cliente para não quebrar o prerender. Hook de sessão único (`useAuth`) criado nesta fase, já que o template não fornece um.

## 12. Confirmação de escopo

Nenhuma atividade de F2 em diante será antecipada. Persistência de conteúdo, privacidade, Registry, jobs e chamadas a provedores permanecem intocados. Ao fim da F1, volto ao Plan Mode para a F2 somente após validação dos critérios acima.
