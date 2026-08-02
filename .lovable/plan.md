# Fase F2 — Organização e histórico persistentes

## 1. Objetivo

Substituir os fixtures de organização (pastas, chats, mensagens) por persistência real no Lovable Cloud, com isolamento por conta garantido no banco. Todo o conteúdo de IA (briefing inteligente, análise, especialistas, auditoria, ranking, resultados, favoritos, Voz de Marca, memória, privacidade avançada, IA local, Registry, jobs) permanece simulado e sob o ControleDemo.

## 2. Modelo de dados

Três tabelas no schema público, todas com `user_id uuid not null default auth.uid()`.

**pastas**

- `id uuid pk`, `user_id`, `nome text not null`, `criado_em`, `atualizado_em`

**chats**

- `id uuid pk`, `user_id`, `pasta_id uuid null` → `pastas(id) on delete set null`
- `titulo text not null default 'Novo chat'`
- `criado_em`, `atualizado_em`, `ultima_atividade_em timestamptz not null default now()`

**mensagens**

- `id uuid pk`, `user_id`, `chat_id uuid not null` → `chats(id) on delete cascade`
- `autor text not null check (autor in ('usuario','plataforma'))`
- `texto text not null check (char_length(texto) between 1 and 8000)`
- `criado_em`

Relações e integridade:

- `pasta_id` nulo = chat solto, continua acessível pela lista "Sem pasta".
- Exclusão de pasta **não** apaga chats: `on delete set null` move os chats para "Sem pasta". A UI avisa explicitamente quantos chats serão desvinculados antes de confirmar.
- Exclusão de chat apaga suas mensagens em cascata, sempre com confirmação em diálogo.
- Trigger `BEFORE UPDATE` mantém `atualizado_em`; trigger `AFTER INSERT` em `mensagens` atualiza `chats.ultima_atividade_em` (e o título quando ainda for o padrão, usando as primeiras palavras da primeira mensagem do usuário).
- Trigger de coerência: `mensagens.user_id` e `chats.user_id` devem ser iguais ao dono do chat/pasta referenciado, evitando vínculo cruzado entre contas.

Índices:

- `chats(user_id, ultima_atividade_em desc)`, `chats(user_id, pasta_id)`
- `mensagens(chat_id, criado_em)`
- `pastas(user_id, nome)`
- Índice GIN de busca textual sobre `chats.titulo` e `mensagens.texto` (`pg_trgm`) para a busca no histórico.

## 3. Políticas de acesso

- `GRANT SELECT, INSERT, UPDATE, DELETE` para `authenticated`; `GRANT ALL` para `service_role`; **nenhum grant para `anon**`.
- RLS habilitada nas três tabelas, com políticas separadas por operação, todas `TO authenticated` e escopadas em `auth.uid() = user_id` (USING e WITH CHECK).
- Em `chats`, o WITH CHECK exige que `pasta_id` seja nulo ou pertença ao mesmo usuário. Em `mensagens`, exige que o `chat_id` pertença ao usuário.
- `user_id` nunca vem do frontend: default `auth.uid()` no banco e, nas funções de servidor, sempre `context.userId`.

## 4. Rotas e componentes afetados

Nenhuma rota nova; nenhuma rota removida.

- `src/routes/_authenticated/app/index.tsx` — passa a ser o "novo chat" real: cria o chat na primeira mensagem e navega para `/app/c/$chatId`.
- `src/routes/_authenticated/app/c.$chatId.tsx` — carrega o chat pelo id; trata "não encontrado" e "de outra conta" com a mesma tela neutra (sem revelar existência).
- `src/components/layout/PainelPastas.tsx` — passa a listar dados reais, com criar/renomear/excluir pasta, mover chat, renomear/excluir chat e busca funcional.
- `src/components/chat/Thread.tsx` — recebe as mensagens como prop, vindas do banco.
- `src/components/chat/Composer.tsx` — envio grava a mensagem do usuário; a resposta "plataforma" continua vinda do fixture/ControleDemo.
- `src/components/chat/Workspace.tsx` — recebe título/chatId; badge de status e área de resultados seguem simulados.
- Novos: `src/lib/historico.functions.ts` (server functions autenticadas) e diálogos de renomear/mover/excluir.

