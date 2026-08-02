# Fase F3 — Voz de Marca persistente

## 1. Objetivo

Substituir os fixtures de Voz de Marca por perfis reais e persistentes no Lovable Cloud. Cada conta mantém vários perfis (marcas ou clientes), define um padrão, associa perfil a pastas e pode substituir o perfil em um chat específico. Somente informações explícitas cadastradas pelo usuário são persistidas. Todo o conteúdo de IA, pipeline, auditoria e resultados continua simulado sob o ControleDemo.

## 2. Modelo de dados

**perfis_marca** (`user_id uuid not null default auth.uid()`)

- `id uuid pk`, `nome text not null` (1–80)
- `descricao text` (0–1000) — identidade
- `publico text` (0–600), `posicionamento text` (0–1000)
- `personalidade text` (0–600), `tom_de_voz text` (0–300)
- `preferidas text[]` — até 60 itens, cada um até 60 chars
- `evitadas text[]` — mesmos limites
- `principios text` (0–1500) — princípios e restrições éticas
- `orientacoes text` (0–2000) — orientações de escrita
- `padrao boolean not null default false`
- `criado_em`, `atualizado_em`

**exemplos_marca**

- `id uuid pk`, `user_id`, `perfil_id uuid not null → perfis_marca(id) on delete cascade`
- `titulo text` (0–120), `texto text not null` (1–4000)
- `criado_em`, `atualizado_em`
- limite de 30 exemplos por perfil, validado em função de servidor

**Alterações em tabelas da F2**

- `pastas.perfil_marca_id uuid null → perfis_marca(id) on delete set null`
- `chats.perfil_marca_id uuid null → perfis_marca(id) on delete set null` (substituição explícita do chat)

Integridade:

- Índice único parcial `unique (user_id) where padrao` garante no máximo um perfil padrão por conta.
- Trigger `before insert/update` em `pastas` e `chats` valida que o `perfil_marca_id` referenciado pertence ao mesmo `user_id` (usa função security definer `perfil_e_meu`, no mesmo padrão de `pasta_e_minha` da F2).
- Trigger `before insert/update` em `exemplos_marca` valida que o perfil pertence ao usuário.
- Triggers de `atualizado_em` nas duas novas tabelas.
- Excluir perfil não apaga pasta nem chat: os vínculos viram nulos e os itens caem para a próxima regra de herança.

Índices: `perfis_marca(user_id, nome)`, único parcial de padrão, `exemplos_marca(perfil_id, criado_em)`, `pastas(perfil_marca_id)`, `chats(perfil_marca_id)`.

## 3. Regras de herança

Prioridade de resolução do perfil ativo de um chat:

```text
1. chats.perfil_marca_id           -> origem: "chat"
2. pastas.perfil_marca_id          -> origem: "pasta"
3. perfis_marca padrao = true      -> origem: "padrao"
4. nenhum                          -> origem: "nenhum"
```

- A resolução acontece no servidor, em uma única função que devolve `{ perfil, origem }`.
- A interface sempre exibe a origem: "herdado da pasta X", "perfil padrão", "definido neste chat", "nenhum perfil".
- Remover a substituição do chat = gravar `null` em `chats.perfil_marca_id`, voltando à herança.
- Trocar o padrão é operação atômica: limpa o padrão anterior e marca o novo na mesma transação.

## 4. Políticas de acesso

- `GRANT SELECT, INSERT, UPDATE, DELETE` para `authenticated`; `GRANT ALL` para `service_role`; nenhum grant para `anon`.
- RLS habilitada nas duas tabelas novas, políticas separadas por operação, todas `TO authenticated`, escopadas em `auth.uid() = user_id` em USING e WITH CHECK.
- WITH CHECK adicional em `pastas` e `chats`: `perfil_marca_id` nulo ou pertencente ao usuário.
- `user_id` nunca vem do frontend: default `auth.uid()` no banco e `context.userId` nas funções de servidor com `requireSupabaseAuth`.
- Perfil inexistente e perfil de outra conta produzem exatamente a mesma resposta neutra, sem revelar existência.

## 5. Rotas e componentes afetados

Nenhuma rota nova, nenhuma removida.

- `src/routes/_authenticated/config/voz-de-marca.tsx` — lista real, criar, editar, renomear, duplicar, excluir, definir padrão, gerenciar exemplos.
- `src/routes/_authenticated/onboarding.tsx` — o passo 1 passa a criar de fato o primeiro perfil (definido como padrão) e reconhece quando já existe perfil, permitindo atualizar.
- `src/components/layout/PainelParametros.tsx` — seletor real com opções "herdar" e perfis do usuário, mais rótulo de origem.
- `src/components/layout/PainelPastas.tsx` — diálogo de pasta ganha o campo de perfil associado (criar e editar pasta).
- `src/components/chat/ResumoContexto.tsx` e `src/components/chat/Workspace.tsx` — mostram o perfil resolvido e a origem, em vez do texto fixo.
- Novos: `src/lib/marca.functions.ts` (funções de servidor), `src/lib/marca.ts` (queryOptions e tipos), formulário de perfil e diálogo de exclusão com impacto.

