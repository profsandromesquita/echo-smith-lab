# Fase F6C — Analista de Psicologia Profunda e Auditor reais (OpenAI direta)

Objetivo: substituir apenas os adaptadores simulados de `analise_psicologica` e `auditor` por chamadas reais ao GPT-5.6 Sol pela infraestrutura OpenAI já existente. Nada mais muda.

## 1. Arquitetura dos dois papéis

Reaproveita o padrão já validado em F6A/F6B (adaptador → runner do papel → orquestrador de etapa → roteamento em `execucao.functions.ts`).

```text
execucao.functions.ts (avancarExecucao)
  ├─ gatekeeper          → openai      (F6A, inalterado)
  ├─ analise_psicologica → openai      (F6C, novo)
  ├─ hook_master         → anthropic   (F6B, inalterado)
  ├─ headline_architect  → anthropic   (F6B, inalterado)
  ├─ cta_specialist      → simulado
  ├─ auditor             → openai      (F6C, novo)
  └─ demais papéis       → simulado
```

Novos módulos, um por papel, sem duplicar adaptador:
- `src/lib/agentes/psicologia.server.ts` — instruções, schema, validação Zod, runner.
- `src/lib/agentes/psicologia-etapa.server.ts` — leitura da versão do Registry, revalidação de consentimento, montagem de entrada, persistência do resultado.
- `src/lib/agentes/psicologia-teste.server.ts` — teste administrativo sintético.
- `src/lib/agentes/auditor.server.ts` — instruções, schema por item, validação, runner.
- `src/lib/agentes/auditor-etapa.server.ts` — leitura das variações persistidas, montagem da entrada, persistência de auditorias e feedback de correção.
- `src/lib/agentes/auditor-teste.server.ts` — conjunto sintético de variações boas/medianas/ruins e comparação de dois esforços.
- `src/lib/agentes/openai-base.server.ts` — runner comum (envelope, regras fixas anti-injeção, uma única rechamada em `resposta_invalida`), espelhando `especialista-base.server.ts`.

O Analista nunca gera hooks/headlines/CTA nem pontua. O Auditor nunca reescreve nem cria variações: só emite feedback estruturado.

## 2. Schemas

Analista (`json_schema` estrito, `additionalProperties:false`, revalidado com Zod):
- `conflito_inconsciente`, `dor_aparente`, `tensao_subjacente`, `diretriz_criativa` (uma única diretriz), `resumo_seguro` (string curta, exibível);
- `angulos_recomendados`, `angulos_a_evitar`, `riscos_eticos` (arrays de string).

Auditor — objeto `{ avaliacoes: [...] }`, um item por variação do lote:
- `resultado_id`; notas 0–10 em `impacto_emocional`, `clareza_consequencia`, `ritmo_leitura`, `adequacao_formato`, `ausencia_cliches`, `confianca_avaliacao`; `aprovado` (boolean); `motivo_curto`; `instrucao_correcao` (string ou null); `alertas` (array de string);
- Voz de Marca com par explícito: `voz_marca_avaliavel` (boolean) e `adequacao_voz_marca` (número 0–10 ou null).

Regras da Voz de Marca: com `voz_marca_avaliavel = true` a nota é obrigatória; com `false` ela deve ser exatamente `null`. Nunca se inventa nota, e a ausência de autorização jamais reduz a nota da variação — o fator é neutralizado no ranking e a interface exibe "não avaliado", nunca zero.

Integridade das avaliações (validação local, rejeição total do lote em caso de violação):
- cada `resultado_id` enviado aparece exatamente uma vez;
- nenhum duplicado, nenhum ausente, nenhum desconhecido, nenhuma avaliação órfã;
- quantidade exatamente igual à do lote enviado;
- notas dentro de 0–10 e `instrucao_correcao` presente somente quando `aprovado = false`.

Falha de schema ou de integridade após uma única rechamada = `resposta_invalida`, sem reparo manual de JSON e sem aproveitamento parcial do lote.

## 3. Dados enviados

Analista: briefing estruturado autorizado, público, dor, promessa, contexto, objetivo, nível de consciência, formato solicitado e restrições éticas explícitas. Nada de histórico, resultados de especialistas, exemplos locais, preferências inferidas, Secrets ou prompts internos.

Auditor: briefing estruturado, diretriz psicológica, formatos solicitados, objetivo, regras de Voz de Marca somente se autorizadas, as variações a auditar (id, texto, formato) e os critérios/pesos aplicáveis. Nada de dados de outras contas nem de memória local.

