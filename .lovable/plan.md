# Plano de Implementação — Fase F0 (isolada)

Escopo exclusivo da F0: casca visual navegável, responsiva, em pt-BR, com dados simulados. **Nada de F1 em diante.**

Estado verificado: template em branco (TanStack Start + React 19 + Vite + Tailwind v4), `src/routes/index.tsx` ainda com o placeholder, sem backend, sem integrações.

## Passo 0 — Persistir o Plano Mestre na memória

Antes de qualquer código, gravar o Plano Mestre v2.1 como memória do projeto (`mem://index.md` + arquivos por tema: pipeline canônico, privacidade e modos, execução de jobs e limitações, Registry e custos, regras anti-injection, regra "uma fase por vez"). Isso garante que as fases seguintes sigam a referência arquitetural sem depender do histórico do chat.

## Fora do escopo (não será tocado)

Lovable Cloud, autenticação real, banco, persistência, APIs externas, Secrets, Edge Functions, WebLLM, Llama local real, Registry funcional, custos reais. Nenhuma chamada de rede.

---

## 1. Design system (`src/styles.css`)

Paleta semântica em oklch para tema claro e escuro, com identidade própria — nada de Inter/Poppins nem gradiente roxo genérico. Tokens adicionais além dos existentes: superfícies de painel lateral, estados de execução (pendente, em curso, aprovado, reprovado, cancelado, incerto), destaque de adaptação local, alerta de privacidade. Tipografia carregada via `<link>` no `__root.tsx` (nunca `@import` remoto no CSS). Raios, sombras e espaçamento consistentes.

Regra dura: nenhum componente usa cor literal (`text-white`, `bg-[#...]`) — só tokens.

## 2. Layout de três colunas (mobile-first)

- **Coluna esquerda — Conhecimento:** pastas colapsáveis, busca no histórico, lista de chats, ações de renomear/mover (visuais).
- **Centro — Workspace:** cabeçalho do chat com selo de modo de privacidade, thread de mensagens, composer multiformato (texto/rascunho/briefing estruturado), área de resultados.
- **Coluna direita — Parâmetros:** nível de consciência, tom de voz, formato de saída (Hook, Headline Vídeo, Headline Imagem, CTA), pessoa gramatical, objetivo (Viralizar/Autoridade), seletor de perfil de Voz de Marca.

Em ≤768px as laterais viram drawers acionáveis pelo cabeçalho; o centro nunca perde espaço útil. Breakpoints validados em 375, 768 e 1440.

## 3. Rotas navegáveis (só apresentação)

| Rota | Conteúdo |
| :-- | :-- |
| `/` | Substitui o placeholder; entrada do produto com acesso ao workspace |
| `/auth` | Formulário visual de login/cadastro (sem lógica) |
| `/onboarding` | Voz de Marca inicial + oferta não obrigatória da IA local |
| `/app` | Workspace com chat de demonstração |
| `/app/c/$chatId` | Chat específico (dados simulados) |
| `/config/voz-de-marca` | Lista de perfis de marca + editor visual |
| `/config/preferencias` | Preferências explícitas x inferidas (mock) |
| `/config/ia-local` | Status, requisitos, tamanho, progresso, remoção (mock) |
| `/config/privacidade` | Modos por chat, consentimentos, linha do tempo de envios |
| `/admin/agentes` | Tabela do Registry com rascunho/publicado/histórico (somente leitura visual) |

Cada rota de conteúdo com `head()` próprio: título e descrição específicos em pt-BR, mais og/twitter. Um único H1 por página, HTML semântico.

## 4. Componentes de apresentação

Cartão de variação (texto, três notas do scorecard, justificativa, ações favoritar/editar/descartar, marcação de versão: original / corrigida / adaptada / final). Timeline do pipeline na **ordem canônica** — Gatekeeper → Análise Psicológica → Especialistas → Auditoria → Correção única → Adaptação local → Validação de preservação → Ranking → Entrega. Painel de curadoria com as 3 melhores por formato. Diff lado a lado (antes/depois da adaptação). Selo de status da IA local. Modal de consentimento com detalhamento de dados, etapas e provedores. Indicador de processamento local x nuvem. Barra de busca e árvore de pastas. Composer.

Componentes pequenos e focados, organizados por área (`layout/`, `chat/`, `pipeline/`, `privacy/`, `brand/`).

## 5. Estados simulados (todos alcançáveis)

Um controle de demonstração (visível só em desenvolvimento) permite alternar entre: vazio; briefing insuficiente (pergunta da Dor Central); executando por etapa; adaptação local em curso; validação de preservação reprovada; resultado parcial (um especialista falhou); cancelado — **com aviso de que a chamada remota pode continuar e gerar custo**; erro de provedor; consentimento pendente; resultado externo incerto (`unknown_outcome`); IA local ausente / baixando / pronta / incompatível; offline.

Todos os dados vêm de fixtures locais tipadas, sem rede.

---

## Critérios de aceite da F0

1. Placeholder do index removido; `/` renderiza o produto.
2. As dez rotas navegam sem erro e cada uma tem título e descrição próprios em pt-BR.
3. Layout íntegro em 375px, 768px e 1440px; laterais colapsam e reabrem no celular sem quebra nem scroll horizontal.
4. Todos os estados listados na seção 5 são alcançáveis pelo controle de demonstração e renderizam corretamente.
5. A timeline exibe a ordem canônica do pipeline, com a adaptação local **antes** do ranking.
6. O cartão de variação distingue visualmente as quatro versões (original, corrigida, adaptada, final).
7. O estado cancelado exibe o aviso honesto de custo remoto possível; nenhum texto afirma "geração totalmente local".
8. Nenhuma cor literal fora dos tokens; tema claro e escuro com contraste adequado.
9. Nenhum texto em inglês na interface.
10. Nenhuma dependência de rede, nenhuma chamada a provedor, nenhum arquivo de backend criado.
11. Console sem erros; verificação de tipos e build passam.

Após a F0 aprovada, volto ao Plan Mode para a F1 — nada da F1 será antecipado aqui.
