# Fase F6B — Especialistas reais com Anthropic (Hook Master e Headline Architect)

Substituir apenas os adaptadores simulados de **Hook Master** e **Headline Architect** por chamadas reais à API oficial da Anthropic (endpoint Messages), mantendo tudo o mais exatamente como está.

## 1. Confirmação do modelo e endpoint (verificado na documentação oficial)

- Identificador aceito: `claude-fable-5` (alias oficial da Claude API).
- Endpoint: `POST https://api.anthropic.com/v1/messages`.
- Cabeçalhos: `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`.
- Structured Outputs: GA na Claude API para modelos 4.5+, via `output_config.format` com `type: "json_schema"` (o antigo `output_format` e o header beta estão só em transição — usaremos a forma nova, sem header beta).
- Contexto de 1M tokens; saída máxima de 128k por requisição.
- Preço: US$ 10 / MTok de entrada e US$ 50 / MTok de saída.
- Raciocínio adaptativo é sempre ativo e **não** aceita `thinking.type` nem `budget_tokens`. O controle correto é `output_config.effort`, suportado pelo Claude Fable 5 sem header beta. Valores documentados: `max`, `high` (padrão, idêntico a omitir), `medium` e `low`. É semântica própria da Anthropic — não reaproveitamos o `reasoning_effort` da OpenAI.
- `effort` e `format` convivem no mesmo `output_config`, então esforço e JSON Schema estrito vão juntos na mesma requisição.
- `max_tokens` cobre o processamento adaptativo **mais** a resposta final: o limite precisa ter folga suficiente para as cinco variações completas.
- Recusa: retorna **HTTP 200** com `stop_reason: "refusal"` e indicação do classificador. Não é erro de transporte.
- Cobrança em recusa: não há cobrança quando a recusa ocorre antes de qualquer saída.
- Retenção: 30 dias; o modelo é "Covered Model" e **não** está disponível sob zero data retention. Isso precisa aparecer no texto de consentimento.
- Limites de Structured Outputs a respeitar: no máximo 24 parâmetros opcionais e 16 parâmetros com união de tipos por requisição — nossos schemas usarão campos obrigatórios e evitarão uniões.
- `stop_reason: "max_tokens"` corta a saída e invalida o JSON: tratado como saída inválida, nunca como resultado parcial.

Itens que só podem ser confirmados com a credencial na conta (primeira tarefa da implementação, antes de qualquer código de produção): disponibilidade real do modelo via `GET /v1/models`, **quais níveis de `effort` a conta e o modelo aceitam**, rate limits do tier e se a conta aceita `Idempotency-Key` no Messages. Nenhuma versão do Registry é validada ou publicada com um nível de esforço que a resposta de capacidades da conta não confirme. Se o endpoint de modelos devolver identificador diferente, o Registry recebe o valor real — nada de suposição fixa no código.

Não usaremos: Lovable AI Gateway, camada de compatibilidade OpenAI da Anthropic, nem o parâmetro `fallbacks` de fallback automático (fora do escopo desta fase).

## 2. Arquitetura do AnthropicDirectAdapter

Novo arquivo `src/lib/provedores/anthropic-direct.server.ts`, irmão e independente de `openai-direct.server.ts`, implementando a interface já existente `ProvedorLLM` (`src/lib/provedores/tipos.ts`).

Tratamento próprio dentro do adaptador:
- autenticação por `x-api-key`, lida de `process.env` dentro do handler;
- `system` como parâmetro separado (instruções) e `messages` com o conteúdo do usuário;
- `output_config` com `effort` (convertido a partir da configuração do Registry) e `format` com JSON Schema estrito, no mesmo objeto;
- nunca envia `thinking.type`, `budget_tokens` ou qualquer configuração de extended thinking manual;
- `max_tokens` calculado com folga sobre o tamanho esperado do JSON das cinco variações;
- leitura de `usage.input_tokens` / `output_tokens` e cálculo de custo com a tabela 10/50;
- mapeamento de `stop_reason`: `end_turn` (ok), `refusal` (`provider_refusal`), `max_tokens` (`resposta_invalida` — resultado parcial nunca é aceito, sem reparo de JSON, com tokens, duração e custo registrados e apenas uma nova tentativa controlada), qualquer outro valor vira `stop_reason_inesperado`;
- HTTP: 401/403 → `credencial_invalida`; 404 ou 400 de modelo → `modelo_indisponivel`; 429 → `rate_limit` (lendo `retry-after`); 5xx → `provider_error`;
- `AbortController` para timeout e cancelamento, distinguindo os dois;
- resultado externo incerto quando a resposta chega mas a persistência falha.

