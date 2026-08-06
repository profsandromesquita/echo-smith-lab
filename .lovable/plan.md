# Correção da Diretriz Estratégica no chat

## 1. Causa raiz confirmada
O cartão "Diretriz estratégica" do chat **não vem de nenhuma execução**. Ele é uma mensagem de plataforma gravada com texto fixo a cada envio do briefing.

`src/lib/fixtures.ts:232`:
`RESPOSTA_SIMULADA = "Briefing suficiente. Conflito inconsciente identificado: medo do julgamento disfarçado de falta de tempo. Diretriz compartilhada com os especialistas."`

Esse texto é persistido como mensagem `autor: "plataforma"` em:
- `src/routes/_authenticated/app/index.tsx:37` (criação do chat)
- `src/routes/_authenticated/app/c.$chatId.tsx:39` (cada nova mensagem)

Por isso é sempre idêntico, aparece em qualquer chat e não tem relação semântica com o briefing.

## 2. Componente que renderiza o cartão
`src/components/chat/Thread.tsx` — função `Diretriz`, aplicada a toda mensagem com `autor === "plataforma"`. A primeira frase vira resumo, o resto vira "Ver análise". Sem vínculo com execução, etapa ou papel.

## 3. Fonte atual do texto
Fixture `RESPOSTA_SIMULADA`, persistida na tabela de mensagens do chat. Não passa por Gatekeeper nem pelo Analista de Psicologia.

## 4. Fonte atual do horário
`criado_em` da própria mensagem de plataforma (`c.$chatId.tsx:83`, via `horario()`). Texto e horário vêm do mesmo registro, mas esse registro é o fixture — o horário novo dá falsa impressão de resultado novo.

## 5. Comportamento de "Gerar pacote"
Botão do `Composer`. Apenas: valida PII no dispositivo, grava a mensagem do usuário e grava a `RESPOSTA_SIMULADA`. **Não cria execução, não chama provedor, não toca na máquina de estados.** Fluxo legado da F0.

## 6. Comportamento de "Iniciar execução"
Botão do `PainelExecucao` (`criarExecucao` + `avancarExecucao`). Único caminho ligado ao pipeline real (F5/F6D), com etapas, consentimento, provedores e resultados em `execucao_resultados`.

## 7. Fluxo legado da F0
Confirmado, com duplicação: dois comandos concorrentes, um demonstrativo e um real.

## 8. Arquivos e funções afetados
- `src/lib/fixtures.ts` — remover `RESPOSTA_SIMULADA`
- `src/routes/_authenticated/app/index.tsx` e `app/c.$chatId.tsx` — parar de gravar resposta simulada
- `src/components/chat/Thread.tsx` — deixar de tratar mensagem de plataforma como diretriz
- `src/components/execucao/PainelExecucao.tsx` — exibir o cartão real (Gatekeeper + Psicologia) da execução ativa
- `src/lib/execucao.functions.ts` — expor na leitura de `obterExecucao` o payload da diretriz psicológica já persistido (somente leitura; sem mudança de schema nem da máquina de estados)

## 9. Correção mínima recomendada
1. Eliminar o caminho demonstrativo: "Gerar pacote" deixa de gravar a resposta fixa; o envio registra apenas o briefing do usuário.
2. Unificar comandos: "Gerar pacote" passa a criar/avançar a execução real do chat. O botão do painel deixa de duplicar a ação principal.
3. Cartão único e vinculado, dentro do `PainelExecucao`, sempre a partir da execução ativa do chat:
   - "Briefing suficiente / Aguardando complemento" do resultado do papel `gatekeeper` daquela execução;
   - conflito e diretriz do resultado `tipo = diretriz` do papel de psicologia da **mesma** execução, maior `tentativa`;
   - horário lido do `criado_em` do mesmo registro persistido.
