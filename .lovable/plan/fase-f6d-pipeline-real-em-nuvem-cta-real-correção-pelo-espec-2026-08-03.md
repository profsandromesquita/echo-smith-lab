# Fase F6D — Pipeline real em nuvem: CTA real, correção pelo especialista de origem e paralelismo controlado

Escopo exclusivo da F6D. Gatekeeper, Analista e Auditor permanecem na OpenAI; Hook Master, Headline Architect e agora CTA Specialist na Anthropic. Llama, adaptação local, validação de preservação e memória adaptativa continuam simulados.

## 1. Arquitetura do CTA Specialist
Reutiliza o adaptador Anthropic já existente (`anthropic-direct.server.ts`) e o runner comum dos especialistas. Nenhum novo adaptador de provedor.
- Novo `src/lib/agentes/cta-specialist.server.ts`: instruções fixas, schema próprio e validação estrita.
- Responsabilidade: CTAs coerentes com objetivo, formato, nível de consciência, estágio da mensagem e diretriz psicológica; Voz de Marca só quando autorizada; variar intensidade e mecanismo; sem urgência falsa, promessa não sustentada ou clichê; não repetir hooks/headlines; não auditar nem pontuar.
- Structured Outputs no envio, seguido de revalidação local estrita (Zod). Sem reparo manual de JSON. Uma única rechamada controlada quando a saída violar o schema.

## 2. Contratos de entrada e saída
**Identidade e metadados de controle são do servidor.** O modelo nunca cria nem decide identificador persistente, execução, etapa, lote, papel, versão do Registry, timestamps, estado ou número de correção.

Saída do CTA (somente conteúdo criativo e campos semânticos permitidos) — exatamente 5 itens com: `texto`, `tipo_acao`, `intensidade`, `intencao`, `formato_destino`, `alerta_promessa`, `alerta_cliche`, `justificativa`. Validação: 5 itens, sem campos extras, texto não vazio, enums fechados, sem duplicata literal, sem nota de auditoria inventada. O servidor gera e persiste o identificador único da variação, a execução, a etapa, o lote, o papel de origem, a versão do Registry, os timestamps e o estado, associando por posição no lote — nunca por id vindo do modelo.

Entrada da correção usa um índice local efêmero do lote (`item_1..item_n`), traduzido no servidor para o id real. Nenhum id persistente é exposto ao modelo.

Entrada da correção (envelope fechado): briefing estruturado, diretriz psicológica, formato, objetivo, restrições, resumo de Voz de Marca quando autorizado, variação original, motivo curto da reprovação, instrução de correção do Auditor, alertas relevantes e a ordem explícita de corrigir apenas o defeito apontado. Nunca: raciocínio do Auditor, outras variações, histórico do chat, exemplos locais, preferências inferidas, memória adaptativa, prompts internos ou credenciais.

Saída da correção: o modelo devolve somente o texto corrigido e os campos criativos permitidos, referenciando o índice local. O servidor controla vínculo com o item original, execução de origem, papel, formato, versão do especialista, lote, `correcao_num = 1`, estado e vínculo com as auditorias. Índice desconhecido, tentativa de trocar papel/tipo/formato/execução ou de indicar outro registro é rejeitada; a resposta do modelo nunca determina qual linha será atualizada. Bloqueios adicionais: correção sem original, duplicidade, persistência parcial ou fora do schema.

## 3. Correção pelo especialista de origem
Nenhum corretor genérico. Novo orquestrador `src/lib/agentes/correcao-etapa.server.ts` sem criatividade própria: identifica o papel de origem (hook → Hook Master, headline → Headline Architect, cta → CTA Specialist), recupera a versão do Registry congelada na fotografia da execução, monta a entrada autorizada, pede uma única correção, valida, persiste o vínculo original↔correção e encaminha à segunda auditoria. O original nunca é apagado nem substituído no histórico. Segunda correção é impossível por constraint no banco.

## 4. Nova auditoria após a correção
Etapa `auditoria_final` com o mesmo contrato do Auditor, marcada como reavaliação única: verifica se o defeito foi resolvido e reavalia todos os critérios. Aprovado segue ao ranking; reprovado fica fora da curadoria; falha técnica impede promoção. Sem terceira geração, sem segunda correção, sem loop. O item reprovado permanece no histórico técnico com original, primeira auditoria, correção, auditoria final e motivo de exclusão.