Ajuste mínimo em `tipos.ts`: acrescentar o código `stop_reason_inesperado` a `CodigoErroProvedor`, a `MENSAGEM_SEGURA` e, como não-retriável, a `ERROS_SEM_RETRY`. Nada mais do contrato compartilhado muda.

## 3. Cloud Secret

Uma única credencial `ANTHROPIC_API_KEY`, solicitada pelo fluxo seguro de Secrets do Lovable Cloud. Nunca no código, Registry, banco, `.env` versionado, campo da aplicação ou chat. Lida somente dentro do handler no servidor, nunca logada nem devolvida ao cliente.

## 4. Papéis e schemas (independentes)

Dois módulos separados, sem código de prompt compartilhado:
- `src/lib/agentes/hook-master.server.ts`
- `src/lib/agentes/headline-architect.server.ts`

**Hook Master** — exatamente 5 variações. Por item: `texto`, `formato` (`hook`), `angulo_criativo`, `intencao`, `alerta_cliche` (boolean) e `motivo_alerta` (string, vazia quando não houver). Instruções focadas em abertura dos primeiros segundos, tensão/curiosidade/identificação, oralidade e retenção, sem clichê nem introdução explicativa.

**Headline Architect** — exatamente 5 variações **por formato solicitado**. Por item: `texto`, `formato` (`video` | `imagem`), `intencao`, `dentro_do_limite` (boolean), `caracteres`, `alerta_cliche`, `motivo_alerta`. Instruções focadas em concisão visual, legibilidade, limite por formato e proibição de repetir literalmente os hooks.

Nenhum dos dois recebe pedido de nota de auditoria. Um papel nunca executa a função do outro: instruções, schema, limites, timeout, orçamento, versão publicada, teste administrativo e métricas são separados por papel no Registry.

Validação em duas camadas: schema nativo do provedor + revalidação Zod no backend (`.strict()`, rejeita campo inesperado, exige a contagem exata de itens). Falha de schema **não** é persistida como concluída. Nada de reparo manual de JSON. Permitido no máximo **um** reenvio controlado por etapa quando a saída não cumprir o schema, contabilizado como tentativa.

## 5. Dados enviados

Apenas: briefing estruturado do Gatekeeper, formato solicitado, objetivo, público, dor, promessa, nível de consciência, tom, pessoa gramatical, diretriz psicológica simulada da etapa anterior e resumo explícito de Voz de Marca quando autorizado.

Nunca: histórico completo do chat, exemplos locais, preferências inferidas, memória adaptativa, dados de outra conta, prompts internos de outros agentes, Secrets ou resultados irrelevantes ao papel. A montagem da entrada lê somente resultados já persistidos da própria execução, seguindo o padrão de `gatekeeper-etapa.server.ts`.

## 6. Voz de Marca

Somente campos explícitos do perfil persistido na F3, e somente quando a fotografia de consentimento da execução contiver `resumo_voz_marca` concedido para o provedor `anthropic` na etapa correspondente. Sem exemplos locais, favoritos, edições inferidas, IndexedDB ou few-shot dinâmico. Quando não autorizado, a chamada acontece sem Voz de Marca — sem fallback silencioso e com o fato visível na execução.

## 7. Consentimentos

