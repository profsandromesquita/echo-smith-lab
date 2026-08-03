# Fase F6A — Gatekeeper com API oficial da OpenAI (integração direta)

Objetivo: substituir **apenas** o adaptador simulado do papel `gatekeeper` por uma chamada real à API oficial da OpenAI, feita exclusivamente no backend, com credencial em Cloud Secrets. Todos os demais papéis continuam com os adaptadores simulados da F5. A máquina de estados da F5 não muda.

Decisão atualizada: **não** usar o Lovable AI Gateway nesta fase. A OpenAI entra como Any API autenticada, chamada por função segura de backend.

## 1. Arquitetura do adaptador OpenAI direto

Interface desacoplada de provedor, com uma única implementação nesta fase.

```text
avancarExecucao (src/lib/execucao.functions.ts)
  -> reservar_etapa (lease da F5)
  -> papel == gatekeeper E versao publicada com provedor "openai"?
        sim -> executarGatekeeper (src/lib/agentes/gatekeeper.server.ts)
                 -> montarEnvelope (entrada validada por zod)
                 -> OpenAIDirectAdapter.gerar() (src/lib/provedores/openai-direct.server.ts)
                 -> validacao local do JSON + regras condicionais de dominio
        nao -> executarAdaptadorSimulado (inalterado)
  -> concluir_etapa | falhar_etapa (RPCs da F5, sem mudanca)
```

Camadas:
- `ProvedorLLM` (contrato): `gerar(entrada, opcoes, sinal) -> { objeto, uso, custo, requisicao_id, desfecho }`. Contrato único que a futura `AnthropicDirectAdapter` (F6B) implementará em arquivo separado.
- `OpenAIDirectAdapter`: implementação própria de requisição, autenticação, saída estruturada estrita, mapeamento de erros, rate limit, timeout, consumo, custo, cancelamento, idempotência externa (quando suportada) e resultado externo incerto. Sem qualquer herança de código do Gateway.
- `gatekeeper.server.ts`: domínio puro — envelope, schemas, regras condicionais. Não conhece HTTP nem credencial.

**Runtime.** Esta stack (TanStack Start no Lovable Cloud) não usa Supabase Edge Functions: a "função segura equivalente" é uma server function (`createServerFn` com `requireSupabaseAuth`), que roda apenas no servidor e lê o Secret de `process.env` dentro do handler. A regra exigida é cumprida: backend-only, credencial fora do bundle do cliente.

A chave nunca entra em banco, Registry, arquivo versionado, log, telemetria ou resposta ao cliente.

## 2. Documentação e identificadores a confirmar antes de codar

Consulta obrigatória à documentação oficial da OpenAI (não hardcodar identificador a partir do nome comercial "GPT-5.6 Sol"):
- identificador real e atual do modelo;
- endpoint recomendado hoje (Responses vs Chat Completions) e formato do corpo;
- parâmetros aceitos e nomes exatos (limite de saída, esforço de raciocínio, verbosidade);
- níveis de esforço suportados — o Gatekeeper usará **baixo ou médio**, nunca alto sem justificativa;
- suporte a saída estruturada estrita e restrições de schema;
- limites de contexto e de saída;
- formato das métricas de uso (tokens de entrada/saída, tokens de raciocínio, cache);
- política de retenção de dados;
- preços por token;
- suporte a idempotência externa (cabeçalho) e semântica de repetição;
- comportamento de cancelamento/abort.

O identificador confirmado será gravado na versão publicada do Registry, não no código.

## 3. Credencial e Cloud Secrets

- Nome do Secret: `OPENAI_API_KEY`.
- Solicitado exclusivamente pelo fluxo seguro de Secrets do Lovable, no passo 1 da sequência de implementação.
- Nunca pedida no chat comum, em código, no Registry, em `.env` versionado, em variável pública nem em campo da aplicação.
- Se a chave não existir no momento da implementação, a execução para nesse ponto e o fluxo seguro é aberto para você.
- Leitura só dentro do handler da server function; nunca em escopo de módulo.
- Ausência de chave em produção = etapa falha com erro de configuração. Nunca cai para simulado.

## 4. Dados enviados e recebidos

Enviado (envelope estruturado, campos nomeados e tipados):
- briefing atual autorizado (conteúdo não confiável, delimitado);
- formato solicitado;
- objetivo;
- nível de consciência;
- tom de voz;
- pessoa gramatical;
- contexto mínimo da conversa, só quando necessário e limitado;
- instruções de sistema vindas da versão publicada do Registry.

