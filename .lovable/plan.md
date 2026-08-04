# F6D — Continuação da validação (blocos 4, 7, 8, 9, 11, 12, 13 + lacunas de 1, 2, 5, 6)

Estou em Plan Mode, então nada é executado até a aprovação. A execução da matriz envolve chamadas reais pagas à OpenAI e à Anthropic, escrita em `execucoes`, `execucao_etapas`, `execucao_resultados` e `execucao_reservas_custo`, e criação de contas de teste — tudo isso é mudança de estado e precisa do seu aval.

## Reclassificação aceita

A matriz final passa a usar quatro rótulos: aprovado, parcialmente aprovado, reprovado, reprovado e corrigido.

| Bloco | Situação de partida |
|---|---|
| 1 Pipeline real | parcialmente aprovado — falta CTA real |
| 2 Correção real | parcialmente aprovado — falta Hook/Headline/CTA e bloqueio da segunda correção |
| 3 Segunda auditoria | aprovado |
| 5 Estados finais | parcialmente aprovado — só `concluida` comprovado |
| 6 Voz de Marca | parcialmente aprovado — falta caso positivo e isolamento entre provedores |
| 10 Ranking e entrega 3 de 5 | aprovado |
| 4, 7, 8, 9, 11, 12, 13 | sem evidência |

A correção da assinatura de `reservar_custo` em `correcao-etapa.server.ts` fica registrada como **reprovado e corrigido** no bloco 2.

## Como cada bloco será provado

Reaproveito o harness já pronto em `/tmp/f6d` (JWT real por conta, chamadas ao `_serverFn` do dev server, leitura direta do banco). Nenhuma evidência já válida é reexecutada.

**Lacuna 1 — CTA real.** Uma execução formato CTA em Híbrido Autorizado; conferir cinco variações, `execucao_id`, papel, formato, versão do Registry e índice do item gerados no servidor; forçar saída inválida, recusa e truncamento e conferir que nada criativo é persistido.

**Lacuna 2 — roteamento da correção.** Três execuções (hook, headline, cta) com reprovação por cenário controlado; conferir que a correção volta ao mesmo especialista de origem e que uma segunda tentativa de correção sobre o mesmo item é recusada.

**Bloco 4 — grafo paralelo.** Execução multi-formato com os três especialistas disparados de forma concorrente por duas sessões da mesma conta; verificar elegibilidade decidida no servidor, barreira só após estado terminal de todos, ramo em retry ou `resultado_incerto` segurando a barreira, reload no meio, ausência de duplicatas e um ramo falhando sem derrubar os demais.

**Bloco 7 — orçamento.** Reservas disparadas em paralelo; conferir soma nunca acima do teto, recusa antes de chegar ao provedor, reconciliação do custo real, liberação apenas do excedente reservado, reserva preservada em `resultado_incerto`, bloqueio quando o teto é atingido e seleção determinística quando o saldo cobre só parte das correções.

**Bloco 8 — cancelamento.** Cancelar durante o paralelismo, durante a correção e antes da segunda auditoria, incluindo resposta tardia do provedor; conferir ausência de novas reservas e de promoção de resultado após o cancelamento.

**Bloco 9 — incerteza e idempotência.** Interromper a persistência de um lote; conferir registro por etapa, lote e tentativa, mesma chave de idempotência no reenvio, ausência de retry automático cego, ausência de duplicata, resolução explícita e preservação dos ramos já concluídos.

**Lacuna 5 — estados finais.** Provocar `parcialmente_concluida` com entrega parcial, `falhou`, `aguardando_consentimento` e `resultado_incerto`, além do `concluida` já comprovado.

**Lacuna 6 — Voz de Marca por provedor.** Quatro execuções: autorização só para Anthropic, só para OpenAI, nenhuma e ambas; conferir nota válida quando avaliável, `null` com fator neutralizado quando não, e nenhuma propagação de autorização entre provedores.

**Bloco 11 — metadados.** Enviar `execution_id`, item original, papel, formato, versão do Registry e número da correção adulterados; confirmar que o servidor ignora ou rejeita cada um.

**Bloco 12 — regressão e escopo.** Regressão F1–F6C nos fluxos de auth, pastas, chats, perfis de marca, privacidade e Registry; typecheck; build; preview; console sem erro; varredura por credenciais no bundle cliente; confirmação de que Llama, WebLLM e adaptação local real seguem fora do escopo.

**Bloco 13 — isolamento.** Duas contas comuns com JWT real; conta B tenta ler, avançar, reservar, cancelar, autorizar e resolver recursos da execução da conta A — todas devem ser negadas.

## Regras da execução

Correções durante a validação ficam limitadas a regressões reais, no menor escopo possível, sempre reportadas. Nenhuma mudança de arquitetura ou de escopo entra aqui: divergência estrutural vira registro na matriz e volta ao Plan Mode. A F6D só é encerrada com os 13 blocos com evidência suficiente.

## Detalhes técnicos

Cenários que dependem de estado difícil de provocar por caminho natural (reprovação do auditor, resposta tardia, persistência interrompida) usam cenário controlado — migração pontual ou injeção de falha — e ficam identificados como tal na matriz, separados das evidências de chamada real de provedor. Cada linha da matriz declara o tipo de evidência: chamada real OpenAI/Anthropic, cenário controlado, JWT real, consulta ao banco ou leitura de código.