## 5. Paralelismo e dependências
Hoje `criar_execucao` encadeia as etapas linearmente e `reservar_etapa` devolve uma etapa por chamada. A F6D troca isso por grafo de dependências:
```text
gatekeeper -> analise_psicologica -> [hook_master | headline_architect | cta_specialist]
   -> auditor -> correcao -> auditoria_final -> adaptador_local -> validador_preservacao -> ranking -> consolidador
```
**Autoridade do grafo é do servidor.** O cliente é apenas gatilho de disparo: nunca decide elegibilidade, satisfação de dependência, abertura da barreira, autorização de auditoria ou correção, retries ou estado final. Tudo isso é calculado e persistido no banco.
- Dependências modeladas em dois tipos: `exige_sucesso` (conclusão bem-sucedida obrigatória) e `exige_terminal` (basta estado terminal: concluída, falhou, cancelada ou incerto resolvido).
- `reservar_etapas(_execucao_id, _limite)` devolve N etapas elegíveis com leases independentes, respeitando `for update skip locked`, limite de concorrência por conta e por provedor e a concorrência configurada no Registry.
- Barreira do Auditor no servidor: todos os especialistas solicitados em estado terminal, ao menos um lote válido; especialistas falhos não bloqueiam lotes válidos; nenhum especialista em execução, aguardando retry ou em resultado incerto é ignorado silenciosamente — enquanto houver algum nesse estado a barreira permanece fechada.
- Cliente dispara os ramos em paralelo com `Promise.allSettled`; idempotência por etapa, lote e tentativa preservada. Fechar ou recarregar o navegador não corrompe o pipeline: ao voltar, o cliente consulta o servidor e continua apenas as etapas elegíveis, inclusive a partir de outro cliente autenticado na mesma conta.
- Etapas dependentes nunca paralelizam.

**Política de início da auditoria — comparação**
- *Barreira (aguardar todos os especialistas solicitados)*: mais simples, um único ponto de custo e cancelamento, lotes por formato já independentes dentro da etapa, falha parcial preservada pelo mecanismo de lotes existente. Latência levemente maior no pacote completo.
- *Auditoria progressiva por lote*: menor latência percebida, porém multiplica leases, complica orçamento agregado, cancelamento e reconciliação de resultado incerto.

**Recomendação: barreira**, mantendo os lotes por formato dentro da etapa do Auditor. Preserva melhor simplicidade, custo, cancelamento e falha parcial, sem perder a independência de lote validada na F6C.

## 6. Consentimentos entre provedores
Categorias: `briefing`, `resumo_voz_marca`, `variacoes_para_auditoria` (existentes) e nova `feedback_para_correcao` (feedback da OpenAI e variação original enviados à Anthropic para correção). Novo termo vigente com texto explícito sobre o trajeto dos dados. A fotografia da execução deixa claro cada fluxo: briefing → OpenAI, briefing → Anthropic, diretriz psicológica (OpenAI) → Anthropic, variações (Anthropic) → OpenAI, feedback (OpenAI) → Anthropic, Voz de Marca por provedor. Antes de qualquer correção externa o servidor revalida a autorização; sem ela a etapa falha com `autorizacao_ausente`, sem fallback silencioso.

Memória Local Estrita: o briefing explicitamente autorizado continua podendo sair; exemplos locais, preferências inferidas, favoritos, edições locais, few-shot dinâmico e conteúdo do IndexedDB continuam proibidos de sair do dispositivo. A F6D não implementa armazenamento nem recuperação local para adaptação.

## 7. Máquina de estados e falhas parciais
Novas etapas: `cta_specialist` (real), `correcao`, `auditoria_final`. Regras:
- **concluida**: todos os formatos solicitados com resultado útil e pelo menos três itens aprovados para entrega.
- **parcialmente_concluida**: algum formato ou lote sem resultado válido, ou menos de três itens aprovados, mas com conteúdo útil.
- **falhou**: nenhum resultado útil pode ser entregue.
- **aguardando_consentimento**: autorização obrigatória ausente.
- **resultado_incerto**: chamada externa sem desfecho local confirmado; sem repetição automática, resolução manual explícita, item bloqueado no ranking.
- Falha de um especialista nunca apaga resultados dos outros; correção e auditoria final persistem por item ou lote, e a falha de uma correção não apaga correções válidas; nenhum item sem auditoria válida entra no ranking.

## 8. Cancelamento
Cancelamento impede novas reservas, aborta chamadas em andamento via `AbortSignal` em todos os ramos ativos, descarta respostas tardias, bloqueia início de correção e de segunda auditoria, preserva o já concluído no histórico técnico e não promove nada após o cancelamento. A interface não promete que o provedor pare de processar ou cobrar.

