# Matriz completa 1–13 da F6D (execução da validação)

Objetivo: executar os 13 blocos de validação da F6D com evidências citáveis, aplicar apenas correções mínimas para reprovados e fechar com veredito objetivo. Sem escopo novo e sem antecipar a próxima fase.

## Regras de prova

- Toda verificação de RLS, isolamento, autorização e consentimento usa JWT real de conta comum. `service_role` só para preparar fixtures, promover papel admin e inspecionar depois — nunca como evidência.
- Cada linha da matriz identifica a origem da evidência: chamada real OpenAI, chamada real Anthropic, cenário controlado (`simular`), JWT real, consulta ao banco, ou leitura de código/SQL.
- Cenário controlado percorre a mesma máquina de estados, leases, orçamento e autorização — nunca é apresentado como prova de comportamento do provedor externo.

## Blocos 1–13

1. CTA real (Anthropic): provedor/modelo/versão do Registry na etapa, exatamente 5 CTAs, IDs e metadados gravados pelo servidor, revalidação de consentimento antes da chamada, tokens/custo/duração/stop reason. Saída inválida, recusa e truncamento terminam sem CTA persistido.
2. Correção pelo especialista de origem: reprovação forçada em hook, headline e CTA; mesma versão do Registry da geração original, original preservado no histórico, contexto autorizado, metadados de controle no servidor, bloqueio de segunda correção.
3. Segunda auditoria: todo corrigido é reauditado; aprovado vai ao ranking, reprovado fica fora, falha técnica impede promoção, sem terceira geração, original e corrigido não competem, histórico em quatro camadas.
4. Grafo paralelo: execução com os três formatos; elegibilidade e barreira decididas no servidor, retomada após recarregar e em segunda sessão da mesma conta, barreira só após estado terminal de todos os especialistas, ramos concluídos preservados quando um ramo falha.
5. Estados finais: concluída, parcialmente concluída, entrega parcial, falhou, aguardando consentimento e resultado incerto; item sem auditoria válida nunca entra em ranking ou curadoria.
6. Consentimentos entre provedores: para cada travessia de dados, forçar ausência da categoria e confirmar que a chamada externa não ocorre, com bloqueio no servidor e não só na interface.
7. Orçamento (ver detalhamento abaixo).
8. Cancelamento: cancelar durante especialistas em paralelo e durante correção; sem novas reservas, sem segunda auditoria, respostas tardias descartadas, resultados só no histórico, nenhuma promoção pós-cancelamento.
9. Resultado incerto e idempotência: registro por etapa/lote/tentativa, sem retry automático cego, chave de idempotência preservada, sem duplicatas, resolução explícita, ramos concluídos preservados.
10. Ranking e entrega: filtros de elegibilidade, substituição da original pela corrigida aprovada, até três melhores, entrega parcial honesta abaixo de três.
11. Segurança de metadados: respostas maliciosas tentando trocar execução, papel, formato, versão do Registry, número da correção e item original são ignoradas ou rejeitadas.
12. Regressão e escopo: roteamento por provedor inalterado, ranking determinístico, escopo local fora, nenhuma credencial em banco/logs/frontend, regressão F1–F6C, typecheck, build, preview e console limpos.
13. Isolamento entre contas: duas contas comuns com JWTs independentes. Conta B não acessa execução, etapas, resultados, eventos, reservas, consentimentos, originais, correções, auditorias, histórico técnico, custos nem telemetria da conta A; não avança, reserva, cancela ou resolve incerto. Conta A continua acessando e retomando a própria execução.

## Verificação adicional: Voz de Marca por provedor

Testada de forma isolada por provedor, com JWT real:

- `resumo_voz_marca_explicita` autorizado apenas para os especialistas Anthropic: especialistas recebem o resumo; Auditor OpenAI não recebe.
- `resumo_voz_marca_explicita` autorizado apenas para o Auditor OpenAI: Auditor recebe; especialistas Anthropic não recebem.
- Autorização para um provedor não libera o outro em nenhuma direção (verificado na fotografia da execução e no bloqueio de etapa no servidor).

No Auditor:

- autorizado → `voz_marca_avaliavel = true` e `adequacao_voz_marca` com nota válida dentro da faixa;
- não autorizado → `voz_marca_avaliavel = false`, `adequacao_voz_marca = null`, e nenhuma penalização inventada no ranking (peso neutralizado, não zerado como punição).

## Verificação adicional: Orçamento (bloco 7 detalhado)

- Chamada recusada pela reserva não chega ao provedor (ausência de evento técnico de chamada e de tokens).
- Reservas simultâneas não ultrapassam o teto da execução.
- Custo real normalmente permanece dentro do máximo reservado.
- `excedente_orcamento` registrado somente quando há diferença real inesperada.
- Excedente recorrente reprova a fórmula de reserva (e vira correção mínima na fórmula, não aumento arbitrário de teto).
- Após exceder o teto, nenhuma nova chamada é iniciada.
- Resultado incerto mantém a reserva até resolução explícita.
- Reconciliação libera apenas saldo não consumido, nunca saldo já consumido.
- Seleção determinística quando o saldo cobre só parte das correções: nota, confiança, prioridade de formato, ordem de criação.

## Correções

Somente correções mínimas para requisitos reprovados, cada uma registrada na matriz. Reprovado que exija mudança estrutural não é implementado: é reportado com a decisão devolvida a você.

## Fora de escopo

Llama, WebLLM, adaptação local, memória adaptativa, novos provedores, novos formatos e qualquer item da próxima fase.

## Entrega final

Matriz com requisito, resultado, evidência (tipo e referência), status e correção mínima; lista das correções aplicadas; veredito objetivo sobre o encerramento da F6D.
