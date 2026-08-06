# Bloco 6 — caminho positivo da Voz de Marca no Auditor, depois blocos 2 e 12

## O que a investigação já mostrou

Duas causas distintas, ambas confirmadas por leitura de código e consulta ao banco.

**1. Divergência real de resolução de perfil (defeito de produto).**
Os especialistas resolvem o perfil na ordem correta: override do chat, depois perfil da pasta, depois perfil padrão da conta. O Auditor não faz isso — ele consulta apenas o perfil marcado como padrão da conta e nem recebe o identificador do chat. Em qualquer conta com override de chat ou perfil de pasta, o Auditor lê um perfil diferente do que os especialistas leram, ou nenhum.

**2. Artefato do harness na rodada anterior (não é defeito).**
Os quatro perfis criados pelo harness foram gravados só com nome: tom de voz e posicionamento com zero caracteres. Sem conteúdo avaliável, `voz_marca_avaliavel = false` foi a resposta correta do Auditor, inclusive no cenário "ambos". A evidência anterior, portanto, não provava o defeito que parecia provar — o defeito real é o item 1.

Sobre os demais pontos pedidos: a checagem de autorização do Auditor não filtra por etapa nem por finalidade, só por categoria e provedor canônico, então `auditor` e `auditoria_final` compartilham a mesma autorização e não há divergência de nomenclatura entre `resumo_voz_marca` e `resumo_voz_marca_explicita` — as duas são aceitas. O corpo enviado ao Auditor já carrega `voz_de_marca_autorizada` explicitamente, derivado da presença do perfil. Isso será reconfirmado com registro rastreável durante a validação.

## Correção mínima

Extrair a resolução de perfil que hoje vive dentro da montagem do especialista para uma função compartilhada, e passar a usá-la também no Auditor, que passará a receber o identificador do chat da execução. Nada muda na arquitetura de consentimento: a autorização por provedor canônico continua sendo a porta de entrada, e o perfil só é lido quando ela concede.

## Validação do bloco 6

Harness reconstruído com perfil de marca real preenchido (tom de voz e posicionamento com conteúdo), override de chat apontando para um segundo perfil, para provar a resolução.

Quatro execuções reais, formato hook, em Híbrido Autorizado:

- **OpenAI-only** — Auditor com `voz_marca_avaliavel = true` e nota válida; especialistas Anthropic sem Voz de Marca.
- **Anthropic-only** — especialistas com o resumo; Auditor com `false` e nota nula.
- **Ambos** — os dois recebem; fotografia mantém as autorizações separadas por provedor.
- **Nenhum** — ninguém recebe; `false`, nota nula, fator neutralizado no ranking.

Registro só de identificadores, origem do perfil resolvido, categoria, provedor, etapa, finalidade e flags booleanas. Nenhum trecho do conteúdo da Voz de Marca aparece no relatório.

## Bloco 2 — fechamento para Hook e Headline

Duas execuções com reprovação do auditor provocada por pré-condição controlada, uma para Hook e uma para Headline. Verificar que a correção volta ao especialista de origem, reusa a versão do Registry da geração original, preserva o texto original no histórico e passa pela segunda auditoria. Em seguida, tentativa de segunda correção do mesmo item, que deve ser recusada pelo servidor.

## Bloco 12 — regressão e saúde

Fluxos F1 a F6C: autenticação, pastas, chats, perfis de marca, privacidade e Registry. Typecheck, build, preview carregando sem erro de console, e varredura do bundle cliente em busca de credenciais.

## Entrega

Resultado do bloco 6 com as quatro validações, resultado do bloco 2, resultado do bloco 12, correções mínimas aplicadas, matriz consolidada 1 a 13 e o veredito definitivo da F6D. Blocos já aprovados não são reabertos.

## Detalhes técnicos

Nova função exportada em `src/lib/agentes/especialista-etapa.server.ts` (ou módulo irmão) com a cadeia chat → pasta → padrão, consumida por `montarEntradaEspecialista` e por `executarEtapaAuditor` em `src/lib/agentes/openai-etapa.server.ts`. O chamador em `src/lib/execucao.functions.ts` passa a repassar `chatId` para a etapa de auditoria e de auditoria final. As execuções do bloco 6 e do bloco 2 envolvem chamadas pagas reais à OpenAI e à Anthropic.