## 9. Resultado incerto
Controlado por etapa, lote e tentativa. Chave de idempotência preservada, sem repetição automática, sem duplicata, com resolução explícita pelo usuário, estado seguro na interface e bloqueio do item no ranking. Uma etapa incerta não apaga etapas concluídas.

## 10. Orçamento e custos
Verificação autoritativa e **atômica no servidor**. Antes de qualquer chamada real: calcular a reserva máxima da chamada, reservá-la em transação (`for update` na linha de orçamento da execução), impedir que chamadas paralelas consumam o mesmo saldo e vincular a reserva a execução, etapa, lote e tentativa. Depois da chamada: reconciliar reserva com custo real, liberar o não utilizado, registrar excedente técnico e bloquear novas chamadas ao atingir o teto. Em timeout ou resultado incerto a reserva **não** é liberada automaticamente — só com resolução explícita ou reconciliação segura.

Camadas orçamentárias separadas: geração inicial, CTA, primeira auditoria, correção, segunda auditoria e retries autorizados, sobre `orcamento_estimado` por papel, orçamento por etapa e teto por execução.

Sem saldo para corrigir todos os reprovados, a seleção é determinística: 1) maior nota total na primeira auditoria; 2) maior confiança da avaliação; 3) prioridade do formato solicitado; 4) ordem de criação como desempate. Itens não corrigidos por limite de orçamento são registrados com esse motivo e ficam fora da curadoria. Esgotado o orçamento: nenhuma chamada nova, resultados preservados, motivo informado, conclusão parcial quando houver conteúdo utilizável, sem fallback silencioso. Custo registrado por provedor, papel, etapa, lote, tentativa, correção e total da execução.

## 11. Registry
- Versão independente e publicável para `cta_specialist` (provedor, modelo, instruções, esforço, schema, limites, timeout, tentativas, concorrência, orçamento, parâmetros permitidos) com teste administrativo próprio.
- `registry_validar` passa a aceitar `cta_specialist` no provedor Anthropic com `claude-fable-5`.
- Política de correção versionada e vinculada à execução: correção pelo especialista de origem, máximo de uma, versão congelada no início da execução, campos de feedback enviados, limites de resposta, timeout, tentativas, orçamento adicional e comportamento em recusa, truncamento e resultado incerto. Nenhuma credencial no Registry.

## 12. Ranking e curadoria
Determinístico. Entram apenas itens com saída válida, auditoria válida, aprovados, não cancelados, não incertos, não substituídos por correção e dentro da política de uma correção. Existindo correção aprovada, só ela concorre; a original fica no histórico e não conta como segunda variação. Entrega dos três melhores; com menos de três, entrega parcial explícita, sem inventar conteúdo.

## 13. Observabilidade
Apenas metadados seguros: execução, etapa, lote, papel, provedor, modelo, versão, esforço, tentativa, correção, duração, tokens, custo, stop reason, código de erro, estado final e indicação de parcial. Nunca briefing, variações, feedback, Voz de Marca, prompts internos, respostas completas, dados pessoais, credenciais ou cabeçalhos.

## 14. Interface
Workspace preservado, sem redesenho. Novos rótulos de progresso (gerando hooks/headlines/CTAs, especialistas em paralelo, auditando, corrigindo variação, reavaliando correção, entrega parcial, autorização necessária, limite de orçamento, falha temporária, recusa, cancelado, resultado incerto) e, na curadoria, visualização de original, motivo da reprovação, versão corrigida, decisão final e status fora da curadoria. Nada de cadeia de pensamento, prompts, payloads, headers, credenciais ou stack traces.

## 15. Arquivos, funções e migrações afetados
Novos: `src/lib/agentes/cta-specialist.server.ts`, `cta-teste.server.ts`, `correcao-etapa.server.ts`, `correcao-teste.server.ts`.
Alterados: `especialista-base.server.ts` e `especialista-etapa.server.ts` (rota do CTA e modo correção), `openai-etapa.server.ts` (auditoria final), `execucao.functions.ts` (roteamento, paralelismo, orçamento, cancelamento), `execucao.ts`, `ranking.ts`, `adaptadores-simulados.ts` (remoção do CTA simulado), `registry.functions.ts`, `EditorVersao.tsx`, `PainelExecucao.tsx`, `CuradoriaExecucao.tsx`, `LinhaDoTempoPipeline.tsx`, `ModalConsentimento.tsx`, `consentimento.functions.ts`.
Migrações: categoria e termo `feedback_para_correcao`; grafo de dependências tipadas (`exige_sucesso` / `exige_terminal`) em `criar_execucao` com etapas `correcao` e `auditoria_final`; função de barreira do Auditor no servidor; `reservar_etapas` com limite de concorrência; vínculo original↔correção em `execucao_resultados` com unicidade de uma correção por item e ids gerados no servidor; tabela de reservas de orçamento com reserva/reconciliação atômicas por execução, etapa, lote e tentativa; `registry_validar` para CTA.