Preservados sem alteração de identidade visual: AppShell, MenuConta, PainelParametros, ControleDemo, AreaResultados, CartaoVariacao, layout de três colunas e a simplificação aprovada da conversa.

## 5. Estratégia para substituir fixtures sem regressão

1. Os fixtures de pipeline permanecem em `src/lib/fixtures.ts`. Removem-se apenas `PASTAS` e `MENSAGENS` do uso em runtime.
2. As mesmas formas de dado (`titulo`, `atualizadoEm`, `autor`, `texto`) são mantidas nos tipos, para que os componentes visuais mudem só a origem dos dados.
3. Toda leitura/escrita passa por server functions com `requireSupabaseAuth`; as telas usam TanStack Query (`useQuery`/`useMutation` + invalidação).
4. Rotas protegidas já vivem sob `_authenticated`, então loaders podem carregar os dados sem risco de prerender.
5. Atualização otimista apenas onde é reversível e sem id gerado pelo servidor: renomear pasta/chat e mover chat. Criação e exclusão aguardam a confirmação do servidor.

## 6. Sequência de implementação

1. Migração: tabelas, grants, RLS, triggers, índices e extensão de busca.
2. `historico.functions.ts`: listar árvore, criar/renomear/excluir pasta, criar/renomear/mover/excluir chat, listar e criar mensagem, buscar histórico. Validação com Zod (tamanho de nome/título/texto).
3. PainelPastas real, com estados de carregamento, vazio e erro.
4. Rota do chat: carregamento de mensagens, envio persistido, estados de não encontrado.
5. Rota `/app`: criação do chat na primeira mensagem e navegação.
6. Limpeza dos fixtures de organização e validação completa.

## 7. Riscos

- **Fixture ainda referenciado** em algum ponto do layout — mitigado removendo os exports usados em runtime e deixando o typecheck apontar.
- **Enumeração de chats por URL** — mitigada por RLS e resposta idêntica para inexistente e alheio.
- **Título automático sobrescrevendo renomeação manual** — só é aplicado enquanto o título for o padrão.
- **Perda visual na conversa** ao trocar a origem dos dados — mitigada mantendo os mesmos componentes e regressão visual nos três breakpoints.
- **Busca lenta** com histórico grande — mitigada com índice trigram e limite de resultados.

## 8. Critérios de aceite

- Pastas, chats e mensagens persistem após recarregar, sair e entrar de novo.
- Chat sem pasta continua listado e acessível.
- Excluir pasta desvincula chats, nunca os apaga, e avisa antes.
- Excluir chat exige confirmação e remove as mensagens junto.
- Busca retorna apenas dados do próprio usuário.
- Lista ordenada por atividade recente.
- Conta B não vê nem acessa nada da conta A, inclusive via URL direta.
- Identidade visual, layout, responsividade, auth e ControleDemo intactos.
- Build, tipos e console limpos.

## 9. Testes

Automatizados via navegador com duas contas reais:
criar/renomear/excluir pasta; criar chat com e sem pasta; mover chat; renomear chat; excluir chat com confirmação; persistir mensagens; recarregar; logout e novo login; busca no histórico; isolamento entre contas; acesso a chat alheio pela URL (tela neutra, sem vazamento); regressão visual em 375, 768 e 1440 px; verificação de build, typecheck e console sem erros.

## 10. Confirmação de escopo

Nenhuma fase posterior será antecipada. Ficam de fora desta fase: Voz de Marca persistente, favoritos e edições reais, pipeline, consentimentos, Registry, jobs, modelos de IA, Llama local, RAG, compartilhamento, times, colaboração e importação de arquivos.

11. Regra de consistência

Aplique a regra a seguir sem ampliar o escopo:  
- Embora o conteúdo das respostas da plataforma continue vindo dos fixtures e do ControleDemo, toda resposta que for efetivamente exibida como mensagem da conversa também deve ser persistida na tabela mensagens com autor = 'plataforma'.

- Ao recarregar o chat, as mensagens devem vir do banco; não gere novamente respostas simuladas já exibidas.

- Isso não transforma os resultados, auditoria ou pipeline em dados reais. Persistem apenas as mensagens que compõem a conversa.

- Na criação do primeiro chat, trate criação do chat e gravação da primeira mensagem como uma operação consistente, evitando deixar chat vazio se a mensagem falhar.

Não altere nenhum outro ponto do plano e não antecipe fases posteriores.