# Correção mínima: "Apenas esta execução" em Memória Local Estrita

## Resultado da investigação

Confirmado por leitura de código e do banco (`criar_execucao`, `desbloquear_etapas`, `consentimento.functions.ts`, `execucao.functions.ts`, `ModalConsentimento.tsx`, `PainelExecucao.tsx`):

| # | Hipótese | Veredito | Evidência |
|---|---|---|---|
| 1 | O botão não grava a autorização | **Confirmado** | `montarFotografiaSimulada` devolve `persistida: false, motivo: "sem_execucao_real"` e não escreve nada |
| 2 | Grava em outro lugar, fora da fotografia | **Não** | Nenhuma escrita acontece nesse caminho |
| 3 | A fotografia é criada antes da seleção e nunca atualizada | **Confirmado** | `criar_execucao` cria a fotografia e insere as permissões na mesma transação; não existe função para acrescentar permissões depois. `PainelExecucao` chama `criarExecucao` sempre com `permissoesUnicas: []` |
| 4 | Local Estrita bloqueia indevidamente qualquer categoria de nuvem | **Confirmado no cliente** | `BLOQUEADAS_EM_LOCAL_ESTRITA` cobre categorias que são apenas processamento em nuvem, não memória privada local |
| 5 | Divergência interface x servidor | **Confirmado** | O servidor não aplica restrição por modo; a regra existe só na UI, e a UI não persiste nada |

Causa raiz: falta um caminho de autorização por execução. A fotografia só recebe permissões no instante da criação.

Fato adicional levantado no banco: as etapas com `categoria_requerida` são `briefing` (gatekeeper, psicologia, especialistas, auditor), `variacoes_para_auditoria` (auditor, auditoria final) e `feedback_para_correcao` (correção). `resumo_voz_marca` não bloqueia etapa nenhuma — é enriquecimento opcional lido em tempo de execução pelos especialistas.

## Correção mínima

### 1. Autoridade integral do servidor

Nova função de banco `autorizar_execucao(_execucao_id uuid, _categorias text[])`, `security definer`, `set search_path = public`, executável apenas por `authenticated`. O cliente envia **somente** o id da execução e as categorias marcadas. O servidor deriva tudo o mais:

- proprietário via `execucao_e_minha` (nada de `user_id` vindo do cliente);
- fotografia via `execucoes.fotografia_id`;
- para cada categoria, as etapas reais daquela execução que a exigem (`execucao_etapas.categoria_requerida`), e daí papel, etapa e finalidade canônica;
- provedor e modelo a partir da versão do Registry fixada na etapa (`registry_versao_id`), sem tocar no Registry;
- `termos_id`/`termos_versao` dos termos vigentes.

Rejeita quando: execução não é do usuário, está em estado terminal (`concluida`, `parcialmente_concluida`, `falhou`, `cancelada`), ou a categoria não corresponde a nenhuma etapa real da execução — nesse caso **nenhuma autorização órfã é gravada**. Idempotência por `(fotografia_id, categoria, provedor, etapa, finalidade)`: a permissão já existente é ignorada, sem duplicar nem alargar escopo.

`resumo_voz_marca` é o único caso sem etapa bloqueadora: só é aceito quando a execução tem ao menos uma etapa de especialista que consome voz de marca, e o vínculo é derivado dessa etapa pelo servidor.

### 2. Autorização e desbloqueio na mesma transação

A mesma função, numa transação só:

1. insere as permissões derivadas em `fotografias_consentimento` (append-only, sem abrir policy de INSERT direto);
2. reavalia as etapas `bloqueada` da execução contra a fotografia já autorizada;
3. desbloqueia somente as etapas cuja categoria está agora autorizada;
4. reavalia o estado da execução (`aguardando_consentimento` → `pronta` quando não restar etapa bloqueada);
5. registra evento técnico sem conteúdo (`registrar_evento_tecnico`, apenas papel/categoria/contagem);
6. devolve as categorias concedidas e o número de etapas desbloqueadas.