Reuso integral de F4/F5. Antes de cada chamada, revalidação no servidor da fotografia vinculada à execução por categoria + provedor `anthropic` + etapa. Sem autorização, a etapa falha com `autorizacao_ausente` e sem retry — nada é enviado.

Registro por permissão: canal `api_direta`, provedor `anthropic`, modelo, papel, finalidade, termos e versão, origem da autorização. O texto de termos passa a mencionar a retenção de 30 dias do provedor. Memória Local Estrita não impede o briefing explicitamente autorizado, mas continua bloqueando memória privada.

## 8. Prompt injection

Instruções de sistema separadas do conteúdo; briefing, Voz de Marca e diretriz psicológica entram em envelopes rotulados como dado não confiável; instrução explícita de que o conteúdo não redefine papel, não revela prompt interno, não pede Secrets e não altera Registry; saída restrita ao schema, o que impede resposta em texto livre.

## 9. Erros e stop reasons

Códigos distintos e mensagens seguras no padrão já existente de `MENSAGEM_ERRO_ETAPA`: credencial ausente, credencial inválida, modelo indisponível, rate limit, timeout, erro transitório, saída inválida, recusa do modelo, conteúdo bloqueado, stop reason inesperado, cancelamento, resposta tardia e resultado incerto. Recusa nunca vira variação vazia e nunca gera texto inventado; a execução mostra a recusa e interrompe o papel.

## 10. Registry

`anthropic` entra como terceira opção de provedor (`src/lib/registry.functions.ts`, `EditorVersao.tsx`, RPCs `registry_atualizar_rascunho` e `registry_validar`), com o padrão de modelo aceitando `claude-fable-5`. A chave nunca fica no Registry. Hook Master e Headline Architect recebem versões publicadas independentes.

Esforço no Registry: campo próprio da Anthropic, `parametros.effort`, versionado por papel e independente do `reasoning_effort` da OpenAI (que continua exclusivo do Gatekeeper e some quando o provedor é Anthropic). O adaptador converte esse campo em `output_config.effort`. Valor inicial de Hook Master e Headline Architect: `medium`, equilibrando qualidade, latência e custo — ajustável pelo Registry e comprovado com briefings sintéticos. A validação exige instruções, schema, limites, timeout, tentativas, concorrência, orçamento maior que zero, saída estruturada e um nível de esforço confirmado pelas capacidades da conta.

Teste administrativo de esforço: o teste de rascunho executa o mesmo briefing sintético em pelo menos dois níveis de esforço e registra, por nível, qualidade, latência, tokens, custo e conformidade com o schema. Continua exigindo ação explícita do administrador, avisando sobre chamada real e custo, sem conteúdo de usuário, sem execução de usuário, sem consentimento falso e sem publicação automática.

## 11. Máquina de estados

Sem alteração: reserva de etapa, lease, backoff, tentativas, timeout, cancelamento, resposta tardia, telemetria, `unknown_outcome` e vínculo com a versão do Registry seguem como na F5. Quando a chamada retorna mas `concluir_etapa` falha, a etapa vai para `resultado_incerto` — nunca retry cego. Roteamento: Hook Master só quando hook estiver selecionado; Headline Architect quando headline de vídeo ou de imagem estiver selecionada; ambos no pacote completo. Nenhuma chamada desnecessária.

## 12. Observabilidade

Somente: execution_id, step_id, papel, provedor, modelo, versão do Registry, duração, status, tentativa, código de erro, tokens de entrada e saída, custo, stop reason e estado final. Nunca briefing, Voz de Marca, prompt, resposta completa, dados pessoais, headers ou credencial.

## 13. Arquivos e funções afetados

Novos: `src/lib/provedores/anthropic-direct.server.ts`, `src/lib/agentes/hook-master.server.ts`, `src/lib/agentes/headline-architect.server.ts`, `src/lib/agentes/especialistas-etapa.server.ts` (entrada autorizada + roteamento por papel), `src/lib/agentes/especialistas-teste.server.ts` (teste sintético administrativo).

