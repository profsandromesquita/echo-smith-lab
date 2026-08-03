# Fase F5 (revisão 2) — Registry versionado de agentes e infraestrutura persistente de execuções

## 1. Objetivo

Criar a camada administrativa e operacional que permitirá, no futuro, configurar papéis do pipeline e executar gerações reais — sem conectar nenhum provedor agora. Toda execução da F5 roda por **adaptadores simulados** com respostas mockadas determinísticas, mas **estados, etapas, tentativas, leases, backoff, custos estimados e fotografias são reais e persistentes**.

Ao final da F5 o workspace deixa de simular estados pela `ControleDemo` e passa a refletir uma execução persistida — com conteúdo ainda mockado.

## 2. Modelo do Registry

Dez papéis: `gatekeeper`, `analise_psicologica`, `hook_master`, `headline_architect`, `cta_specialist`, `auditor`, `adaptador_local`, `validador_preservacao`, `consolidador`, `ranking`. Storytelling e legendas fora do MVP.

**`registry_agentes`** — catálogo global (sem `user_id`): `papel` (único), `nome_exibicao`, `descricao`, `versao_publicada_id`, `versao_rascunho_id`. **Não existe coluna `ativo` mutável fora do fluxo de publicação** (ver §3).

**`registry_versoes`** — a configuração versionada: `agente_id`, `versao` (sequencial por papel), `estado` (`rascunho`|`publicada`|`arquivada`), `ativo bool` (**parte da configuração versionada**), `provedor`, `modelo`, `instrucoes_sistema`, `schema_entrada jsonb`, `schema_saida jsonb`, `limite_entrada`, `limite_saida`, `timeout_ms`, `tentativas_max`, `backoff_base_ms`, `concorrencia`, `orcamento_estimado`, `parametros jsonb`, `fallback jsonb`, `observacoes`, `motivo_alteracao`, `autor_id`, `validada_em`, `resultado_validacao jsonb`, `testada_em`, `resultado_teste jsonb`, `publicada_em`, `publicada_por`, `arquivada_em`. Único `(agente_id, versao)`.

Pesos do ranking vivem em `parametros` da versão do papel `ranking` — versionados pelo mesmo mecanismo.

Nunca armazenar API key, token ou Secret. Na F5 um CHECK limita `provedor` a `simulado` e `modelo` a `mock-*`.

## 3. Versionamento, publicação e imutabilidade (correção 2)

- Editar sempre atinge o **rascunho**; a versão publicada nunca é tocada.
- **No máximo um rascunho e uma publicada por agente**: dois índices únicos parciais — `unique (agente_id) where estado='rascunho'` e `unique (agente_id) where estado='publicada'`.
- `duplicarVersao` cria novo rascunho a partir de qualquer versão do histórico (base do rollback). Falha se já existir rascunho.
- `validarVersao` grava `validada_em` + `resultado_validacao`. `testarVersao` executa o adaptador simulado e grava `testada_em` + `resultado_teste`. Qualquer edição posterior no rascunho **zera ambos**.
- `publicarVersao` (função transacional `security definer`) **exige** `validada_em` e `testada_em` posteriores à última edição; arquiva a publicada anterior, promove o rascunho, atualiza `versao_publicada_id`/`versao_rascunho_id`, grava autor, data e motivo.
- **Imutabilidade que não bloqueia publicação**: trigger `registry_versao_imutavel` em UPDATE:
  - `rascunho` → campos livres.
  - `publicada`/`arquivada` → **todo campo de configuração é imutável**; a única alteração aceita é a transição controlada `rascunho→publicada` e `publicada→arquivada` (mais `publicada_em`/`publicada_por`/`arquivada_em`), e apenas quando a flag de sessão `app.publicacao_em_curso` estiver definida pela função de publicação. Acesso direto, mesmo de admin, é rejeitado.
  - DELETE bloqueado para qualquer versão não-rascunho, e para qualquer versão referenciada em `execucao_registry_versoes`.
- **`ativo` faz parte da versão**: ligar/desligar um agente é publicar uma nova versão com `ativo` alterado — auditada com autor, data e motivo. Não há caminho para mudar produção fora da publicação.

## 4. Modelo de execuções e vínculo relacional (correção 1)

**`execucoes`** — `user_id` (default `auth.uid()`), `chat_id`, `formato_solicitado` (`hook`|`headline_video`|`headline_imagem`|`cta`|`pacote_completo`), `estado`, `snapshot_chat jsonb`, `snapshot_marca jsonb`, `snapshot_privacidade jsonb`, `snapshot_registry jsonb` (**auxiliar, apenas leitura humana**), `fotografia_id` → `execucao_fotografias`, `custo_estimado`, `custo_real` (nulo na F5), `criada_em`, `iniciada_em`, `finalizada_em`, `cancelamento_solicitado_em`, `motivo_falha`. **Não existe `registry_versao_id` nem `registry_versoes jsonb` como fonte de verdade** — qualquer referência anterior a isso está removida.

