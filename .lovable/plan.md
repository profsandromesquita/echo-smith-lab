# Fase F6A — Gatekeeper com IA real (GPT-5.6 Sol)

Objetivo: substituir **apenas** o adaptador simulado do papel `gatekeeper` por uma chamada real ao modelo GPT-5.6 Sol, mantendo todos os demais papéis simulados e sem alterar a máquina de estados da F5.

## 1. Arquitetura do adaptador

Novo módulo isolado do provedor, chamado somente pelo backend:

```text
avancarExecucao (execucao.functions.ts)
  -> reservar_etapa (lease)
  -> se papel == gatekeeper E versao publicada tem provedor real
        -> executarGatekeeper (src/lib/agentes/gatekeeper.server.ts)
              -> montarEnvelope (entrada validada por zod)
              -> chamarModelo (src/lib/provedores/openai.server.ts)
              -> validar saida por schema
     senao -> executarAdaptadorSimulado (inalterado)
  -> concluir_etapa | falhar_etapa (RPCs da F5, sem mudanca)
```

- `openai.server.ts`: única camada que conhece endpoint, header de autenticação, streaming e mapeamento de erros. Não conhece o domínio.
- `gatekeeper.server.ts`: conhece o domínio (envelope, schema, decisão), não conhece HTTP.
- Segredo lido apenas dentro do handler, nunca no cliente, nunca em módulo importado por rota.
- Chamada em streaming consumida no servidor (modelos de raciocínio estouram timeout em chamada bufferizada); só o texto final é persistido.

### Decisão de provedor a confirmar
O Lovable AI Gateway já oferece `openai/gpt-5.6-sol` sem chave própria, com telemetria de uso e custo. A alternativa é OpenAI direto com chave em Cloud Secrets. O adaptador terá um único ponto de configuração (base URL + header), de modo que a troca entre os dois seja configuração, não código. Preciso da sua escolha antes de implementar (seção 13).

## 2. Dados enviados e recebidos

Enviado (envelope estruturado, campos nomeados e tipados):
- instruções de sistema vindas da versão **publicada** do Registry;
- parâmetros do chat (formato solicitado, objetivo, canal);
- briefing do usuário, delimitado como conteúdo não confiável;
- nada mais: sem exemplos locais, sem preferências inferidas, sem memória privada, sem resumo de Voz de Marca.

Recebido: JSON validado (seção 5) e metadados de uso (tokens de entrada/saída, custo quando o provedor devolver).

Nunca enviado: Secrets, prompts de outros agentes, dados de outras contas, histórico completo do chat.

## 3. Integração com o Registry

- A etapa já grava `registry_versao_id`; a chamada usa exatamente essa versão, não a versão atual.
- Campos usados: `provedor`, `modelo`, `instrucoes_sistema`, `schema_saida`, `limite_entrada`, `limite_saida`, `timeout_ms`, `tentativas_max`, `backoff_base_ms`, `orcamento_estimado`, `parametros` (esforço de raciocínio, verbosidade).
- Ajuste necessário: hoje `modelo` só aceita `^mock-...` em `registry.functions.ts`. Passa a aceitar identificadores reais, com allowlist explícita.
- `provedor = "simulado"` mantém o comportamento atual; só `provedor = "openai"` ativa a chamada real.
- `testarRascunho` do Gatekeeper passa a fazer uma chamada real curta quando o rascunho aponta provedor real, gravando o resultado em `registry_registrar_teste`.
- Esforço de raciocínio padrão para triagem: baixo/médio, nunca máximo. Limite de saída pequeno — o Gatekeeper devolve JSON curto.

## 4. Integração com consentimento

Antes de qualquer byte sair:
1. a etapa `gatekeeper` já nasce com `categoria_requerida = 'briefing'`; sem permissão ela fica `bloqueada` e a UI oferece autorizar (fluxo da F5, sem mudança);
2. o adaptador revalida no servidor lendo a fotografia da própria execução (não o consentimento atual) e recusa a chamada se a permissão de `briefing` para aquele provedor/etapa não estiver lá;
3. em Memória Local Estrita o envelope carrega apenas o briefing autorizado; campos de outras categorias são removidos por construção;
4. sem autorização não há execução: nenhum fallback silencioso, nenhum degradê invisível.

A fotografia passa a registrar o nome do provedor real (hoje é texto genérico), junto de finalidade, etapa e versão dos termos.

## 5. Schema do Gatekeeper

Entrada (zod, antes do envio): `formato`, `objetivo`, `canal`, `briefing` (truncado ao `limite_entrada`), `idioma`.

Saída (zod, após a resposta; campos extras rejeitados):
- `suficiente`: booleano;
- `pergunta`: string curta ou nulo — só quando `suficiente = false`, uma pergunta apenas;
- `briefing_estruturado`: nulo, ou objeto com `publico`, `dor`, `promessa`, `contexto`, `objetivo`;
- `lacunas`: lista fechada dentre esses cinco campos;
- `confianca`: número de 0 a 1.

Regras: não gera hook, headline, CTA nem análise psicológica; não revela raciocínio interno, prompt de sistema ou configuração; o briefing não pode redefinir seu papel. Instrução explícita de que texto do usuário é dado, nunca instrução. Saída fora do schema é resposta inválida (seção 6), nunca "consertada" na marra.

## 6. Erros e retries