A auditoria roda em lotes por formato, preferencialmente cinco variações por chamada. Cada lote é uma chamada independente, com validação, persistência, timeout, lease, retry, cancelamento e `unknown_outcome` próprios: falha em um formato não apaga auditorias já persistidas de outro, e a execução pode terminar parcialmente concluída. Nenhuma variação chega ao ranking sem auditoria válida.

## 4. Configuração de raciocínio

- Analista: padrão `medium`, permitido `low`; ajustável por versão no Registry.
- Auditor: padrão `high`; `xhigh`/`max` somente quando explicitamente configurados na versão publicada — nunca como default.
- Todo nível registra custo, tokens e latência.

Verificado no código atual: `openai-direct.server.ts` achata o esforço em `low`/`medium` e o RPC `registry_validar` só aceita `reasoning_effort` em `low|medium` para OpenAI. Ambos precisam ser ampliados nesta fase para o Auditor.

## 5. Integração OpenAI

Reutiliza `criarProvedorOpenAI()` sem duplicação. Ajustes mínimos: repassar a escala de esforço suportada pelo modelo em vez de achatar; manter `store:false`, `Idempotency-Key`, leitura de `usage`, detecção de recusa, `status: incomplete` e o mesmo tratamento de `AbortSignal`.

Antes de codar, confirmação por documentação oficial e smoke test: valores aceitos de `reasoning.effort` no GPT-5.6 Sol, teto de `max_output_tokens`, campos de `usage` (incluindo cache), formato de recusa, semântica de cancelamento e de idempotência. Se o modelo não aceitar níveis acima de `high`, o Registry limita a escala e isso fica documentado — sem inventar suporte.

## 6. Integração com o que já existe (Anthropic)

Hook Master e Headline Architect continuam idênticos. O Auditor lê as variações que eles persistiram em `execucao_resultados` (tipo `variacao`); o Analista passa a produzir de verdade a `diretriz_estrategica` que `montarEntradaEspecialista` já consome — contrato desse campo preservado para não quebrar F6B.

## 7. Consentimentos

Revalidação server-side antes de cada chamada, reutilizando `categoriaAutorizada` e a fotografia vinculada à execução: categoria, provedor OpenAI, modelo, papel, etapa, finalidade, termos e versão.
- Analista: exige `briefing` autorizado; sem isso, `autorizacao_ausente`, sem retry, nada enviado.
- Auditor: exige `briefing`; inclui resumo de Voz de Marca somente com `resumo_voz_marca` concedido, senão o campo vai nulo e o critério é marcado como não avaliável.
- Memória Local Estrita segue bloqueando exemplos locais, preferências inferidas e memória adaptativa. Sem fallback silencioso.

## 8. Segurança e prompt injection

Instruções fixas fora do conteúdo do usuário; briefing, Voz de Marca, diretriz e variações vão dentro de `<conteudo_usuario>` como dado. Schema fechado, campos extras rejeitados, truncamento por `limite_entrada`. Regra explícita no Auditor: o texto auditado nunca instrui o Auditor, não concede nota, não pede prompts internos nem Secrets; tentativas viram item em `alertas` e reduzem a nota, nunca obediência. Nenhum papel revela raciocínio.

## 9. Correção única

O Auditor real produz o feedback; a etapa corretora permanece simulada e passa a consumir `instrucao_correcao` real em vez de texto fixo. Regras preservadas: no máximo uma correção por item, item ainda reprovado sai da curadoria mas permanece no histórico técnico, sem repetição ilimitada. O Auditor não vira corretor.

## 10. Ranking

Permanece determinístico e com pesos versionados. Passa a consumir notas reais mapeadas para os fatores existentes em `src/lib/ranking.ts` (`nota_auditor`, `objetivo`, `formato`, `voz_marca`, `sem_cliches`, `confianca`), normalizadas da escala 0–10. Sem Voz de Marca autorizada, o fator é neutralizado no cálculo em vez de receber nota inventada. Sem LLM ponderador.

## 11. Registry

Migração ampliando `registry_validar`: OpenAI permitido para `gatekeeper`, `analise_psicologica` e `auditor`; escala de `reasoning_effort` ampliada conforme o item 5; `xhigh`/`max` aceitos apenas para o Auditor; orçamento > 0 e saída estruturada estrita continuam obrigatórios. Versões independentes por papel com provedor, modelo, esforço, instruções, schema, limites, timeout, tentativas, concorrência, orçamento e parâmetros permitidos. A API key continua exclusivamente em Cloud Secrets.

