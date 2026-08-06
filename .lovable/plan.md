# Correção do fluxo de complemento de briefing

## Diagnóstico confirmado

Consultei o banco: em toda execução em que o Gatekeeper respondeu `suficiente: false`
(5 ocorrências, incluindo a mais recente, `bec0f715…` de 06/08 22:19), a execução seguiu
até o estado `concluida`, com análise psicológica, especialistas, auditoria, correção,
adaptação, ranking e consolidação todos `concluida`. Ou seja: o pipeline não parou e
houve custo real nos provedores mesmo com briefing insuficiente.

Causa: a etapa do Gatekeeper é tratada como sucesso técnico independentemente do
conteúdo. Em `src/lib/execucao.functions.ts`, quando `resultado.ok` é verdadeiro chama-se
`concluir_etapa` e a etapa vira `concluida`. A função `reservar_etapa` então libera a
etapa seguinte, porque ela só olha o estado da dependência, nunca o campo `suficiente`
do resultado. Não existe estado de execução que represente "esperando o usuário", e a
interface (`PainelExecucao.tsx`, linha 383) apenas exibe um aviso informativo, sem campo
de resposta.

## O que será feito

### 1. Parada real do pipeline

Novo estado de execução `aguardando_complemento` no banco, com as transições válidas
correspondentes. Quando o Gatekeeper concluir com `suficiente: false`, o servidor
registra o resultado e move imediatamente a execução para esse estado. Como
`reservar_etapa` só reserva etapas quando a execução está em `em_processamento` ou
`resultado_incerto`, nenhuma etapa seguinte é reservada e nenhuma chamada a provedor
acontece.

As etapas seguintes permanecem `pendente` — nunca aparecem como concluídas.

### 2. Campo de resposta no próprio card

O card "Aguardando complemento do briefing" passa a conter:
- a pergunta real do Gatekeeper desta execução e as lacunas apontadas;
- um campo de texto para a resposta, com verificação de dados pessoais no dispositivo
  antes do envio (mesmo alerta já usado no composer);
- botão "Enviar complemento", desabilitado enquanto vazio ou em envio;
- aviso claro de que reavaliar o briefing gera nova chamada e novo custo.

O botão "Retomar" fica oculto nesse estado: retomar sem resposta não é permitido.
O rótulo do estado no cabeçalho e no workspace passa a ser "Aguardando complemento".

### 3. Reavaliação do briefing complementado

Ao enviar, o complemento é gravado como mensagem do usuário no chat (aparece na
conversa) e o servidor, na mesma transação:
- valida que a mensagem pertence ao usuário, ao chat e à execução;
- registra o vínculo do complemento no snapshot da execução;
- devolve a etapa do Gatekeeper para `pendente`, ampliando o limite de tentativas em 1
  para não estourar o teto por causa do complemento;
- volta a execução para `em_processamento`.

O Gatekeeper roda de novo lendo as últimas mensagens do chat, portanto já enxerga o
complemento. Se voltar `suficiente: true`, o pipeline continua e a Diretriz Estratégica
aparece. Se voltar `false` de novo, a execução volta a `aguardando_complemento` com a
nova pergunta. Os resultados anteriores do Gatekeeper continuam salvos (append-only).

### 4. Execuções antigas

Nada é apagado nem reescrito. Execuções já concluídas de forma indevida permanecem no
banco para rastreabilidade.

## Detalhes técnicos

- Migração: novo valor no `execucoes_estado_check`; transições
  `em_processamento>aguardando_complemento`, `aguardando_complemento>em_processamento`,
  `aguardando_complemento>cancelamento_solicitado`, `aguardando_complemento>cancelada`,
  `aguardando_complemento>falhou`; nova função `security definer`
  `responder_complemento_briefing(_execucao_id, _mensagem_id)` com as validações acima.
- `src/lib/execucao.functions.ts`: após `concluir_etapa` do Gatekeeper, se
  `saida.suficiente = false`, aplicar a transição para `aguardando_complemento`; nova
  server function `responderComplemento` chamando a RPC.
- `src/lib/execucao.ts`: novo estado no tipo `EstadoExecucao` e no rótulo.
- `src/components/execucao/PainelExecucao.tsx`: card bloqueante com campo de resposta,
  lacunas, aviso de custo e ocultação de "Retomar" nesse estado.
- `src/components/chat/Workspace.tsx` e `AreaResultados.tsx`: rótulo de status coerente.

## Critérios de aceite

1. Briefing insuficiente: execução fica em "Aguardando complemento"; nenhuma etapa
   posterior ao Gatekeeper sai de `pendente`; nenhum evento técnico de provedor
   posterior é registrado.
2. O card mostra a pergunta real daquela execução e um campo de resposta funcional.
3. Enviar o complemento reavalia o briefing; suficiente prossegue o pipeline,
   insuficiente volta a bloquear com a nova pergunta.
4. Nenhuma diretriz estratégica é exibida enquanto o briefing estiver insuficiente.