Não enviado: exemplos locais privados, preferências inferidas, memória adaptativa, histórico completo, dados de outras contas, Secrets, instruções internas de outros agentes.

Recebido: objeto JSON validado (seção 5), métricas de uso, custo (calculado a partir de tokens e preço configurado, ou retornado quando houver), identificador de requisição do provedor.

O texto do usuário é sempre dado, nunca instrução: instruções de sistema e conteúdo do usuário viajam em partes separadas do envelope, com instrução explícita de que o conteúdo não pode redefinir papel, revelar prompt interno, Secrets ou configurações.

## 5. Schema do Gatekeeper

Entrada validada por zod antes do envio; truncagem pelo `limite_entrada` da versão publicada.

Saída (saída estruturada estrita na API quando suportada + revalidação local por zod, com rejeição de campos inesperados):
- `suficiente`: boolean;
- `lacunas`: lista fechada dentre `publico`, `dor`, `promessa`, `contexto`, `objetivo`;
- `pergunta_de_refinamento`: texto curto ou nulo;
- `briefing_estruturado`: objeto (`publico`, `dor`, `promessa`, `contexto`, `objetivo`) ou nulo;
- `resumo_seguro`: texto curto, exibível ao usuário;
- `sinalizadores`: lista fechada de alertas permitidos (ex.: `conteudo_suspeito`, `pii_detectada`, `briefing_contraditorio`).

Regras condicionais aplicadas no backend após a validação de schema:
- `suficiente = false` exige `pergunta_de_refinamento` preenchida e `briefing_estruturado` nulo;
- `suficiente = true` exige `briefing_estruturado` completo e `pergunta_de_refinamento` nula;
- pergunta e briefing não podem contradizer `suficiente`;
- qualquer campo extra invalida a resposta.

Persistência só após schema válido **e** regras condicionais cumpridas. JSON inválido nunca é reparado manualmente; no máximo **uma** nova chamada controlada, e falha definitiva depois disso.

O Gatekeeper não gera hook, headline ou CTA, não faz análise psicológica, não audita, não altera outros agentes, não revela instruções internas nem raciocínio do modelo (o raciocínio não é solicitado nem persistido).

## 6. Integração com o Registry

Fonte única de configuração da chamada: provedor, modelo, instruções, schema, esforço de raciocínio, limite de entrada, limite de saída, timeout, tentativas, parâmetros permitidos, orçamento estimado, estado ativo e versão publicada.

- A etapa já grava `registry_versao_id`; a chamada usa exatamente essa versão, nunca a versão corrente.
- Ajuste necessário: hoje `registry.functions.ts` aceita apenas `modelo` no padrão `^mock-...`. Passa a aceitar identificadores reais por allowlist explícita, com `provedor` em `{ simulado, openai }`.
- `provedor = "simulado"` mantém o comportamento atual; só `openai` dispara chamada real.
- Nenhuma credencial no Registry.

### Teste administrativo de rascunho (seção 14 do pedido)
`testarRascunho` do Gatekeeper com provedor real:
- iniciado explicitamente pelo administrador técnico;
- usa apenas briefing sintético embutido no código, nunca dado de usuário;
- exibe aviso de chamada real com custo antes de confirmar;
- grava em `registry_registrar_teste` com marca de teste administrativo;
- não cria execução de usuário, não cria fotografia de consentimento, não publica nem altera a versão publicada.

## 7. Integração com consentimentos

Reuso integral de F4 e F5. Antes da chamada, o servidor confirma na **fotografia da execução** (não no consentimento corrente):
- categoria `briefing` autorizada;
- etapa `Gatekeeper` autorizada;
- provedor OpenAI;
- finalidade;
- termos e versão aplicável;
- origem da autorização.

Sem esses itens a etapa fica `bloqueada` e a UI oferece autorizar (fluxo existente). A fotografia e os eventos passam a registrar também `canal = "api_direta"`, `provedor = "openai"` e o modelo usado — hoje o provedor é texto genérico.

Memória Local Estrita: o briefing explicitamente autorizado pode sair; exemplos locais, preferências inferidas e memória privada não saem do dispositivo em nenhuma hipótese. Nenhum fallback silencioso para nuvem.

## 8. Erros, retries e cancelamento