**`execucao_registry_versoes`** — fonte de verdade relacional: `execucao_id` FK → `execucoes` (cascade), `papel`, `registry_versao_id` FK → `registry_versoes` (**RESTRICT**), único `(execucao_id, papel)`. Trigger bloqueia UPDATE e DELETE (append-only). Preenchida na mesma transação de criação da execução, com as versões `publicada` e `ativo=true` de cada papel roteado.

**`execucao_etapas`** — `execucao_id`, `papel`, `ordem`, `estado`, `depende_de text[]`, **`registry_versao_id` FK → `registry_versoes` (RESTRICT), NOT NULL** — a versão efetivamente usada por aquela etapa, coerente com `execucao_registry_versoes` via FK composta `(execucao_id, papel, registry_versao_id)`; mais `tentativas`, `tentativas_limite`, `proxima_tentativa_em`, `ultimo_codigo_erro`, `lease_ate`, `lease_token uuid`, `entrada_resumo jsonb` (contagens e ids, nunca conteúdo), `duracao_ms`. Único `(execucao_id, papel)`.

**`execucao_tentativas`** — append-only: `etapa_id`, `numero`, `iniciada_em`, `encerrada_em`, `status`, `codigo_erro`, `lease_token`.

**`execucao_eventos`** — append-only, imutável: `execucao_id`, `etapa_id`, `de`, `para`, `motivo`, `ocorrido_em`.

**`execucao_resultados`** — saídas simuladas: `etapa_id`, `tipo`, `payload jsonb`, `versao` (original/corrigida/adaptada), `aprovado`, `nota_final`.

Índices: `(user_id, criada_em desc)`, `(chat_id)`, `(execucao_id, ordem)`, `(registry_versao_id)`, parcial em execuções retomáveis, e `(proxima_tentativa_em)` / `(lease_ate)` para elegibilidade e recuperação.

## 5. Fotografia de consentimento pai-e-filhas (correção 3)

**`execucao_fotografias`** (pai) — `execucao_id`, `user_id`, `modo_privacidade`, `criada_em`. Uma por execução.

**Permissões filhas** — reuso da estrutura da F4 `fotografias_consentimento`, agora com `fotografia_id` apontando para o pai: uma linha por permissão com `categoria`, `provedor`, `etapa`, `finalidade`, `decisao`, `termos_id`, `termos_versao`, `origem`. Imutáveis pelo trigger já existente da F4.

`execucoes.fotografia_id` referencia o **registro-pai**. A função transacional `criar_execucao` cria, numa única transação: execução → fotografia-pai → permissões → `execucao_registry_versoes` → etapas roteadas. Falha em qualquer ponto desfaz tudo; não há fotografia órfã nem execução sem versões.

Consentimentos anteriores nunca são alterados retroativamente: a fotografia congela `termos_id` e `termos_versao` vigentes no instante.

**Semântica corrigida de Memória Local Estrita:** o modo **não bloqueia todo processamento em nuvem**. Ele impede o envio de **exemplos locais, preferências inferidas e memória privada de estilo**. Briefing e demais categorias podem ser enviados quando houver **consentimento explícito**. A recusa de uma categoria bloqueia **apenas as etapas que dependem dela** (as demais seguem normalmente); as bloqueadas exibem motivo e categoria faltante. Nenhum fallback para nuvem acontece silenciosamente — a alternativa é sempre uma decisão explícita do usuário.

## 6. Máquina de estados (correção 4)

Execução: `criada` → `pronta` (quando **todos** os consentimentos necessários já estão satisfeitos) **ou** `criada` → `aguardando_consentimento` (quando faltam permissões); `aguardando_consentimento` → `pronta` | `cancelada`; `pronta` → `em_processamento` → (`parcialmente_concluida` | `concluida` | `falhou`); `pronta`/`em_processamento` → `cancelamento_solicitado` → `cancelada`.

Etapa: `bloqueada` → `pendente` (**após o consentimento da categoria ser concedido**); `pendente` → `em_execucao` → (`concluida` | `falhou` | `cancelada` | `resultado_incerto`); `em_execucao` → `pendente` **apenas** pela função de recuperação de lease do servidor.

Todas as transições passam por `aplicar_transicao(...)` `security definer`, com mapa fechado; transição fora do mapa levanta exceção e nada é gravado. Cada transição grava `execucao_eventos` na mesma transação.

