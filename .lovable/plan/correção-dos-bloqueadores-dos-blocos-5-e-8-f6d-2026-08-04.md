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
- Cancelamento direto, quando não há chamada ativa nem lease em andamento:
  `criada>cancelada`, `aguardando_consentimento>cancelada`, `pronta>cancelada`, `em_processamento>cancelada`, `resultado_incerto>cancelada` (estado de execução).
- `cancelamento_solicitado` continua existindo, mas só é usado quando há chamada ativa/lease: `pronta>cancelamento_solicitado`, `em_processamento>cancelamento_solicitado`, `resultado_incerto>cancelamento_solicitado`, e `cancelamento_solicitado>cancelada`.
- Encerramentos vindos da reconciliação: `pronta>falhou`, `pronta>parcialmente_concluida`, `pronta>concluida`, `aguardando_consentimento>falhou`, `em_processamento>aguardando_consentimento`, `em_processamento>resultado_incerto`, `resultado_incerto>em_processamento`, `resultado_incerto>concluida`, `resultado_incerto>parcialmente_concluida`, `resultado_incerto>falhou`.
- Transição para o mesmo estado continua no-op (idempotência preservada).

Em `aplicar_transicao_etapa`, o estado terminal da etapa é preservado: **não** existem `falhou>bloqueada` nem `resultado_incerto>bloqueada`. Uma etapa que falhou permanece `falhou`; uma etapa incerta permanece `resultado_incerto` até resolução explícita. Só se adiciona `falhou>cancelada` para o encerramento por cancelamento. Etapa `concluida` nunca é revertida.

### B. `cancelar_execucao`
- No-op quando já terminal (`cancelada`, `concluida`, `parcialmente_concluida`, `falhou`) — idempotente.
- Lock da execução (`for update`) antes de decidir.
- Cancela etapas `pendente` e `bloqueada` (código `cancelada_por_execucao`) e limpa `proxima_tentativa_em`.
- Etapas em `resultado_incerto` são preservadas como estão: a pendência técnica de custo e desfecho externo continua registrada e não impede o encerramento da execução.
- Sem etapa `em_execucao` (inclusive nos estados `criada`, `aguardando_consentimento`, `pronta`, `em_processamento` sem etapa ativa e `resultado_incerto`): vai direto para `cancelada`.
- Com etapa `em_execucao` ou lease vivo: vai para `cancelamento_solicitado`; o descarte de resposta tardia já existente em `concluir_etapa`/`falhar_etapa` fecha para `cancelada` quando a última ativa encerra.
- Após o cancelamento: resposta tardia nunca é promovida; desfecho externo reconciliado depois serve apenas para custo e histórico técnico; cancelar de novo é no-op.
- Custos já reservados permanecem e são reconciliados quando o valor real chegar.

### C. `reservar_custo` e chaves de idempotência
Na mesma transação, após o `for update` da execução:
- rejeitar (`false`) se o estado não for `pronta` nem `em_processamento`;
- rejeitar se a etapa não pertence à execução, não está `em_execucao` ou está sem lease válido (`lease_ate >= now()`);
- rejeitar quando a tentativa embutida na chave divergir da tentativa corrente da etapa;
- manter idempotência quando a mesma chave já existe.

A chave **não** fica restrita a `etapa:<id>:<tentativa>`. Ela é composta e validada no servidor, com os componentes exigidos pelo tipo da chamada: etapa, tentativa e, conforme o caso, lote, especialista de origem, número da correção, item original e marca de segunda auditoria. A RPC recebe esses componentes como argumentos tipados e monta a chave; o frontend não fornece chave arbitrária como autoridade. Regras verificadas no servidor:
- lotes diferentes geram chaves distintas e não colidem;
- a mesma chamada repetida é idempotente;
- correções diferentes não compartilham reserva;
- uma segunda correção do mesmo item é rejeitada (política de correção única já vigente);
- tentativa divergente da tentativa corrente é rejeitada.

O lock de linha da execução, compartilhado com `cancelar_execucao`, resolve a disputa cancelamento x reserva: apenas uma decisão prevalece.