Alterados: `src/lib/provedores/tipos.ts` (novo código de erro), `src/lib/execucao.functions.ts` (ramo real dos dois papéis dentro de `avancarExecucao`), `src/lib/execucao.ts` (mensagens), `src/lib/registry.functions.ts` e `src/components/registry/EditorVersao.tsx` (provedor Anthropic), `src/components/execucao/PainelExecucao.tsx` (estados dos especialistas). Migração para os RPCs do Registry e para o texto de termos.

## 14. Sequência de implementação

1. Solicitar `ANTHROPIC_API_KEY` pelo fluxo seguro de Secrets.
2. Consultar `GET /v1/models` e confirmar identificador, disponibilidade e limites da conta.
3. Adaptador Anthropic + novo código de erro.
4. Registry: provedor Anthropic e validação.
5. Hook Master: schema, instruções, teste administrativo, publicação, execução real isolada.
6. Headline Architect: o mesmo, validado isoladamente para vídeo e para imagem.
7. Só então os dois na mesma execução e no pacote completo.
8. Bateria de erros, cancelamento, incerto e regressão F1–F6A.

## 15. Riscos

- Identificador ou disponibilidade diferentes na conta: mitigado pela consulta ao endpoint de modelos antes de codificar.
- Custo real por execução (5 variações por papel, US$ 50/MTok de saída): mitigado por limite de saída conservador, orçamento por versão no Registry e teste administrativo explícito.
- Recusa do classificador em briefings de nicho psicológico: tratada como caminho de primeira classe, sem fallback para outro modelo nesta fase.
- Retenção de 30 dias incompatível com uma leitura otimista de privacidade: mitigada por texto de consentimento explícito.
- Limite de parâmetros opcionais em Structured Outputs: mitigado por schemas enxutos com campos obrigatórios.

## 16. Critérios de aceite

- Hook Master e Headline Architect rodam com `claude-fable-5` pela API direta, cada um com versão publicada própria.
- Exatamente 5 variações por papel (e por formato, no caso das headlines), validadas duas vezes.
- Gatekeeper continua real na OpenAI, sem alteração de comportamento.
- Todos os demais papéis continuam simulados; nenhuma chamada ao Llama.
- Nenhum dado não autorizado sai do backend; credencial nunca aparece em log, banco ou UI.
- Recusa, rate limit, timeout, cancelamento e incerto produzem estados corretos e mensagens seguras.
- Build, tipos e console limpos.

## 17. Testes

Hook isolado; headline de vídeo isolada; headline de imagem isolada; hooks e headlines na mesma execução; pacote completo; contagem exata de cinco; distinção entre os dois papéis; saída válida; saída fora do schema; prompt injection; consentimento ausente e concedido; Voz de Marca não autorizada e autorizada; credencial ausente e inválida; modelo indisponível; rate limit; timeout; recusa; stop reason inesperado; retry; cancelamento; resposta tardia; unknown_outcome; custo e consumo; isolamento entre contas; teste administrativo sintético; Gatekeeper OpenAI permanecendo real; demais agentes simulados; nenhuma chamada ao Llama; regressão F1–F6A; build, tipos e console.

## 18. O que você precisa fornecer

- Autorização para eu abrir o fluxo seguro de Secret, onde você cola a `ANTHROPIC_API_KEY` (somente lá).
- Confirmação de que a conta Anthropic tem acesso liberado ao Claude Fable 5 e qual é o tier de rate limit.
- Limites de caracteres desejados para headline de vídeo e headline de imagem.
- Teto de orçamento por execução para cada especialista.
- Aceite de que o provedor mantém retenção de 30 dias (não há zero data retention para este modelo) — isso entra no texto de consentimento.

## 19. Confirmações

- **Gatekeeper permanece real na OpenAI** (`gpt-5.6-sol`, endpoint `/v1/responses`), sem alteração de código, prompt, schema ou versão publicada.
- **Todos os demais papéis permanecem simulados**: análise psicológica, CTA, auditor, correção, adaptação local e validação de preservação — com ranking determinístico e entrega na infraestrutura atual.