`resultado_incerto` cobre "trabalho externo concluiu, persistência não confirmou": não avança sozinho, exige decisão explícita. Fica registrado no plano e na UI que **idempotência interna não impede cobrança duplicada de provedores futuros** — por isso o estado existe.

## 7. Concorrência, retry e idempotência — autoritativos no servidor

- **Quem inicia**: apenas o dono, via server function autenticada.
- **Quem avança**: o cliente apenas pede "avançar". O servidor escolhe a etapa elegível — dependências satisfeitas, `estado='pendente'`, `proxima_tentativa_em is null or <= now()`, sem lease vivo.
- **Lease**: `UPDATE ... SET estado='em_execucao', lease_token=gen_random_uuid(), lease_ate=now()+interval '90 seconds' ... RETURNING` — atômico; a segunda aba recebe "nada elegível".
- **Backoff no servidor**: ao falhar, o servidor incrementa `tentativas`, grava `ultimo_codigo_erro` e calcula `proxima_tentativa_em = now() + backoff_base_ms * 2^(tentativas-1)` a partir da **versão do Registry vinculada à etapa**. `tentativas_limite` é copiado da versão na criação. Excedido → `falhou` definitivo. O cliente não decide nada disso.
- **Recuperação de lease**: `recuperar_etapas_expiradas()` `security definer`, chamada pelo servidor no início de cada avanço, é o **único** caminho que devolve uma etapa a `pendente`. Cliente com token inválido ou ausente é rejeitado e não força retorno.
- **Idempotência**: concluir etapa exige o `lease_token` correto; token errado/expirado → rejeição e descarte do resultado.
- **Cancelamento honesto**: `cancelamento_solicitado` primeiro; etapas em curso terminam ou expiram, e só então `cancelada`. Resposta tardia após cancelamento é persistida como resultado, mas não avança o pipeline.
- **Persistência parcial e retomada**: cada etapa concluída é durável; recarregar ou fechar e reabrir a aba reabre a execução no ponto exato com botão "retomar". Sem worker de fundo — o avanço exige aba aberta, e isso é dito explicitamente na UI.

## 8. Pipeline simulado e roteamento por formato

Gatekeeper → análise psicológica → especialistas selecionados pelo formato → auditoria → no máximo uma correção → adaptação local simulada → validação de preservação → ranking determinístico → entrega.

Roteamento aciona somente os especialistas do formato pedido (`hook`, `headline_video`, `headline_imagem`, `cta`, `pacote_completo`). Cinco variações por formato, ≤1 correção, três entregues; item reprovado após a correção fica fora da curadoria e permanece em `execucao_resultados`.

## 9. Ranking determinístico

Sem modelo próprio. Fatores normalizados 0–1: nota do auditor, aderência ao objetivo, adequação ao formato, adequação à Voz de Marca, ausência de clichês, confiança da avaliação. Pesos vêm da versão publicada do papel `ranking`. Score = soma ponderada, desempate estável por `(score, id)`. Roda depois da adaptação local e da validação de preservação.

## 10. Políticas de acesso

- Tabelas de execução: RLS `auth.uid() = user_id` (filhas via `execucao_e_minha(uuid)` `security definer`). GRANT `SELECT` para `authenticated`; **nenhuma escrita direta** — tudo por funções `security definer` chamadas de server functions com `requireSupabaseAuth`. `GRANT ALL` para `service_role`. Nada para `anon`.
- `registry_agentes` / `registry_versoes`: `SELECT` somente com `tem_papel('admin_tecnico')`; escrita exclusiva das funções de Registry que revalidam o papel internamente. Usuário comum nunca lê instruções, provedor, modelo ou parâmetros — vê apenas um resumo derivado montado no servidor (papel, estado, duração, tentativas, nota).
- Identidade sempre da sessão autenticada.

## 11. Observabilidade

Via `registrarEvento` da F4, somente: `execution_id`, `step_id`, papel, provedor simulado, modelo simulado, versão do Registry, duração, status, tentativa, erro normalizado, custo estimado, transição. Nunca briefing, mensagens, exemplos, prompts, resultados, PII, tokens ou Secrets. Conteúdo mockado vive apenas em `execucao_resultados`.

## 12. Rotas e componentes afetados

- `/admin/agentes` funcional (lista, estado publicado/rascunho, validar, testar, comparar, publicar, duplicar, rollback, histórico) e novo `/admin/agentes/$papel`.
- `LinhaDoTempoPipeline.tsx` lê etapas reais; `Workspace.tsx` / `AreaResultados.tsx` mostram estado real, cancelar, retomar, falha parcial e resultado incerto.
- `ModalConsentimento.tsx` grava "apenas esta execução" atomicamente com a execução.
- Novo `DetalhesTecnicos.tsx` (sem instruções internas).
- Novos módulos: `registry.functions.ts`, `registry.ts`, `execucao.functions.ts`, `execucao.ts`, `adaptadores-simulados.ts`, `ranking.ts`.