### D. `reconciliar_grafo_execucao(_execucao_id)` — nova RPC, `security definer`, `search_path` fixo, idempotente
Segurança e locks:
- valida a propriedade da execução (`execucao_e_minha`) quando chamada com JWT comum; nunca aceita `user_id`/proprietário vindo do cliente;
- vive exclusivamente no servidor, sem exposição de detalhe interno de erro;
- ordem de locks determinística: primeiro `execucoes` (`for update`), depois `execucao_etapas` ordenadas por `ordem, id`. A mesma ordem passa a valer em `cancelar_execucao`, `reservar_custo`, `concluir_etapa`, `falhar_etapa` e `resolver_resultado_incerto`, evitando deadlock;
- não chama provedor, não reserva orçamento, não cria resultado, não promove conteúdo e não toca execução de outra conta.

Lógica:
1. Recupera etapas com lease expirado (reaproveita `recuperar_etapas_expiradas`).
2. Para cada etapa `pendente`, avalia dependências, sem alterar o estado das antecedentes:
   - dependência `falhou`/`cancelada` sem resultado válido, quando o sucesso é exigido → a **dependente** vai a `bloqueada` com `ultimo_codigo_erro = 'dependencia_falhou'` (ou `cancelada_por_execucao` após cancelamento, ou `autorizacao_ausente` quando a barreira é de consentimento). A causa original da antecedente é preservada;
   - dependência em retry, backoff, `em_execucao` ou `resultado_incerto` → nada muda (não é falha definitiva);
   - todas as dependências terminais e existindo ao menos um lote válido → etapa segue elegível.
3. Barreira dos especialistas: o Auditor exige todos os especialistas roteados terminais e ao menos um lote válido em `execucao_resultados`. Especialista falho não invalida os lotes dos demais. Sem nenhum lote válido, Auditor e as etapas seguintes (correção, ranking, entrega) ficam `bloqueada` com `dependencia_falhou`.
4. Ao final, chama o cálculo de estado final (E).

Chamada ao fim de `concluir_etapa`, `falhar_etapa`, `resolver_resultado_incerto` (com recálculo completo do estado após a resolução) e `cancelar_execucao`, e também no início de `obterExecucao` e `reservar_etapa`, para destravar execuções antigas já presas.

### E. Cálculo de estado final (somente no servidor, dentro da reconciliação)
Substitui as contagens ad hoc de `concluir_etapa` e `falhar_etapa`. Precedência, nesta ordem:
1. `cancelada` — o cancelamento terminou;
2. `resultado_incerto` — existe chamada externa sem desfecho confirmado;
3. `aguardando_consentimento` — as únicas pendências são autorizações obrigatórias e ainda há caminho válido;
4. `em_processamento` — há etapa elegível, ativa ou em backoff;
5. sem trabalho vivo: `concluida` se todos os formatos solicitados têm resultado válido e há ao menos três itens aprovados; `parcialmente_concluida` se há conteúdo entregável mas com formato/lote perdido ou menos de três aprovados; `falhou` se nada entregável chega à curadoria.

### F. Higiene
- Remover `src/routes/api/public/f6d-probe.ts` e `src/routes/api/public/f6d-erro.ts`.
- Conferir que nenhuma rota pública devolve texto interno de erro e que não restam flags/fixtures temporárias de teste.
- Frontend: sem redesenho. Apenas o rótulo seguro de `dependencia_falhou` em `MENSAGEM_ERRO_ETAPA` (`src/lib/execucao.ts`) e verificação de que o botão Cancelar aparece nos estados iniciais em `PainelExecucao.tsx`.

## Validação (sem provedor pago)

Cenários A–D (cancelamento) e E–J (falha definitiva) do pedido, com SQL usado apenas para preparar pré-condição e o harness existente chamando as RPCs como usuário autenticado. Para cada cenário: estado anterior, ação, estado posterior, etapas resultantes e tentativa de reserva após o cancelamento.
Depois: reexecução dos blocos 5 e 8 da matriz e confirmação de typecheck, build, preview e console limpo. Só então os blocos que exigem OpenAI/Anthropic voltam a rodar.

## Detalhes técnicos
Uma única migração cobre A–E: alteração de `aplicar_transicao_execucao`, `aplicar_transicao_etapa`, `cancelar_execucao`, `reservar_custo`, `concluir_etapa`, `falhar_etapa` e `resolver_resultado_incerto`, mais a criação de `reconciliar_grafo_execucao`. Sem novas tabelas e sem alteração de RLS ou grants existentes.