# Checkpoint final da F6D — provedor canônico, correção real e regressão

Blocos 1, 3, 5, 7, 8, 9, 10, 11 e 13 permanecem aprovados e não são reabertos.

## Parte A — Autorização de Voz de Marca por provedor canônico

Hoje a permissão guarda no campo de provedor um rótulo de exibição ("Provedor de nuvem B (Anthropic)"), e a checagem no servidor considera apenas a categoria. Por isso uma autorização vaza entre provedores.

Correção:

- Introduzir uma identidade interna estável de provedor (`openai`, `anthropic`), separada do rótulo amigável. O rótulo passa a ser apenas texto de tela.
- O provedor da permissão passa a ser derivado no servidor, a partir da versão do Registry fixada na etapa. O que o cliente envia deixa de ter autoridade: ele informa apenas categoria e escopo.
- A verificação de autorização passa a exigir, em conjunto: categoria, provedor canônico, etapa, finalidade e fotografia da execução.

A categoria continua representando o tipo de dado (resumo explícito de Voz de Marca). Não se criam categorias separadas por provedor.

Caminhos atualizados: autorização apenas desta execução, consentimento persistente de chat, consentimento persistente de conta, montagem da fotografia, reconciliação de consentimento, `categoriaAutorizada`, `briefingAutorizado`, especialistas Anthropic, Auditor OpenAI, correção Anthropic e auditoria final OpenAI.

Migração dos dados existentes:

- provedor derivável sem ambiguidade pela etapa e pela versão fixada do Registry → preenche o identificador canônico;
- ambíguo → não amplia nada: a permissão fica sem provedor canônico e a etapa correspondente volta a aguardar nova autorização;
- em nenhuma hipótese uma permissão ambígua vira acesso para os dois provedores.

Validação (5 cenários): só Anthropic; só OpenAI; ambos; nenhum; revogação. Confere, em cada caso, quem recebe o resumo explícito de Voz de Marca, o valor de `voz_marca_avaliavel`, `adequacao_voz_marca` (nota válida ou `null`, nunca inventada), a neutralização do fator no ranking, e o não vazamento entre provedores, entre escopos revogados e entre execuções.

## Parte B — Fechamento do bloco 2

Sem alterar roteamento. Pré-condição controlada apenas para provocar a reprovação inicial de um Hook e de uma Headline. A partir daí, fluxo real: correção pelo especialista de origem, mesma versão do Registry da geração, reserva, consentimento, chamada real ao provedor, reauditoria OpenAI e ranking.

Comprovações: Hook volta ao Hook Master; Headline volta ao Headline Architect; CTA já comprovado; segunda correção do mesmo item recusada pelo servidor; nenhuma terceira geração; original preservado no histórico; original e corrigida não competem ao mesmo tempo no ranking; só a corrigida aprovada é promovida.

## Parte C — Bloco 12

Regressão F1–F6C: autenticação e proteção de rotas, isolamento de pastas, chats e Voz de Marca entre contas, consentimentos em Memória Local Estrita e Híbrido Autorizado, Registry e versões publicadas, execução simulada explicitamente configurada e execução real OpenAI + Anthropic. Mais typecheck, build, preview e console.

Confirmações de segurança e escopo: nenhuma credencial no bundle cliente, nenhuma chave em banco ou logs, nenhuma rota temporária de diagnóstico, nenhum fallback silencioso para simulação, e Llama, WebLLM, adaptação local, memória adaptativa, RAG e corpus seguem fora da F6D.

## Detalhes técnicos

Migração no banco para acrescentar o provedor canônico em `consentimentos`, `consentimentos_historico` e `fotografias_consentimento`, com backfill conservador, e atualização das funções `registrar_consentimento`, `autorizar_execucao`, `autorizar_execucao_persistente`, `criar_execucao`, `reconciliar_consentimento_execucao` e `desbloquear_etapas` para operarem pelo par categoria + provedor canônico derivado do Registry.

No código: `src/lib/consentimento.functions.ts` deixa de aceitar provedor vindo do cliente; `especialista-etapa.server.ts`, `gatekeeper-etapa.server.ts`, `auditor.server.ts` e `correcao-etapa.server.ts` passam a consultar autorização pelo provedor da versão fixada; `ModalConsentimento.tsx` e a tela de privacidade mantêm o rótulo amigável apenas na exibição.

Esta etapa envolve chamadas pagas reais à OpenAI e à Anthropic.

## Entrega

Somente: resultado do bloco 6, resultado final do bloco 2, resultado do bloco 12, correções mínimas aplicadas, matriz consolidada 1–13 e veredito definitivo da F6D.