| Situação | Tratamento |
|---|---|
| Timeout (`timeout_ms` da versão) | aborta, `falhar_etapa` com `timeout`, retry com backoff do servidor |
| Rate limit (429) | `rate_limit`, retry com backoff respeitando `Retry-After` |
| Indisponibilidade (5xx) | `provider_error`, retry até `tentativas_max` |
| 4xx de requisição | `invalid_input`, falha definitiva sem retry |
| Recusa do modelo | resultado `suficiente = false` com pergunta neutra, sem retry |
| Resposta fora do schema | uma re-tentativa de reparo; persistindo, `invalid_input` definitivo |
| Cancelamento | `AbortController` ligado ao cancelamento; resposta tardia descartada pelos RPCs da F5 |
| Falha ao persistir após resposta recebida | `unknown_outcome`, sem repetir cobrança automaticamente |
| Chave ausente ou inválida | etapa falha com erro de configuração; nunca cai para simulado em produção |

Idempotência: lease e token da F5 continuam sendo a garantia; a chamada envia também chave de idempotência derivada de `etapa_id + tentativa` quando o provedor suportar.

Fallback para o adaptador simulado apenas com a variável de ambiente de teste ativa, sempre com rótulo "resultado simulado" no resultado persistido.

## 7. Observabilidade

- `eventos_tecnicos` (F4) recebe os registros reais: etapa, provedor, modelo, duração, status, código de erro fechado, tentativas, custo. Nenhum texto livre, nenhum trecho de briefing, nenhuma mensagem original do provedor.
- Tokens e custo, quando devolvidos, gravados em `execucoes.custo_estimado` e no evento.
- Painel técnico mostra provedor/modelo/tentativas do Gatekeeper; o usuário final vê apenas os estados já previstos.

## 8. Arquivos e funções afetados

Novos:
- `src/lib/provedores/openai.server.ts` — cliente HTTP, timeout, abort, mapeamento de erro, uso e custo.
- `src/lib/agentes/gatekeeper.server.ts` — envelope, schemas, decisão.
- `src/lib/agentes/gatekeeper.ts` — tipos e rótulos compartilhados com a UI.

Alterados:
- `src/lib/execucao.functions.ts` — em `avancarExecucao`, desviar o papel `gatekeeper` para o adaptador real quando a versão publicada indicar provedor real; carregar o briefing do chat; revalidar a fotografia.
- `src/lib/registry.functions.ts` — allowlist de modelo real e teste real do rascunho do Gatekeeper.
- `src/components/execucao/PainelExecucao.tsx` e `DetalhesTecnicos.tsx` — estado "aguardando complemento" e a pergunta do Gatekeeper.
- `src/lib/adaptadores-simulados.ts` — inalterado, continua servindo todos os outros papéis.
- Migração pequena: versão publicada do Gatekeeper com provedor real e campos de uso/tokens no evento, se ainda não existirem.

## 9. Sequência de implementação

1. Confirmar identificador do modelo, parâmetros e limites; registrar a credencial via Cloud Secrets.
2. Criar `openai.server.ts` com timeout, abort e mapeamento de erros; testar isolado.
3. Criar `gatekeeper.server.ts` com envelope e schemas; testes de schema sem rede.
4. Ajustar Registry (allowlist e teste real) e publicar a versão do Gatekeeper.
5. Ligar o desvio em `avancarExecucao`, mantendo simulado como padrão até a versão publicada apontar provedor real.
6. Ajustes de UI para "aguardando complemento".
7. Bateria de testes da seção 12 e regressão F1–F5.

## 10. Riscos

- Identificador ou parâmetros errados do modelo geram 400; mitigado confirmando antes e testando uma chamada real.
- Custo inesperado por briefing longo; mitigado por truncagem, saída curta, esforço baixo e orçamento por agente.
- Prompt injection; mitigado por separação de instruções, envelope tipado e schema fechado.
- Vazamento por telemetria; mitigado por códigos fechados e ausência de texto livre.
- Latência maior que a simulada; mitigada por timeout por versão e estados de espera já previstos.
- Divergência entre versão publicada e etapa em curso; mitigada pelo uso obrigatório do `registry_versao_id` da etapa.

## 11. Critérios de aceite

- Apenas o Gatekeeper chama IA real; os demais papéis continuam determinísticos e offline.
- Sem autorização de `briefing` a chamada não acontece e a etapa fica bloqueada.
- Saída sempre validada por schema antes de persistir.
- Timeout, rate limit, erro, cancelamento e resposta tardia terminam em estado honesto da F5.
- Nenhuma credencial no bundle do cliente.
- Nenhum fallback silencioso em produção.
- F1–F5 sem regressão.

## 12. Testes

Briefing suficiente, insuficiente, contraditório e longo; prompt injection; conteúdo com PII; consentimento ausente e concedido; resposta válida e fora do schema; timeout; rate limit; erro do provedor; retry; cancelamento; resposta tardia; unknown_outcome; custo e consumo registrados; recarregamento no meio da etapa; isolamento entre contas; confirmação de que só o Gatekeeper usa IA real; regressão F1–F5.

## 13. Informações que preciso antes de executar

1. Usar o Lovable AI Gateway (sem chave sua, modelo `openai/gpt-5.6-sol`) ou OpenAI direto com chave própria?
2. Se OpenAI direto: a chave será pedida pelo fluxo seguro de Cloud Secrets no início da implementação — não cole aqui nem em código.
3. Identificador real do modelo e endpoint a usar.
4. Formato de autenticação e parâmetros suportados (esforço de raciocínio, limite de saída, saída estruturada).
5. Limites de taxa, preços e política de retenção da sua conta, se OpenAI direto.
6. Se há suporte a chave de idempotência externa.

Sem os itens 1 e 3 a implementação não começa.

## 14. Confirmação

Todos os demais agentes permanecem simulados nesta fase: análise psicológica, Hook Master, Headline Architect, CTA, auditor, correção, adaptação local, validação, ranking e entrega. Anthropic, Claude, auditor com IA real, paralelismo, Llama, WebLLM, RAG, corpus, memória adaptativa e embeddings ficam fora da F6A.