| Situação | Código normalizado | Tratamento |
|---|---|---|
| Credencial ausente | `config_ausente` | falha imediata, sem retry, sem simulado |
| Credencial inválida (401) | `credencial_invalida` | falha definitiva, alerta ao admin |
| Modelo indisponível (404/400 de modelo) | `modelo_indisponivel` | falha definitiva |
| Rate limit (429) | `rate_limit` | retry com backoff do servidor, respeitando `Retry-After` |
| Timeout (`timeout_ms` da versão) | `timeout` | aborta e retry até `tentativas_max` |
| Erro transitório (5xx/rede) | `provider_error` | retry com backoff |
| Resposta fora do schema | `invalid_input` | no máximo uma nova chamada controlada, depois falha |
| Recusa do modelo | `provider_refusal` | estado funcional próprio: mensagem segura, sem pergunta fictícia, sem retry automático, evento sem conteúdo |
| Erro de segurança / injeção detectada | `bloqueio_seguranca` | etapa falha, sinalizador registrado |
| Cancelamento | `cancelado` | ver abaixo |
| Resposta possivelmente concluída sem persistência | `unknown_outcome` | resolução manual da F5, sem retry cego |

Recusa nunca é convertida em "briefing insuficiente".

Cancelamento: impede novas etapas; aborta a requisição via `AbortController` quando o runtime permitir; respostas tardias são descartadas pelos RPCs da F5 (já validado na F5); resultados pós-cancelamento nunca são promovidos; a UI informa que uma chamada já enviada pode ter sido processada e cobrada. Nenhuma promessa de interrupção garantida do processamento remoto.

Idempotência: lease e token da F5 continuam sendo a garantia interna; a chamada envia chave de idempotência externa derivada de `etapa_id + tentativa` quando a API suportar.

## 9. Observabilidade e retenção

Registrado em `eventos_tecnicos` / `execucoes`: `execution_id`, `step_id`, papel, provedor, modelo, versão do Registry, status, duração, tentativa, código de erro normalizado, tokens de entrada e saída, custo estimado ou retornado, estado final.

Nunca registrado: briefing completo, resposta completa, prompt de sistema, exemplos de Voz de Marca, dados pessoais, tokens de autenticação, API key, cabeçalhos sensíveis.

Retenção: a política oficial de retenção da OpenAI será confirmada na seção 2 e documentada na tela de Privacidade, deixando explícito que o briefing autorizado trafega pelo provedor. O painel técnico mostra provedor, modelo, tentativas e custo ao administrador; o usuário final vê apenas os estados previstos.

## 10. Arquivos e funções afetados

Novos:
- `src/lib/provedores/tipos.ts` — contrato `ProvedorLLM`, tipos de uso, custo e desfecho.
- `src/lib/provedores/openai-direct.server.ts` — `OpenAIDirectAdapter`: requisição, auth, saída estruturada, erros, rate limit, timeout, uso/custo, abort, idempotência.
- `src/lib/agentes/gatekeeper.server.ts` — envelope, schemas zod, regras condicionais.
- `src/lib/agentes/gatekeeper.ts` — tipos, rótulos e estados compartilhados com a UI.

Alterados:
- `src/lib/execucao.functions.ts` — desvio do papel `gatekeeper` para o adaptador real conforme a versão publicada; carga do briefing e parâmetros do chat; revalidação da fotografia; gravação de uso/custo.
- `src/lib/registry.functions.ts` — allowlist de provedor/modelo real; teste administrativo com briefing sintético e aviso de custo.
- `src/lib/telemetria.functions.ts` — novos códigos normalizados (`provider_refusal`, `credencial_invalida`, `modelo_indisponivel`, `config_ausente`, `bloqueio_seguranca`) e campos de tokens/custo.
- `src/components/execucao/PainelExecucao.tsx`, `DetalhesTecnicos.tsx`, `src/components/chat/Thread.tsx` — estados "aguardando complemento", "recusa" e "resultado incerto", exibindo apenas `pergunta_de_refinamento` e `resumo_seguro`.
- `src/lib/adaptadores-simulados.ts` — inalterado; continua servindo todos os outros papéis.

Migrações: colunas de tokens de entrada/saída e custo em `eventos_tecnicos` (se ainda não existirem); campos de canal/provedor/modelo na fotografia; versão publicada do Gatekeeper com provedor real (após a chave estar cadastrada).

## 11. Sequência de implementação

1. Confirmar a documentação oficial da seção 2 e registrar as respostas no plano de execução.
2. Cadastrar `OPENAI_API_KEY` pelo fluxo seguro de Secrets. Sem isso, parar aqui.
3. Criar `tipos.ts` e `OpenAIDirectAdapter`, com uma chamada real mínima de verificação.
4. Criar `gatekeeper.server.ts` (envelope, schema, regras condicionais); testes de schema sem rede.
5. Ajustar Registry (allowlist, teste administrativo) e publicar a versão do Gatekeeper com o identificador confirmado.
6. Ligar o desvio em `avancarExecucao`, mantendo simulado como padrão até a versão publicada apontar `openai`.
7. Ajustar telemetria e migrações de uso/custo.
8. Ajustar a UI para os novos estados previstos.
9. Rodar a bateria da seção 14 e a regressão F1–F5.