4. Estados honestos, sem fallback: sem execução, estado vazio; gatekeeper concluído e psicologia pendente, "analisando conflito"; consentimento pendente, falha, cancelamento ou `resultado_incerto`, estado correspondente. Nenhum texto padrão substitui resultado ausente.
5. Cache: ao criar nova execução, invalidar `chavesExecucao.ativaDoChat(chatId)` e `porId`; consultas chaveadas por `chatId` + `execucaoId`, com o painel remontado por `execucaoId` para não herdar cartão de execução ou chat anterior.
6. **Mensagens simuladas legadas**: os registros permanecem no banco, intactos, para rastreabilidade. Na renderização, o `Thread` reconhece o conteúdo legado conhecido — comparação exata com a assinatura textual antiga **e** `autor === "plataforma"` — e não o exibe: nem como diretriz, nem como mensagem comum. Nenhuma heurística por palavra-chave, para não ocultar mensagem real. Esse conteúdo nunca é copiado para execução, nunca serve de fallback, e nenhuma mensagem real de plataforma é excluída ou escondida.
7. **Idempotência atômica da criação de execução** (sem nova tabela; função SQL `security definer` que envolve a criação já existente):
   - o cliente envia apenas `chatId` + `mensagemId`. Usuário, número de reexecução e chave idempotente são derivados no servidor;
   - tudo abaixo acontece **dentro de uma única transação**, nunca "consultar e depois criar":
     1. valida que a mensagem existe, pertence a `auth.uid()` e ao `chatId` informado (caso contrário, rejeita);
     2. adquire `pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || _chat_id::text || ':' || _mensagem_id::text, 0))` — lock canônico liberado automaticamente no fim da transação;
     3. procura execução do usuário já vinculada àquela mensagem;
     4. havendo execução não terminal, devolve o mesmo `execucaoId` sem criar nada;
     5. não havendo, cria exatamente uma execução, reutilizando a lógica atual de `criar_execucao` (sem mudar máquina de estados);
   - o vínculo com a mensagem é gravado em `snapshot_chat` (jsonb já existente — sem migração de schema), junto do número de reexecução;
   - o botão fica desabilitado enquanto a mutação está pendente; duplo clique e duas abas resolvem na mesma execução;
   - reload durante a criação recupera a execução pela consulta de execução ativa do chat, sem criar outra;
   - "Gerar pacote" e o botão do painel chamam a mesma função, então não há execuções concorrentes para o mesmo briefing.
8. **Botão do painel**: havendo execução ativa, mostra apenas progresso/cancelar. Só após estado terminal (concluída, parcial, falha ou cancelada) aparece **"Executar novamente"**, com clique explícito e aviso de novo custo no provedor. O servidor, **dentro do mesmo advisory lock**, calcula o próximo número de reexecução a partir das execuções já vinculadas àquela mensagem e cria uma única execução nova; duas solicitações simultâneas não recebem o mesmo número nem duplicam. Cada reexecução fica explicitamente vinculada à mesma mensagem e preserva as anteriores intactas.

Autoridade permanece no servidor: o frontend envia apenas `chatId`/`execucaoId`; papel, etapa e tentativa são resolvidos no servidor sob RLS por usuário.

## 10. Riscos
- Chats antigos guardam mensagens de plataforma com o texto fixo; elas deixam de ser renderizadas por completo, com os dados preservados no banco. Risco de ocultar mensagem real é mitigado pela comparação exata com o conteúdo legado, sem heurística.
- Unificar os botões muda o gesto conhecido: um envio passa a custar provedor. Mitigação: manter o fluxo de consentimento antes de qualquer chamada externa e a criação idempotente por mensagem.
- Reexecução explícita gera custo novo: mitigada pelo aviso no botão e pela exigência de estado terminal.

## 11. Critérios de aceite
- Nenhuma ocorrência de `RESPOSTA_SIMULADA` no código.
- Mensagens legadas com esse conteúdo não aparecem no thread e permanecem no banco.
- Um envio cria no máximo uma execução; duplo clique e reload não duplicam.
- "Executar novamente" só existe após estado terminal.
- Diretriz exibida pertence sempre à execução ativa do chat aberto.
- Texto e horário vêm do mesmo registro persistido.
- Chat novo sem execução mostra apenas estado vazio.
- Etapa incompleta mostra progresso, nunca conteúdo anterior.

## 12. Testes
A. Briefing sobre relacionamentos/carinho: diretriz coerente, sem menção a procrastinação.
B. Novo briefing sobre produtividade: diretriz distinta, sem reaproveitar A.
C. Duas execuções no mesmo chat: cartão principal é o da execução ativa; a anterior fica só no histórico técnico.
D. Dois chats: cada um com sua diretriz; troca de chat sem resíduo.
E. Reload: conteúdo e horário idênticos, vindos do servidor.
F. Execução aguardando consentimento: nenhuma diretriz antiga visível.
G. Cancelamento/falha/resultado incerto: estado correspondente, sem promover conteúdo anterior.
H. Duplo clique em "Gerar pacote": uma única execução criada.
H2. 10 requisições concorrentes de "Gerar pacote" para a mesma mensagem: exatamente uma execução.
H3. Duas abas enviando ao mesmo tempo: exatamente uma execução.
H4. 10 requisições concorrentes de "Executar novamente": apenas uma nova execução, com número de reexecução único.
H5. Mensagens diferentes do mesmo chat: execuções independentes.
H6. Mensagem de outro chat ou de outra conta: rejeitada.
I. Reload durante a criação: retoma a mesma execução, sem criar outra.
J. Chat antigo com mensagem simulada: nada daquele texto é renderizado; a mensagem do usuário permanece.

## 13. Confirmação
Nenhuma alteração foi implementada. Registry, provedores, prompts, máquina de estados F6D, consentimentos, ranking, schema, Voz de Marca e IA local permanecem intocados.