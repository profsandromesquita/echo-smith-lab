# Correção mínima: "Apenas esta execução" em Memória Local Estrita

## Resultado da investigação

Confirmado por leitura de código e do banco (`criar_execucao`, `desbloquear_etapas`, `consentimento.functions.ts`, `execucao.functions.ts`, `ModalConsentimento.tsx`, `PainelExecucao.tsx`):

| # | Hipótese | Veredito | Evidência |
|---|---|---|---|
| 1 | O botão não grava a autorização | **Confirmado** | `montarFotografiaSimulada` devolve `persistida: false, motivo: "sem_execucao_real"` e não escreve nada |
| 2 | Grava em outro lugar, fora da fotografia | **Não** | Nenhuma escrita acontece nesse caminho |
| 3 | A fotografia é criada antes da seleção e nunca atualizada | **Confirmado** | `criar_execucao` cria a fotografia e insere as permissões na mesma transação; não existe função para acrescentar permissões depois. `PainelExecucao` chama `criarExecucao` sempre com `permissoesUnicas: []` |
| 4 | Local Estrita bloqueia indevidamente qualquer categoria de nuvem | **Confirmado no cliente** | `BLOQUEADAS_EM_LOCAL_ESTRITA` cobre `resumo_voz_marca`, `texto_gerado`, `variacoes_para_auditoria`, `feedback_para_correcao` — inclui categorias que são apenas processamento em nuvem, não memória privada local |
| 5 | Divergência interface x servidor | **Confirmado** | O servidor não aplica nenhuma restrição por modo ao montar as permissões; a regra existe só na UI, e a UI não persiste nada |

Causa raiz: falta um caminho de autorização por execução. A fotografia só pode receber permissões no instante da criação, e o botão da UI é um resquício da fase em que não havia execução real.

## Correção mínima

1. **Nova função de banco `autorizar_execucao(_execucao_id, _permissoes jsonb)`** (security definer, append-only):
   - valida dono via `execucao_e_minha`;
   - só aceita execução em `aguardando_consentimento` ou `pronta`;
   - resolve `termos_id`/`termos_versao` pelos termos vigentes no servidor (nada vem do cliente);
   - insere em `fotografias_consentimento` com `origem = 'execucao'`, ignorando duplicatas de `categoria|provedor|etapa`;
   - **recusa `resumo_voz_marca` quando a fotografia está em `local_estrita`** — memória privada e voz de marca local continuam bloqueadas;
   - não escreve em `consentimentos` nem em `consentimentos_historico`, portanto não cria autorização persistente nem altera o modo do chat.

2. **Server function `autorizarExecucao`** em `src/lib/consentimento.functions.ts`, chamando a RPC. `montarFotografiaSimulada` deixa de ser usada pelo fluxo com execução real (mantida apenas para o modal sem execução).

3. **`ModalConsentimento`**: recebe `execucaoId` opcional. Com execução presente, "Apenas esta execução" grava via `autorizarExecucao` e dispara `aoConceder`. A lista de categorias bloqueadas em local estrita passa a conter somente as de memória privada local (`resumo_voz_marca`), alinhando cliente e servidor.

4. **`PainelExecucao`**: passa `execucaoId` ao modal e, após conceder, mantém o `desbloquearEtapas` já existente para liberar as etapas.

Sem mudança no Registry, no roteamento real, na máquina de estados ou nos adaptadores.

## Validação

- **A — Local Estrita sem autorizar:** execução fica em `aguardando_consentimento`, fotografia vazia, zero chamadas externas (verificado em `eventos_tecnicos`).
- **B — Local Estrita com "Apenas esta execução":** fotografia recebe apenas as categorias marcadas; `consentimentos` continua sem linhas novas; `chats.modo_privacidade` continua `local_estrita`; a chamada real do papel ocorre; reload preserva a fotografia; nova execução nasce sem herdar a autorização.
- **C — Híbrido Autorizado:** autorizações de chat/conta continuam entrando na fotografia com `origem = 'sistema'`; chamada real ocorre; origem registrada corretamente.

Depois dos três cenários: smoke tests reais por papel (Gatekeeper/psicologia/auditor na OpenAI, especialistas e correção na Anthropic) e então a matriz 1–13 completa.

## Detalhes técnicos

- Migração nova com a função `autorizar_execucao`; `fotografias_consentimento` permanece append-only (nenhuma policy de INSERT direto é aberta).
- Evidência de cada cenário coletada por consulta SQL às tabelas `execucao_fotografias`, `fotografias_consentimento`, `consentimentos`, `eventos_tecnicos` e por execução real na aplicação.
