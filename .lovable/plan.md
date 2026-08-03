# Validação de encerramento da F6D

Objetivo: verificar objetivamente os 12 blocos de requisitos da F6D, sem alterar arquitetura, sem ampliar escopo e sem antecipar a próxima fase. Ao final, entrego uma matriz (requisito, resultado, evidência, status, correção mínima) e a recomendação de encerramento.

## Método

Três camadas de verificação, cada uma com evidência citável:

1. Leitura dirigida de código e SQL (autoridade do servidor, metadados, política de uma correção, filtros de ranking).
2. Consulta ao banco (`execucao_etapas`, `execucao_resultados`, `execucao_eventos`, `execucao_reservas_custo`, `consentimentos`) sobre execuções reais criadas durante a validação.
3. Execuções reais ponta a ponta pelo app (Playwright autenticado no preview) e cenários controlados de falha via os testes administrativos já existentes e via `simular` já suportado na função de execução.

Cenários de falha usam apenas mecanismos já existentes (erro de provedor, truncamento, recusa, resultado incerto, orçamento esgotado, cancelamento). Nada de novo código de simulação.

## Roteiro por bloco

1. CTA real: uma execução com formato CTA; conferir provedor/modelo/versão do Registry na etapa, contagem de exatamente 5 CTAs, IDs e metadados gravados pelo servidor, revalidação de consentimento antes da chamada, e registro de tokens, custo, duração e stop reason. Cenários de saída inválida, recusa e truncamento devem terminar sem nenhum CTA persistido.
2. Correção pelo especialista de origem: três execuções com reprovação forçada (hook, headline, CTA). Verificar reuso da mesma versão do Registry da geração original, permanência do original no histórico, contexto autorizado enviado, metadados de controle no servidor e bloqueio de segunda correção do mesmo item.
3. Segunda auditoria: conferir que todo item corrigido é reauditado; aprovado segue ao ranking, reprovado fica fora, falha técnica impede promoção, não há terceira geração, original e corrigido não competem, histórico completo em quatro camadas.
4. Grafo paralelo: execução com os três formatos; conferir decisão de elegibilidade e barreira no servidor, retomada após recarregar o navegador e em segunda sessão da mesma conta, barreira só após estado terminal de todos os especialistas solicitados, e preservação dos ramos concluídos quando um ramo falha.
5. Estados finais: reproduzir concluída, parcialmente concluída, entrega parcial, falhou, aguardando consentimento e resultado incerto; confirmar que item sem auditoria válida nunca entra em ranking ou curadoria.
6. Consentimentos entre provedores: para cada uma das cinco travessias de dados, forçar ausência da categoria e confirmar que a chamada externa não ocorre, com bloqueio no servidor e não apenas na interface.
7. Reserva de orçamento: chamadas paralelas contra o mesmo saldo, reserva antes da chamada, reconciliação após a resposta, liberação do saldo não usado, retenção da reserva em timeout/incerto, bloqueio quando esgotado, preservação de resultados concluídos, e seleção determinística quando o saldo cobre só parte das correções (nota, confiança, prioridade de formato, ordem de criação).
8. Cancelamento: cancelar durante especialistas em paralelo e durante correção; conferir bloqueio de novas reservas, ausência de segunda auditoria, descarte de respostas tardias, resultados apenas no histórico e nenhuma promoção pós-cancelamento.
9. Resultado incerto e idempotência: registro por etapa, lote e tentativa, ausência de retry automático cego, chave de idempotência preservada, sem duplicatas, resolução explícita e ramos concluídos preservados.
10. Ranking e entrega: filtros de elegibilidade, substituição da original pela corrigida aprovada, entrega de até três melhores e entrega parcial honesta abaixo de três.
11. Segurança de metadados: respostas maliciosas tentando trocar execução, papel, formato, versão do Registry, número da correção e item original devem ser ignoradas ou rejeitadas.
12. Regressão e escopo: roteamento por provedor inalterado, ranking determinístico, escopo local fora, nenhuma credencial em banco/logs/frontend, regressão F1–F6C, e typecheck, build, preview e console limpos.

## Correções

Aplico somente correções mínimas para requisitos reprovados, cada uma registrada na coluna correspondente da matriz. Se algum reprovado exigir mudança estrutural, eu não implemento: reporto e devolvo a decisão.

## Fora de escopo

Llama, WebLLM, adaptação local, memória adaptativa, novos provedores, novos formatos e qualquer item da próxima fase.