## 12. Riscos

- Identificador, endpoint ou nome de parâmetro incorretos → 400 do provedor; mitigado pela confirmação documental e pela chamada mínima de verificação antes de ligar o pipeline.
- Custo real inesperado (briefings longos, tokens de raciocínio) → truncagem por `limite_entrada`, saída curta, esforço baixo/médio, orçamento por agente e custo visível no painel técnico.
- Prompt injection → separação de instruções e dados, envelope tipado, schema estrito, rejeição de campos extras, sinalizador de conteúdo suspeito.
- Vazamento por telemetria ou por mensagem de erro do provedor → códigos normalizados, nenhum corpo de resposta persistido.
- Cobrança sem persistência → `unknown_outcome` com resolução manual, sem retry cego.
- Latência maior que a simulada → timeout por versão e estados de espera já existentes.
- Divergência entre versão publicada e etapa em curso → uso obrigatório do `registry_versao_id` da etapa.

## 13. Critérios de aceite

- Somente o Gatekeeper usa IA real; todos os demais papéis permanecem determinísticos e offline.
- Nenhuma credencial no bundle do cliente, no banco, no Registry ou em logs.
- Sem autorização de `briefing` a chamada não acontece e a etapa fica bloqueada.
- Persistência só após schema estrito + revalidação local + regras condicionais.
- Recusa cai em `provider_refusal`, nunca em "briefing insuficiente".
- Timeout, rate limit, credencial inválida, modelo indisponível, cancelamento, resposta tardia e resultado incerto terminam em estado honesto da F5.
- Nenhum fallback silencioso para simulado em produção.
- Teste administrativo usa apenas briefing sintético e não cria execução nem fotografia.
- Tokens e custo registrados por etapa.
- F1–F5 sem regressão; build, tipos e console limpos.

## 14. Testes

Briefing suficiente, insuficiente, contraditório e longo; prompt injection; conteúdo com PII; consentimento ausente e concedido; resposta estruturada válida; resposta inválida; recusa; timeout; rate limit; credencial inválida; modelo indisponível; retry; cancelamento; resposta tardia; `unknown_outcome`; custo e consumo; reload no meio da etapa; isolamento entre contas; teste administrativo com briefing sintético; confirmação de que somente o Gatekeeper usa IA real; confirmação de que nenhuma chamada à Anthropic ocorreu; regressão F1–F5; build, tipos e console.

Erros de provedor (429, 5xx, 401, schema inválido) serão exercitados por injeção de falha no adaptador em ambiente de teste, sem gastar chamadas reais. Fallback para simulado existe **somente** sob variável de ambiente de teste, sempre com rótulo visível no resultado persistido.

## 15. Informações que precisarei de você

1. `OPENAI_API_KEY`, exclusivamente pelo fluxo seguro de Secrets — o pedido será aberto no passo 2 da sequência.
2. Confirmação do identificador real do modelo, se a documentação oficial não permitir determiná-lo sem ambiguidade.
3. Limites de taxa e teto de gasto aceitável por execução, para calibrar `tentativas_max` e `orcamento_estimado`.
4. Se a sua conta OpenAI tem retenção zero contratada, para o texto da tela de Privacidade.
5. Preços vigentes do modelo, se não estiverem publicamente acessíveis, para o cálculo de custo.

## 16. Confirmação de escopo

Permanecem simulados nesta fase: análise psicológica, Hook Master, Headline Architect, CTA, auditor, correção, adaptação local, validação de preservação, ranking e entrega. Não entram na F6A: API da Anthropic, Claude Fable 5, GPT-5.6 Sol como auditor, Llama 3.2, WebLLM, memória adaptativa, RAG, corpus das 1.000 headlines, embeddings e paralelismo real entre provedores.

## 17. Próximas integrações previstas (não implementadas agora)

- **F6B**: Anthropic API direta para Hook Master e Headline Architect com Claude Fable 5, em adaptador separado sobre o mesmo contrato `ProvedorLLM`.
- **F6C**: ampliação da OpenAI para análise psicológica e auditoria.
- **F6D**: pipeline real misto e paralelismo entre provedores.
- **F7**: Llama 3.2 local com WebLLM/WebGPU, memória local e adaptação de estilo.
- **F8**: corpus das 1.000 headlines, indexação, RAG e rastreabilidade.