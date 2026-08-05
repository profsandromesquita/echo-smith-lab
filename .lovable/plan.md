# Correção do cenário 5.7 — precedência de `resultado_incerto`

Escopo: apenas a precedência de estado da execução quando existe etapa com desfecho externo não confirmado, e a resolução explícita dessa etapa. Nenhuma mudança nos cenários 5.1–5.6 nem no bloco 8 já aprovado. Sem chamadas pagas.

## Causa confirmada (leitura das funções no banco nesta sessão)

Em `reconciliar_grafo_execucao`, o trecho `if incertos > 0 or ativos > 0 then return ex.estado; end if;` trata etapa incerta como "trabalho vivo" e devolve o estado atual sem transição. Como `aplicar_transicao_execucao` não tem `resultado_incerto` na tabela branca de estados de execução, a execução nunca sai de `em_processamento`. Além disso `resolver_resultado_incerto` só oferece dois desfechos: `_retomar = true` recoloca a etapa em `pendente` (o que reexecuta a chamada original) e `_retomar = false` marca `cancelada` (o que não propaga falha como falha).

## Correções

### A. Tabela branca de transições de execução
Acrescentar, sem remover nenhuma existente:
`em_processamento>resultado_incerto`, `aguardando_consentimento>resultado_incerto`, `resultado_incerto>em_processamento`, `resultado_incerto>aguardando_consentimento`, `resultado_incerto>concluida`, `resultado_incerto>parcialmente_concluida`, `resultado_incerto>falhou`, `resultado_incerto>cancelamento_solicitado`, `resultado_incerto>cancelada`.
Transição para o mesmo estado continua no-op.

### B. Precedência em `reconciliar_grafo_execucao`
Ordem passa a ser:
1. `cancelamento_solicitado` / cancelamento em curso — inalterado;
2. `incertos > 0` → execução vai para `resultado_incerto` e retorna (precede `em_processamento` e qualquer estado final);
3. `incertos = 0` e ainda há etapa elegível/ativa → se a execução estiver em `resultado_incerto`, volta para `em_processamento`;
4. `aguardando_consentimento`, e depois o cálculo de estado final já aprovado (≥3 aprovadas, cobertura de formatos), inalterado.

A etapa incerta continua **não terminal** na barreira: os dependentes não passam pelo teste de dependência de `reservar_etapa` nem são marcados `bloqueada` pela propagação, então nada é promovido a ranking ou curadoria a partir dela.

### C. Ramos independentes seguem vivos
`reservar_etapa` passa a aceitar também o estado `resultado_incerto` (hoje só `pronta`/`em_processamento`), sem transicionar a execução. Como o filtro de dependência exige dependências em estado terminal, nenhum dependente da etapa incerta é reservado; apenas ramos paralelos já elegíveis continuam. Ramos já concluídos permanecem intactos.

### D. Reserva de custo
`reservar_custo_v2` passa a recusar explicitamente quando a etapa alvo está em `resultado_incerto`. A reserva já existente da etapa incerta é **mantida** (retida até reconciliação segura por `reconciliar_custo`), nunca liberada nem duplicada — a idempotência por chave `etapa:<id>:<tentativa>` já garante ausência de duplicata.

### E. Resolução explícita (sem retry cego)
`resolver_resultado_incerto` ganha um desfecho explícito de três valores, mantendo compatibilidade com a assinatura atual:
- **falha**: etapa vai para `falhou` com `ultimo_codigo_erro = 'unknown_outcome'`; a reconciliação propaga `dependencia_falhou` aos dependentes e recalcula o estado final;
- **sucesso confirmado**: etapa vai para `concluida` **sem nova chamada ao provedor**, aproveitando os resultados já persistidos da tentativa; se não houver resultado persistido para a etapa, a resolução é recusada (evita "concluir" vazio);
- **retomar**: comportamento atual (`pendente`), usado só quando o operador decide explicitamente refazer; nunca automático.

Em todos os casos, ao final: `reconciliar_grafo_execucao` roda, o estado é recalculado e só etapas elegíveis são retomadas. Nenhum caminho reexecuta a chamada original sozinho.

### F. Cancelamento durante `resultado_incerto`
`cancelar_execucao` já conta apenas etapas `em_execucao` como ativas, então com etapa incerta vai direto para `cancelada` (transição nova de A). A etapa incerta é preservada como está no histórico técnico, custo posterior segue reconciliável e nenhum resultado posterior é promovido.

## Validação (determinística, sem provedor pago)

Reexecução apenas do 5.7, pelo harness autenticado com JWT de usuário comum:
1. Cenário controlado com uma etapa em `resultado_incerto` → conferir etapa = `resultado_incerto`, execução = `resultado_incerto`, `reservar_etapa` não devolve trabalho dependente, nenhuma nova reserva correspondente criada, nenhuma duplicata em `execucao_reservas_custo` nem `execucao_resultados`.
2. Resolver como falha → propagação `dependencia_falhou` e estado final correto.
3. Resolver como sucesso confirmado → retomada a partir do grafo persistido, nenhuma chamada original repetida, estado final recalculado.
4. Cancelar com etapa incerta → execução `cancelada`, etapa preservada, sem promoção posterior.

Evidência: estado anterior/posterior, etapas, eventos, reservas e resultados por cenário, mais typecheck limpo.

## Detalhes técnicos
Uma única migração altera `aplicar_transicao_execucao`, `reconciliar_grafo_execucao`, `reservar_etapa`, `reservar_custo_v2` e `resolver_resultado_incerto`. Sem novas tabelas, sem mudança de RLS ou grants. No frontend, apenas `EstadoExecucao`/`ROTULO_ESTADO_EXECUCAO` em `src/lib/execucao.ts` ganham `resultado_incerto` ("Resultado incerto"); sem redesenho.