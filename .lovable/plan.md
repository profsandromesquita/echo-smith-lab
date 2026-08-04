# Correção dos bloqueadores dos blocos 5 e 8 (F6D)

Escopo: apenas correção de defeitos de máquina de estados, reserva de custo e propagação de falha, mais higiene das rotas de diagnóstico. Sem mudança de arquitetura e sem funcionalidades da fase seguinte. Nenhum teste pago roda antes das validações determinísticas passarem.

## Causa confirmada (leitura das funções no banco nesta sessão)

1. `cancelar_execucao` sempre chama `aplicar_transicao_execucao(..., 'cancelamento_solicitado')`. A tabela branca de transições só aceita `pronta>cancelamento_solicitado` e `em_processamento>cancelamento_solicitado`. Cancelar em `criada` ou `aguardando_consentimento` lança "Transicao de execucao invalida", e cancelar de novo a partir de `cancelada` também falha. Execuções sem etapa ativa ainda passam desnecessariamente por `cancelamento_solicitado`.
2. `reservar_custo` dá `select ... for update` na execução mas nunca lê o estado dela: aceita reserva em `cancelamento_solicitado`, `cancelada` e demais estados terminais. Também não valida elegibilidade da etapa (estado, lease, tentativa).
3. `falhar_etapa` marca a etapa como `falhou` e só encerra a execução quando `restantes = 0`. Como `reservar_etapa` exige toda dependência `concluida`, as descendentes ficam `pendente` para sempre: nada é reservável, `restantes > 0`, execução presa em `em_processamento`. Não existe rotina de reconciliação do grafo.
4. O estado final é calculado em dois lugares distintos (`concluir_etapa` e `falhar_etapa`) por contagem simples de etapas, sem considerar formatos solicitados, lotes válidos ou mínimo de três aprovados.
5. `src/routes/api/public/f6d-probe.ts` e `f6d-erro.ts` seguem publicados e devolvem mensagem e stack do servidor.

## Correções mínimas

### A. Transições
Ampliar a tabela branca de `aplicar_transicao_execucao`:
`criada>cancelamento_solicitado`, `aguardando_consentimento>cancelamento_solicitado`,
`pronta>cancelada`, `em_processamento>cancelada`,
`pronta>falhou`, `pronta>parcialmente_concluida`, `pronta>concluida`,
`aguardando_consentimento>falhou`, `em_processamento>aguardando_consentimento`.
Transição para o mesmo estado continua no-op (idempotência preservada).
Em `aplicar_transicao_etapa`, adicionar `falhou>bloqueada`, `falhou>cancelada` e `resultado_incerto>bloqueada`. Etapa `concluida` nunca é revertida.

### B. `cancelar_execucao`
- No-op quando já terminal (`cancelada`, `concluida`, `parcialmente_concluida`, `falhou`) — idempotente.
- Lock da execução (`for update`) antes de decidir.
- Cancela etapas `pendente` e `bloqueada` e limpa `proxima_tentativa_em`.
- Etapas em `resultado_incerto` são preservadas (a chamada incerta não é apagada) e não impedem o encerramento.
- Sem etapa `em_execucao`: vai direto para `cancelada`.
- Com etapa `em_execucao`: vai para `cancelamento_solicitado`; o descarte de resposta tardia já existente em `concluir_etapa`/`falhar_etapa` fecha para `cancelada` quando a última ativa encerra.
- Custos já reservados permanecem e são reconciliados quando o valor real chegar.

### C. `reservar_custo`
Na mesma transação, após o `for update` da execução:
- rejeitar (`false`) se o estado não for `pronta` nem `em_processamento`;
- rejeitar se a etapa não pertence à execução, não está `em_execucao` ou está sem lease válido (`lease_ate >= now()`);
- exigir que a chave corresponda à tentativa corrente (`etapa:<id>:<tentativa>`), rejeitando tentativa divergente;
- manter idempotência por chave já existente.
O lock de linha da execução, compartilhado com `cancelar_execucao`, resolve a disputa cancelamento x reserva: apenas uma decisão prevalece.

### D. `reconciliar_grafo_execucao(_execucao_id)` — nova RPC, security definer, idempotente
1. Recupera etapas com lease expirado (reaproveita `recuperar_etapas_expiradas`).
2. Para cada etapa `pendente`/`bloqueada`, avalia dependências:
   - dependência `falhou`/`cancelada` sem resultado válido, quando o sucesso é exigido → etapa vai a `bloqueada` com `ultimo_codigo_erro = 'dependencia_falhou'`;
   - dependência em retry, backoff, `em_execucao` ou `resultado_incerto` → nada muda (não é falha definitiva);
   - todas as dependências terminais e existindo ao menos um lote válido → etapa segue elegível.
3. Barreira dos especialistas: o Auditor exige todos os especialistas roteados terminais e ao menos um lote válido em `execucao_resultados`. Especialista falho não invalida os lotes dos demais. Sem nenhum lote válido, Auditor e as etapas seguintes (correção, ranking, entrega) ficam `bloqueada` com `dependencia_falhou`.
4. Ao final, chama o cálculo de estado final (E).

Chamada ao fim de `concluir_etapa`, `falhar_etapa`, `resolver_resultado_incerto` e `cancelar_execucao`, e também no início de `obterExecucao` e `reservar_etapa`, para destravar execuções antigas já presas.

### E. Cálculo de estado final (somente no servidor, dentro da reconciliação)
Substitui as contagens ad hoc de `concluir_etapa` e `falhar_etapa`:
- `cancelada` quando o cancelamento concluiu;
- etapa em `resultado_incerto` não fecha a execução (permanece em processamento até a resolução);
- `aguardando_consentimento` quando as únicas pendências são autorizações obrigatórias e ainda há caminho válido;
- `em_processamento` enquanto houver etapa elegível, em execução ou em backoff;
- sem etapas vivas: `concluida` se todos os formatos solicitados têm resultado válido e há ao menos três itens aprovados; `parcialmente_concluida` se há conteúdo entregável mas com formato/lote perdido ou menos de três aprovados; `falhou` se nada entregável chega à curadoria.

### F. Higiene
- Remover `src/routes/api/public/f6d-probe.ts` e `src/routes/api/public/f6d-erro.ts`.
- Conferir que nenhuma rota pública devolve texto interno de erro e que não restam flags/fixtures temporárias de teste.
- Frontend: sem redesenho. Apenas o rótulo seguro de `dependencia_falhou` em `MENSAGEM_ERRO_ETAPA` (`src/lib/execucao.ts`) e verificação de que o botão Cancelar aparece nos estados iniciais em `PainelExecucao.tsx`.

## Validação (sem provedor pago)

Cenários A–D (cancelamento) e E–J (falha definitiva) do pedido, com SQL usado apenas para preparar pré-condição e o harness existente chamando as RPCs como usuário autenticado. Para cada cenário: estado anterior, ação, estado posterior, etapas resultantes e tentativa de reserva após o cancelamento.
Depois: reexecução dos blocos 5 e 8 da matriz e confirmação de typecheck, build, preview e console limpo. Só então os blocos que exigem OpenAI/Anthropic voltam a rodar.

## Detalhes técnicos
Uma única migração cobre A–E: alteração de `aplicar_transicao_execucao`, `aplicar_transicao_etapa`, `cancelar_execucao`, `reservar_custo`, `concluir_etapa`, `falhar_etapa` e `resolver_resultado_incerto`, mais a criação de `reconciliar_grafo_execucao`. Sem novas tabelas e sem alteração de RLS ou grants existentes.