Funciona em **qualquer** execução não terminal com etapa bloqueada correspondente — inclusive pedidos de consentimento que surgem em correção e auditoria final.

**Reconciliação no reload:** ao carregar a execução, `obterExecucao` chama uma rotina idempotente de reconciliação que desbloqueia etapas já cobertas pela fotografia. Se a UI cair entre gravar e atualizar, o reload recupera o estado correto sem nova autorização.

Server function `autorizarExecucao` em `src/lib/consentimento.functions.ts` (entrada: `execucaoId` + `categorias[]`, nada mais). `montarFotografiaSimulada` deixa de ser usada quando existe execução real.

### 3. Voz de Marca explícita separada da memória privada local

Nova categoria `resumo_voz_marca_explicita`, alimentada **apenas** pelo perfil persistido da F3 (`perfis_marca` + `exemplos_marca` do próprio perfil explícito). Ela é autorizável por execução mesmo em Memória Local Estrita.

Permanecem bloqueadas em Local Estrita, sem caminho de autorização: `memoria_local_estilo`, `exemplos_locais`, `preferencias_inferidas` — cobrindo memória adaptativa, favoritos/edições, IndexedDB/OPFS e few-shot dinâmico local. Essas categorias não existem hoje no pipeline real; ficam declaradas para que a fotografia registre a origem do dado de forma explícita e para que nada local seja enviado por engano.

A fotografia passa a distinguir a origem do dado por categoria. Sem autorização de voz de marca, os especialistas seguem a regra atual: nada é inventado, nenhuma nota fabricada.

Ajustes de UI mínimos: `ModalConsentimento` recebe `execucaoId`, envia só categorias selecionadas, e sua lista de bloqueio em Local Estrita passa a conter só as categorias de memória privada local. `PainelExecucao` passa a execução e deixa de disparar `desbloquearEtapas` separadamente.

Sem mudança no Registry, nos adaptadores de provedor ou no roteamento real já corrigido.

## Validação

- **A — Local Estrita sem autorizar:** execução em `aguardando_consentimento`, fotografia vazia, zero linhas em `eventos_tecnicos` de chamada externa.
- **B — Local Estrita com "Apenas esta execução":** só as categorias marcadas entram na fotografia; provedor/etapa/finalidade/termos derivados no servidor; etapas desbloqueadas na mesma operação; chamada real ocorre; `consentimentos` sem linhas novas; `chats.modo_privacidade` inalterado; reload preserva; nova execução não herda.
- **C — Voz de Marca:** resumo explícito persistido autorizável; memória local e preferências inferidas recusadas pelo servidor; sem autorização, nenhum dado inventado.
- **D — Falha entre autorização e UI:** simular queda após o commit; reload reconcilia e a execução não fica presa.
- **E — Segurança:** categoria/etapa/provedor fora da execução rejeitados; conta B (JWT real) não autoriza execução da conta A; sem órfãs nem duplicatas (checagem SQL na fotografia).
- **F — Híbrido Autorizado:** consentimentos persistentes continuam entrando com `origem = 'sistema'`; sem regressão.

Depois dos seis cenários: smoke tests reais por papel (OpenAI: gatekeeper, psicologia, auditor; Anthropic: especialistas e correção) e então a matriz 1–13.

## Detalhes técnicos

- Uma migração: função `autorizar_execucao`, função de reconciliação idempotente, e ampliação do enum/CHECK de categorias com `resumo_voz_marca_explicita`, `memoria_local_estilo`, `exemplos_locais`, `preferencias_inferidas` + linhas correspondentes em `termos_consentimento`.
- `fotografias_consentimento` e `consentimentos_historico` continuam append-only.
- Evidências coletadas por SQL em `execucao_fotografias`, `fotografias_consentimento`, `consentimentos`, `execucao_etapas`, `eventos_tecnicos` e por execução real na aplicação com JWTs reais.