Preservados sem mudança de identidade: AppShell, MenuConta, ControleDemo, Thread, Composer, AreaResultados, CartaoVariacao, layout de três colunas.

## 6. Estratégia para substituir fixtures

1. Remover `PERFIS_MARCA` do uso em runtime; o tipo `PerfilMarca` migra para `src/lib/marca.ts` alinhado ao schema.
2. Manter os mesmos componentes visuais; muda só a origem dos dados.
3. Toda leitura/escrita por funções de servidor autenticadas, com TanStack Query e invalidação (`["marca","lista"]`, `["marca","perfil",id]`, `["marca","resolvido",chatId]`).
4. Loaders são seguros porque as rotas já vivem sob `_authenticated`.
5. Atualização otimista apenas em renomear e definir padrão; criar, duplicar e excluir aguardam o servidor.
6. Fixtures de pipeline em `src/lib/fixtures.ts` permanecem intactos.

## 7. Sequência de implementação

1. Migração: `perfis_marca`, `exemplos_marca`, colunas em `pastas`/`chats`, grants, RLS, triggers, índices, único parcial de padrão.
2. `marca.functions.ts`: listar, obter, criar, atualizar, renomear, duplicar, excluir (com relatório de impacto), definir padrão, CRUD de exemplos, definir perfil de pasta, definir/remover substituição do chat, resolver perfil ativo.
3. Página de configuração de Voz de Marca com todos os estados.
4. Seletor no painel de parâmetros e rótulo de origem no resumo contextual.
5. Campo de perfil no gerenciamento de pasta.
6. Onboarding real de criação/atualização do primeiro perfil.
7. Limpeza dos fixtures de marca e validação completa.

Estados de interface cobertos: carregando, nenhum perfil, criação, edição, duplicação, exclusão com impacto, padrão, herdado da pasta, substituído no chat, erro, não encontrado, acesso a perfil de outra conta (tela neutra idêntica ao não encontrado).

## 8. Riscos

- **Corrida ao definir padrão** — mitigada por operação atômica no servidor e índice único parcial.
- **Exclusão quebrando vínculos silenciosamente** — mitigada pelo diálogo que informa quantas pastas e chats usam o perfil, permite cancelar ou escolher substituto, e por `on delete set null`.
- **Vínculo cruzado entre contas** — mitigado por triggers de propriedade além da RLS.
- **Sobrecarga visual do formulário** (muitos campos) — mitigada por seções colapsáveis, mantendo a simplificação aprovada.
- **Regressão na F2** — mitigada por alterar `pastas`/`chats` apenas com colunas anuláveis e rodar a regressão completa da F2.
- **Fixture ainda referenciado** — mitigado removendo o export usado em runtime e deixando o typecheck apontar.

## 9. Critérios de aceite

- Vários perfis por conta persistem após recarregar, sair e entrar de novo.
- Editar, renomear e duplicar funcionam; a duplicata nunca nasce como padrão.
- Existe no máximo um padrão por conta, garantido pelo banco.
- Pasta com perfil associado propaga para seus chats; chat pode substituir e voltar à herança.
- A interface sempre informa a origem do perfil ativo.
- Excluir perfil em uso mostra o impacto, permite cancelar, e os itens afetados caem para a próxima regra de herança sem erro.
- Conta B não vê nem referencia perfis da conta A, inclusive por URL ou id direto.
- Exemplos de escrita são armazenados e não são enviados a nenhum modelo.
- F1 e F2 intactas; identidade visual, layout, responsividade e ControleDemo preservados.
- Build, tipos e console limpos.

## 10. Testes

Automatizados via navegador com duas contas reais: criar múltiplos perfis; editar; renomear; duplicar; definir e trocar o padrão; associar perfil a uma pasta; criar chat na pasta e confirmar herança e rótulo de origem; substituir perfil no chat; remover a substituição; excluir perfil em uso confirmando aviso de impacto e retorno à herança; persistência após recarregar e novo login; isolamento entre contas; tentativa de usar id de perfil de outra conta (resposta neutra); regressão de F1 e F2 (login, pastas, chats, mensagens, busca); regressão visual em 375, 768 e 1440 px; build, typecheck e console sem erros.

## 11. Confirmação de escopo

Nenhuma fase posterior será antecipada. Ficam de fora desta fase: preferências inferidas, aprendizado por favoritos e edições, few-shot dinâmico, memória adaptativa em IndexedDB, embeddings, RAG, Llama local real, processamento da Voz de Marca por modelos, pipeline, auditoria real, Registry, jobs, consentimentos avançados da F4, integrações externas, compartilhamento, times e colaboração.
