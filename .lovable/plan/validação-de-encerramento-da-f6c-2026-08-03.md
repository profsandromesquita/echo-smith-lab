# Validação de encerramento da F6C

Verificação objetiva dos cinco requisitos, com evidência no código atual. Quatro passam; um exige correção mínima.

## Resultado

| # | Requisito | Resultado |
|---|---|---|
| 1 | Integridade de IDs por lote (presença única, sem ausentes, sem duplicados, sem desconhecidos) | Aprovado |
| 2 | Auditoria em lotes por formato, ~5 variações por chamada | Aprovado |
| 3 | Lote validado permanece persistido se outro formato falhar | Aprovado |
| 4 | Variação sem auditoria válida nunca entra em ranking nem curadoria | Aprovado |
| 5 | Estado parcial quando só parte dos formatos é auditada | Reprovado — a execução encerra como "concluída" |

## Evidência

**1. Integridade de IDs** — `src/lib/agentes/auditor.server.ts`
- `schemaAuditoria(ids)` fixa `variacao_id` como `enum: ids` no Structured Output: ID desconhecido é rejeitado pelo próprio provedor.
- `validadorLote(ids)` compara a lista ordenada de IDs avaliados com a lista ordenada enviada (`sort().join("|")`). Essa igualdade exata reprova, ao mesmo tempo: ausência (`a|b` vs `a`), duplicidade (`a|b` vs `a|a` e `a|b` vs `a|a|b`) e qualquer ID extra.
- A mesma regra existe em `corrigirLote`, no ciclo de correção única.
- Lote reprovado pelo validador não entra em `resultados`: nenhuma avaliação inválida é persistida.

**2. Lotes por formato** — `src/lib/agentes/openai-etapa.server.ts`
- As variações são agrupadas em `porPapel` (hook_master, headline_architect, …) e cada grupo é fatiado por `lotesDe(lista)` com `TAMANHO_LOTE = 5`.
- Cada lote tem chave de idempotência própria: `etapaId:tentativa:papel:indice`.

**3. Isolamento de falha entre lotes** — mesmo arquivo
- A falha de um lote executa `lotesFalhos += 1; continue;` — os `resultados` já acumulados dos lotes válidos permanecem no array e são gravados em uma única chamada `concluir_etapa`.
- `ok = lotesTotal === 0 || lotesOk > 0`: basta um lote válido para persistir tudo o que foi auditado.

**4. Variação sem auditoria fora do ranking**
- Toda variação ausente do conjunto `auditados` recebe um resultado `auditoria` com `aprovado: false`, `nao_auditada: true` e sem nota inventada.
- `lerVariacoes` em `src/lib/adaptadores-simulados.ts` coloca esses IDs em `reprovadas`; o papel `ranking` filtra `!reprovadas.has(v.id)`. A entrega lista esses IDs em `reprovadas`, e `CuradoriaExecucao` os exibe apenas no bloco "Fora da curadoria", com a observação de que o lote falhou.

**5. Estado parcial — lacuna confirmada**
- Com `lotesOk > 0` e `lotesFalhos > 0`, a etapa `auditor` é concluída por `concluir_etapa`, que zera `ultimo_codigo_erro`.
- No fim do pipeline, `concluir_etapa` só marca `parcialmente_concluida` quando existe alguma etapa em `falhou/bloqueada/cancelada`. Como nenhuma etapa falhou, a execução termina como `concluida`, apesar de um formato inteiro não ter sido auditado.

## Correção mínima proposta

Escopo restrito ao sinal de parcialidade. Sem mudança de arquitetura, sem novos papéis, sem reprocessamento.

1. **Migração**: `concluir_etapa` ganha o parâmetro opcional `_parcial boolean default false`. Quando verdadeiro, grava `ultimo_codigo_erro = 'auditoria_parcial'` na etapa (em vez de `null`) e, ao fechar o pipeline, força `parcialmente_concluida`. Nenhum resultado é apagado; as demais chamadas seguem funcionando sem alteração.
2. **`src/lib/execucao.functions.ts`**: na etapa `auditor`, passar `_parcial: desfecho.lotesFalhos > 0` e registrar o evento técnico com `codigo_erro: "auditoria_parcial"` quando houver lote falho.
3. **`src/lib/execucao.ts`**: acrescentar `auditoria_parcial` em `MENSAGEM_ERRO_ETAPA`, com texto honesto ("parte das variações não foi auditada; elas ficam fora da entrega").

O alerta de "Entrega parcial" já existente em `PainelExecucao` passa a aparecer nesse cenário, sem alteração de UI.

## Verificação após a correção

- Build, typecheck e console do preview limpos.
- Cenário simulado com um formato auditado e outro com lote falho: variações válidas entregues, variações não auditadas fora do ranking, execução em `parcialmente_concluida`.