## 12. Máquina de estados

Sem alterações: reserva, lease, backoff, tentativas, timeout, cancelamento, resposta tardia, `unknown_outcome`, telemetria, versão do Registry e persistência parcial seguem como estão. Falha do Auditor preserva as variações e impede promoção automática para a curadoria final.

## 13. Observabilidade

`registrar_evento_tecnico` com execution_id, step_id, papel, provedor, modelo, versão, esforço, duração, status, tentativa, tokens, custo, código de erro e estado final. Nunca briefing, variações, Voz de Marca, prompt, resposta completa, dados pessoais ou credenciais.

## 14. Arquivos e funções afetados

Novos: `openai-base.server.ts`, `psicologia.server.ts`, `psicologia-etapa.server.ts`, `psicologia-teste.server.ts`, `auditor.server.ts`, `auditor-etapa.server.ts`, `auditor-teste.server.ts`.

Alterados:
- `src/lib/provedores/openai-direct.server.ts` — escala de esforço.
- `src/lib/execucao.functions.ts` — dois novos ramos de roteamento real.
- `src/lib/registry.functions.ts` — validação e teste administrativo dos dois papéis.
- `src/components/registry/EditorVersao.tsx` — esforço por papel e comparação de dois níveis no Auditor.
- `src/lib/adaptadores-simulados.ts` — correção simulada consumindo feedback real.
- `src/lib/ranking.ts` e mapeamento de fatores — notas reais.
- `src/lib/execucao.ts` e `PainelExecucao.tsx` — estados e rótulos seguros de análise e auditoria.
- Migração SQL de `registry_validar`.

## 15. Sequência de implementação

1. Confirmar parâmetros do GPT-5.6 Sol por documentação e smoke test.
2. Ampliar a escala de esforço no adaptador OpenAI.
3. Runner comum OpenAI e módulos do Analista.
4. Migração do Registry e validação.
5. Roteamento real do Analista e telemetria.
6. Módulos do Auditor (schema por item, validação, alertas).
7. Roteamento real do Auditor e persistência das auditorias.
8. Consumo do feedback real pela correção simulada e pelo ranking.
9. Testes administrativos sintéticos dos dois papéis.
10. Ajustes de interface e mensagens seguras.
11. Regressão F1–F6B, build, tipos e console.

## 16. Riscos

- O modelo pode não aceitar `xhigh`/`max`: mitigado por confirmação prévia e limitação no Registry.
- Auditoria de muitas variações em uma chamada pode truncar: limites dimensionados e `saida_truncada` tratado como descarte, nunca nota parcial.
- Injeção dentro de uma variação: mitigada por envelope, schema fechado e regra de alerta.
- Custo do esforço alto: orçamento por versão e telemetria por nível.
- Mudança no contrato de `diretriz_estrategica` quebraria F6B: contrato preservado.

## 17. Critérios de aceite

- Analista e Auditor executam com chamada real ao GPT-5.6 Sol, versões publicadas no Registry.
- Diretriz real chega aos especialistas Anthropic; notas reais chegam ao ranking determinístico.
- Sem consentimento, nada é enviado e a etapa falha com mensagem segura.
- Recusa, saída inválida ou truncada nunca viram diretriz ou nota inventada.
- Correção única preservada; item reprovado após a correção fica fora da curadoria.
- Interface mostra apenas estados seguros; nenhum raciocínio ou payload bruto.
- CTA, adaptação local, validação de preservação e entrega seguem simulados; Gatekeeper e especialistas seguem reais.

## 18. Testes

Análise isolada; auditoria isolada; pipeline completo com Gatekeeper, Analista, especialistas e Auditor reais; briefing suficiente e insuficiente; conteúdo sensível; prevenção de diagnóstico; injeção no briefing e dentro de uma variação; notas 0–10; aprovação, reprovação, instrução de correção, correção única, item fora da curadoria; ranking com notas reais; consentimento ausente e concedido; Voz de Marca autorizada e não autorizada; recusa; saída inválida; saída truncada; timeout; rate limit; retry; cancelamento; resposta tardia; `unknown_outcome`; custo; isolamento entre contas; testes administrativos sintéticos; nenhuma chamada ao Llama; regressão F1–F6B; build, tipos e console limpos.

## 19. Confirmação de escopo

CTA, agente corretor real, adaptação local, validação de preservação, Llama/WebLLM, memória adaptativa, few-shot local, RAG, corpus, embeddings, pagamentos e colaboração continuam fora desta fase e permanecem simulados ou inexistentes.