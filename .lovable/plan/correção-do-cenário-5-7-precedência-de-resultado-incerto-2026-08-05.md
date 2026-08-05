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
`reservar_custo_v2` passa a aceitar o estado de execução `resultado_incerto`, mas só concede reserva quando **todas** as condições valem:
- a etapa alvo não está em `resultado_incerto`;
- a etapa alvo está `em_execucao` com lease válido (`lease_ate >= now()`);
- a etapa pertence à execução e a execução pertence ao usuário autenticado (`execucao_e_minha`);
- a etapa não depende, direta nem indiretamente, de nenhuma etapa em `resultado_incerto` (fecho transitivo sobre `depende_de`, avaliado no servidor);
- a tentativa informada é a tentativa corrente da etapa;
- a chave de idempotência é derivada e validada no servidor (o cliente nunca fornece chave);
- há orçamento disponível dentro do teto da execução.

A etapa incerta nunca recebe nova reserva. A reserva original dela é **mantida** (retida até reconciliação explícita por `reconciliar_custo`), nunca liberada nem duplicada — a idempotência por chave canônica já garante ausência de duplicata.

### E. Resolução explícita (sem retry cego)
Nova RPC com contrato fechado, sem booleano ambíguo: `resolver_resultado_incerto_v2(_etapa_id uuid, _desfecho text)`, com `_desfecho` restrito a `falha_confirmada`, `sucesso_confirmado`, `refazer_manualmente` (qualquer outro valor é rejeitado). `security definer`, `search_path` fixo, validação de propriedade e mesma ordem determinística de locks.

- **falha_confirmada**: etapa vai para `falhou` com `ultimo_codigo_erro = 'unknown_outcome'`; evento de resolução registrado em `execucao_eventos`; a reconciliação propaga `dependencia_falhou` aos dependentes impossíveis e recalcula o estado da execução.
- **sucesso_confirmado**: **nunca chama o provedor**. Só é aceito quando existem resultados persistidos completos e válidos da mesma execução, etapa e tentativa: conferência de schema/tipo do payload, quantidade esperada para o papel, presença e unicidade dos IDs de item/lote, ausência de duplicata e ausência de marca de descarte. Resultado parcial ou inconsistente é recusado com erro seguro e a etapa continua `resultado_incerto`. Aprovado, a etapa vai para `concluida` e o grafo é reconciliado.
- **refazer_manualmente**: nunca automático. Registra a decisão manual e o risco de custo duplicado em `execucao_eventos`, incrementa a tentativa da etapa, o que gera nova chave canônica de idempotência na próxima reserva, e recoloca **apenas** a etapa afetada em condição elegível (`pendente`). A tentativa anterior em `execucao_tentativas` e sua reserva técnica são preservadas.

Em todos os desfechos, `reconciliar_grafo_execucao` roda ao final, o estado é recalculado e só etapas elegíveis seguem. Nenhum caminho reexecuta a chamada original sozinho.

A função antiga `resolver_resultado_incerto(_etapa_id, _retomar)` vira wrapper temporário documentado, com mapeamento explícito `_retomar = true → refazer_manualmente` e `_retomar = false → falha_confirmada`, e tem o `execute` revogado de `authenticated` (permanece apenas para chamadas internas). O frontend passa a chamar só a v2. Em `PainelExecucao.tsx`, o bloco de resultado incerto ganha as três ações rotuladas ("Confirmar sucesso", "Confirmar falha", "Refazer manualmente"), com aviso de custo duplicado na terceira; sem redesenho.

### F. Cancelamento durante `resultado_incerto`
`cancelar_execucao` já conta apenas etapas `em_execucao` como ativas, então com etapa incerta vai direto para `cancelada` (transição nova de A). A etapa incerta é preservada como está no histórico técnico, custo posterior segue reconciliável e nenhum resultado posterior é promovido.

## Validação (determinística, sem provedor pago)

Reexecução apenas do 5.7, pelo harness autenticado com JWT de usuário comum:
1. criação da incerteza → etapa = `resultado_incerto`, execução = `resultado_incerto`;
2. ramo independente continua → `reservar_etapa` entrega a etapa independente e `reservar_custo_v2` concede a reserva dela;
3. dependente permanece bloqueado → não é entregue por `reservar_etapa` e não recebe reserva;
4. etapa incerta não consegue reservar de novo; reserva original permanece retida;
5. resolução como `falha_confirmada` → propagação `dependencia_falhou` e estado final correto;
6. resolução como `sucesso_confirmado` com resultado completo → etapa `concluida`, sem repetir chamada, estado recalculado;
7. rejeição de `sucesso_confirmado` sem resultado completo → recusa e etapa mantida incerta;
8. `refazer_manualmente` → tentativa incrementada, nova chave canônica, tentativa e reserva anteriores preservadas, sem repetição automática;
9. cancelamento durante incerteza → execução `cancelada`, etapa no histórico técnico, sem promoção posterior;
10. ausência de duplicatas em `execucao_resultados` e `execucao_reservas_custo`.

Evidência por cenário: estado anterior e posterior da execução e das etapas, eventos, tentativas, chaves de idempotência, reservas e resultados; mais typecheck limpo.

## Detalhes técnicos
Uma única migração altera `aplicar_transicao_execucao`, `reconciliar_grafo_execucao`, `reservar_etapa`, `reservar_custo_v2` e `resolver_resultado_incerto` (wrapper), e cria `resolver_resultado_incerto_v2` mais uma função auxiliar de fecho transitivo de dependências. Sem novas tabelas e sem mudança de RLS; a única mudança de grant é o `revoke execute` da função antiga para `authenticated` e o `grant execute` da v2. No frontend: `EstadoExecucao`/`ROTULO_ESTADO_EXECUCAO` em `src/lib/execucao.ts` ganham `resultado_incerto`, `resolverIncerto` em `src/lib/execucao.functions.ts` passa a receber o desfecho fechado e `PainelExecucao.tsx` expõe as três ações.