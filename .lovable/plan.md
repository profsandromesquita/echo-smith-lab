# F5 — Checkpoint B: validação ponta a ponta da infraestrutura simulada

Sem mudança de arquitetura, sem reabrir o plano da F5, sem nada da F6. O objetivo é comprovar, com evidência, que a infraestrutura de execução simulada e o Registry versionado funcionam do início ao fim — corrigindo apenas o que impedir a comprovação.

## 1. Execução simulada completa
Rodar uma execução do começo ao fim pelo navegador e pelo banco: iniciar, avançar etapa a etapa, conferir que cada transição fica registrada, concluir, e checar que o painel mostra o estado final com os resultados intermediários preservados.

## 2. Roteamento por formato
Criar uma execução para cada formato (Hook, Headline vídeo, Headline imagem, CTA, pacote completo) e conferir a lista de etapas criadas em cada caso: só os especialistas necessários devem existir e rodar.

## 3. Auditoria, correção e entrega
Conferir cinco variações por formato, auditoria simulada, no máximo uma correção por item, item reprovado após a correção fora da curadoria mas preservado no histórico técnico, e entrega das três melhores após ranking determinístico.

## 4. Máquina de estados
Exercitar e evidenciar cada transição: criada → aguardando consentimento; criada → pronta; bloqueada → pendente após consentimento; pendente → em execução; em execução → concluída; falha transitória com retry respeitando a próxima tentativa; falha definitiva; parcialmente concluída; cancelamento solicitado → cancelada; resultado incerto e sua resolução controlada.

## 5. Concorrência e retomada
- Duas reservas simultâneas da mesma etapa: só uma vence.
- Lease expirado só recuperável pela função segura.
- Recarregar a página e reabrir a aba mantêm o estado.
- Resposta tardia após cancelamento não é promovida.
- Cliente não consegue pular backoff nem forçar transição.

## 6. Registry
Ciclo completo: criar rascunho, editar, validar, testar com adaptador simulado, publicar, criar nova versão, usar versão anterior como base, rollback. Confirmar que rascunho não afeta produção, que versão em uso por execução permanece imutável e que a execução registra as versões por papel.

## 7. Permissões
Usuário comum bloqueado em /admin/agentes; administrador técnico opera o Registry; usuário vê apenas as próprias execuções; conta A não acessa execuções nem fotografias da conta B.

## 8. Restrições verificadas
Nenhuma chamada a provedor de IA, nenhum Secret de IA, nenhum WebLLM/Llama real, nenhum RAG, nenhuma memória adaptativa, nada da F6.

## Como será executado (detalhes técnicos)
- Testes de banco via consultas diretas e chamadas RPC autenticadas com duas contas de teste (comum e admin técnico), exercitando `criar_execucao`, `reservar_etapa`, `concluir_etapa`, `falhar_etapa`, `cancelar_execucao`, `resolver_resultado_incerto`, `desbloquear_etapas` e as funções do Registry.
- Fluxos de interface e retomada validados via Playwright em `/app`, `/app/c/$chatId` e `/admin/agentes`, com captura de console.
- Concorrência testada disparando duas reservas em paralelo sobre a mesma execução.
- Correções ficam restritas ao mínimo necessário: ajustes em funções do banco (nova migração) ou nos módulos `src/lib/execucao*`, `src/lib/registry*`, `src/lib/ranking.ts` e nos painéis de execução/registry. Nenhuma mudança de modelo de dados além do necessário para fechar um defeito comprovado.
- Fechamento com build, typecheck, console limpo e inspeção da rede confirmando ausência de requisições externas de IA.

## Entrega final
Matriz com critério, resultado, evidência e aprovado/reprovado, mais: correções realizadas, tabelas e funções testadas, confirmação de build/typecheck/console e confirmação de ausência de requisição externa de IA.