Preservados: identidade visual, layout, autenticação, histórico, Voz de Marca, privacidade, responsividade, cards de curadoria e a simplificação visual aprovada.

## 13. Sequência de implementação

**Checkpoint A — Registry**: migração (tabelas, índices únicos parciais de rascunho/publicada, trigger de imutabilidade com transição controlada, grants, RLS admin, seed dos dez papéis com versão 1 publicada e `ativo=true`); `registry.functions.ts`/`registry.ts`; telas de admin; testes de versionamento e bloqueio para usuário comum.

**Checkpoint B — Execuções**: migração (execuções, `execucao_registry_versoes`, etapas com FK composta, tentativas, eventos, resultados, `execucao_fotografias`, `aplicar_transicao`, `criar_execucao`, `reservar_etapa`, `concluir_etapa`, `falhar_etapa`, `recuperar_etapas_expiradas`); adaptadores simulados e ranking; `execucao.functions.ts`/`execucao.ts`; integração no workspace; telemetria; regressão F1–F4, responsividade, build e tipos.

## 14. Riscos

Rascunho vazar para produção (leitura só por `versao_publicada_id`); duas abas duplicando etapa (lease com token, teste concorrente); lease órfão sem worker (recuperação no próximo avanço + aviso honesto); vazamento de instruções internas (RLS admin + resumo derivado); imutabilidade travar a própria publicação (transição controlada testada explicitamente); fotografia parcial (transação única).

## 15. Critérios de aceite

- Cada etapa e cada papel de execução têm FK real para `registry_versoes`; versão referenciada não pode ser alterada nem apagada; nenhuma referência a `execucoes.registry_versao_id` existe.
- Publicar nova versão funciona apesar da imutabilidade; alterar diretamente versão publicada/arquivada falha; `ativo` só muda por publicação auditada; no máximo um rascunho e uma publicada por agente; publicar sem validação e teste atualizados falha.
- Execução, fotografia-pai, permissões filhas e vínculos de versão nascem na mesma transação; `fotografia_id` aponta para o pai.
- Memória Local Estrita bloqueia apenas exemplos, preferências inferidas e memória privada; recusa de categoria bloqueia só as etapas dependentes; sem fallback silencioso.
- Backoff, limites, timeout, retry e transições são decididos e persistidos no servidor; cliente com token inválido não devolve etapa a `pendente`.
- Transições `criada→pronta`, `criada→aguardando_consentimento` e `bloqueada→pendente` funcionam; transição arbitrária é rejeitada.
- Isolamento entre contas; F1–F4 intactas; build, tipos e console limpos em 375, 768 e 1440 px.

## 16. Testes

Registry: criar rascunho, editar, validar, testar, publicar, nova versão, comparar, rollback; publicar sem teste (deve falhar); editar versão publicada por acesso direto (deve falhar); segundo rascunho simultâneo (deve falhar); alterar versão em uso (deve falhar); acesso de usuário comum (deve falhar); confirmar que rascunho não muda produção.
Execuções: criar em cada formato e no pacote completo; conferir linhas em `execucao_registry_versoes` e FK em cada etapa; conferir fotografia-pai + permissões; avançar etapas; duas abas simultâneas; forçar retry com backoff persistido, timeout de lease, recuperação, cancelamento e resposta tardia; provocar e resolver `resultado_incerto`; falha parcial; recarregar e reabrir a aba; recusar uma categoria e verificar que só as etapas dependentes ficam bloqueadas; conceder depois e ver `bloqueada→pendente`; isolamento entre duas contas; varredura de `eventos_tecnicos` sem conteúdo.
Regressão F1–F4, três breakpoints, build, typecheck e console.

## 17. Confirmação

Nenhum provedor real nesta fase: sem OpenAI, Anthropic, Claude Fable 5, GPT-5.6 Sol, Llama local, WebLLM, Secrets, embeddings, RAG, corpus de headlines, memória adaptativa, pagamentos, colaboração ou times. Todos os adaptadores são simulados e determinísticos; o único provedor gravado é `simulado`.

**Os quatro pontos foram incorporados:** (1) vínculo relacional `execucao_registry_versoes` + FK por etapa, snapshot JSON só como auxiliar, referência a `registry_versao_id` em `execucoes` eliminada; (2) imutabilidade com transição controlada de publicação, `ativo` versionado, unicidade de rascunho/publicada e exigência de validação e teste; (3) fotografia pai-e-filhas transacional e semântica corrigida de Memória Local Estrita; (4) retry, backoff, timeout e transições autoritativos no servidor, com as três transições novas e recuperação de lease exclusiva do servidor.