## 16. Checkpoints de implementação
1. Contrato e schema do CTA. 2. Versão de Registry + teste administrativo do CTA. 3. CTA real isolado. 4. Validação do CTA em execução real. 5. Política versionada de correção. 6. Correção real de Hook. 7. Segunda auditoria e bloqueio de segunda correção. 8. Correção de Headline. 9. Correção de CTA. 10. Paralelismo controlado. 11. Falhas parciais e cancelamento em paralelo. 12. Orçamento agregado. 13. Pipeline completo. 14. Regressão F1–F6C. 15. Build, tipos, preview e console.
Cada checkpoint é validado antes do seguinte; nada é entregue em bloco único.

## 17. Riscos
Grafo de dependências pode duplicar reservas se o lease não for atômico (mitigado por `skip locked` e unicidade por etapa); paralelismo pode estourar rate limit (mitigado por limite de concorrência por provedor); correção pode virar loop (mitigada por constraint de uma correção); custo pode crescer (mitigado por reservas e teto por execução); resposta tardia após cancelamento (descartada por verificação de lease).

## 18. Critérios de aceite
CTA real na Anthropic; três especialistas em paralelo com segurança; correção pelo especialista de origem; no máximo uma correção por item; reauditoria obrigatória; reprovados finais fora da curadoria; originais no histórico; consentimentos entre provedores revalidados no servidor; orçamento esgotado bloqueia novas chamadas; cancelamento alcança todos os ramos; resultado incerto sem duplicatas; ranking determinístico; só aprovados na entrega; Gatekeeper/Analista/Auditor na OpenAI e Hook/Headline/CTA na Anthropic; adaptação local, validação de preservação e Llama simulados; regressão F1–F6C aprovada; build, tipos, preview e console limpos.

## 19. Testes
CTA isolado e contagem exata de cinco; Hook isolado; Headline isolada; especialistas em paralelo; pacote completo; formatos parciais; um especialista falhando; dois concluindo; todos falhando; recusa de provedor; rate limit; timeout; resposta inválida; saída truncada; cancelamento durante paralelismo; resposta tardia; resultado incerto em um ramo; retomada após reload; prevenção de duplicatas; correção de Hook, Headline e CTA; bloqueio de segunda correção; nova auditoria; reprovação final; aprovação após correção; original fora do ranking e corrigido dentro; consentimento ausente; autorização parcial entre provedores; Voz de Marca autorizada e não autorizada; orçamento suficiente e esgotado antes da correção; custo agregado; isolamento entre contas; testes administrativos sintéticos (sem dados reais, sem consentimento falso, sem execução de usuário, sem publicação automática, sem alterar versão publicada); nenhuma chamada ao Llama; regressão F1–F6C; build, tipos, preview e console.

Validações adicionais obrigatórias: modelo tentando devolver identificador de outra execução; modelo tentando alterar papel ou formato; fechamento do navegador durante o paralelismo; retomada por outro cliente autenticado na mesma conta; especialista falho com outros concluídos; especialista em retry impedindo abertura prematura da barreira; duas reservas simultâneas disputando o mesmo orçamento; três especialistas tentando iniciar com saldo insuficiente; reconciliação entre custo reservado e custo real; reserva mantida em resultado incerto; orçamento suficiente para corrigir apenas parte dos itens; seleção determinística dos itens corrigidos; menos de três aprovados gerando entrega parcial; nenhum resultado útil gerando execução falha.

## 20. Fora do escopo
Llama 3.2, WebLLM, WebGPU, download local de modelo, IndexedDB/OPFS para IA, adaptação local real, memória adaptativa, few-shot dinâmico, RAG, embeddings, corpus das 1.000 headlines, treinamento, fine-tuning, pagamentos, colaboração, novos papéis e redesenho amplo. Confirmado: Llama, adaptação local e memória adaptativa permanecem fora da F6D.