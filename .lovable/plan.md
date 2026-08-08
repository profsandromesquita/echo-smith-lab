# Etapa 2 — Personalização progressiva a partir do feedback

Aproveita integralmente a Etapa 1. Sem fine-tuning, sem embeddings, sem banco vetorial, sem alterar Registry, ranking ou máquina de estados.

## 1. Diagnóstico da arquitetura existente

Caminho real hoje (verificado no código):

```text
avancarExecucao (src/lib/execucao.functions.ts)
  -> categoriaAutorizada / vozDeMarcaAutorizada  (fotografia de consentimento, por provedor canônico)
  -> lerConfiguracaoEspecialista (Registry: instrucoesSistema, modelo, limites)
  -> montarEntradaEspecialista (briefing + resumo do Gatekeeper + diretriz psicológica + Voz de Marca)
  -> hook-master / headline-architect / cta-specialist -> executarEspecialistaReal
       instrucoes = instrucoesPapel + REGRAS_FIXAS + instrucoesSistema (Registry)
       conteudo   = <conteudo_usuario>{JSON do corpo}</conteudo_usuario>
  -> Anthropic / OpenAI -> resultado persistido em execucao_resultados
```

Pontos exatos de montagem:
- `src/lib/agentes/especialista-base.server.ts` — monta o corpo JSON; concatena papel + regras fixas + Registry.
- `src/lib/agentes/especialista-etapa.server.ts` — `montarEntradaEspecialista` busca briefing, diretriz e Voz de Marca; `resolverPerfilDeMarca` resolve chat → pasta → padrão.
- `src/lib/agentes/openai-etapa.server.ts` — monta `ContextoAuditoria` (mesmo `resolverPerfilDeMarca`).
- `src/lib/agentes/auditor.server.ts` — `auditarLote` monta o corpo da auditoria.

Achados relevantes:
- Nenhum código de personalização, few-shot ou memória adaptativa existe hoje. Não há sistema paralelo a evitar; a extensão é aditiva.
- Os `exemplos_marca` (manuais e os de `origem = 'feedback'`) não entram em nenhum prompt.
- Já existem: `feedback_resultado`, `edicoes_resultado`, `exemplos_marca` com `origem`/`execucao_id`/`item_id`, categoria de consentimento `preferencias_inferidas` e `eventos_tecnicos`.
- `EntradaEspecialista` e `ContextoAuditoria` são os dois únicos contratos a estender.

## 2. Dados da Etapa 1 reutilizados

`feedback_resultado` (sinal, motivos, comentário), `edicoes_resultado` (original × editado), `exemplos_marca`, `perfis_marca`, consentimentos e modo de privacidade. Nada do IndexedDB entra em execução na nuvem.

## 3. Síntese de preferências (determinística, sem modelo)

Nova tabela `preferencias_inferidas`: `user_id`, `perfil_marca_id`, `formato` (nulo = escopo de marca), `papel`, `tipo` (`preferir` | `evitar`), `chave` (enum interno), `texto` (frase pt-BR de catálogo fechado), `evidencias`, `confianca`, `origem`, `ultima_evidencia_em`, `ativa`, `removida_pelo_usuario`. RLS por `auth.uid()`, GRANT para `authenticated` e `service_role`, sem `anon`, `UNIQUE (user_id, perfil_marca_id, formato, chave)`.

A síntese roda no servidor, por usuário + perfil + formato, mapeando cada evidência para uma chave fixa (ex.: motivo `longo_demais` → `evitar:prolixidade`; `generico`/`clichê` → `evitar:generico`; edição que encurta ≥20% → `preferir:concisao`; referência aprovada → `preferir:padrao_referencia`). Nenhum texto é inventado: cada frase vem de um catálogo fechado de templates e descreve a escrita, nunca a pessoa.

## 4. Confiança e peso

| Sinal | Peso |
| --- | --- |
| "Usar como referência" | 3 |
| Edição salva | 2 |
| Não gostei com motivo específico | 2 |
| Gostei | 1 |
| Não gostei sem motivo | 0,5 |

Recência: peso × 0,5 acima de 90 dias. `confianca = min(1, soma_pesos / 6)`. Entra no bloco só com `evidencias >= 2` e `confianca >= 0,4`. Vira restrição forte ("evite") apenas com `confianca >= 0,75` e origem negativa consistente; abaixo disso o texto é "tende a preferir".

## 5. Algoritmo de recuperação

1. Resolve perfil de marca (a mesma `resolverPerfilDeMarca` já usada) e formato da execução.
2. Preferências: perfil + formato exato primeiro, depois perfil com `formato` nulo. Nunca outro perfil, nunca outro formato.
3. Exemplos: edições aprovadas > `exemplos_marca` com `origem = 'feedback'` > `origem = 'manual'`, filtrados pelo perfil, ordenados por peso × recência, deduplicados por texto normalizado.
4. Descarte de conflito: preferência que contrarie `preferidas`/`evitadas`/`principios`/`orientacoes` do perfil, ou termo explícito do briefing daquela execução, é removida e contabilizada no evento técnico.

## 6. Limites por execução

Máximo 6 preferências (≈600 caracteres) e 3 exemplos (240 caracteres cada), com truncagem determinística. Nunca histórico completo.

## 7. Bloco dinâmico

Entra como campo próprio do corpo já enviado, dentro de `<conteudo_usuario>`, nunca concatenado a `instrucoesSistema`:

```text
personalizacao_aprendida: {
  versao: "p1",
  preferencias: ["Tende a preferir aberturas diretas", ...],
  evitar: ["Introduções genéricas", ...],
  exemplos_aprovados: ["...", "..."],
  observacao: "Orientação secundária: nunca sobrepõe formato, objetivo, Voz de Marca ou briefing."
}
```

As `REGRAS_FIXAS` ganham uma linha declarando essa precedência.

## 8. Hierarquia aplicada

segurança/privacidade > Registry > Voz de Marca explícita > parâmetros da execução > preferências explícitas > inferidas > exemplos. Garantida pela ordem dos campos, pelo filtro de conflito (5.4) e pelo rótulo explícito do bloco.

## 9. Agentes que recebem

Hook Master, Headline Architect e CTA Specialist recebem o bloco completo. O Auditor recebe apenas a lista de preferências, sem exemplos, como critério secundário. Gatekeeper e Análise Psicológica não recebem nada. Correção única, reauditoria, ranking e máquina de estados permanecem intocados.

## 10. OpenAI × Anthropic

Sem tratamento especial: o bloco é um campo do corpo JSON, já suportado pelos dois caminhos estruturados. A autorização continua sendo por provedor canônico, como no resto do pipeline.

## 11. Privacidade

**Local estrita**: a montagem retorna vazio antes de qualquer consulta. Nada do IndexedDB é lido no servidor, não há síntese na nuvem e não há selo. A tela informa que a memória do dispositivo não é usada em execuções na nuvem.

**Híbrido autorizado**: cada uso exige `categoriaAutorizada(fotografia, 'preferencias_inferidas', provedor)`, verificado por etapa e por provedor, como as demais categorias. Exemplos aprovados exigem também a autorização de Voz de Marca já existente. Sem autorização, o bloco é omitido inteiro e a execução segue normal. Revogação vale a partir da próxima fotografia de consentimento.

## 12. Observabilidade

Um `registrar_evento_tecnico` por etapa personalizada, tipo `personalizacao`, com versão do mecanismo, contagem de preferências e exemplos, perfil, formato e descartes por conflito — sem conteúdo. Os identificadores usados vão para `entrada_resumo` da etapa, permitindo responder depois por que aquele resultado recebeu aquela orientação.

## 13. Interface

- `PainelExecucao`: selo discreto "Personalizado com suas preferências" apenas quando o bloco foi realmente enviado em alguma etapa (lido do evento técnico). Popover com quantas preferências e referências, para qual Voz de Marca e formato. Nunca expõe prompts internos.
- `/config/preferencias`: substitui as fixtures `PREFERENCIAS_INFERIDAS` por dados reais — texto, confiança, evidências, origem, perfil e formato — com desativar e excluir. Mantém o painel de memória local e o aviso do modo local estrito.

## 14. Arquivos, tabelas e funções

Migração: `preferencias_inferidas` (+GRANT, RLS, índices).
Novos: `src/lib/personalizacao.ts` (tipos e catálogo de frases), `src/lib/personalizacao-sintese.server.ts` (pesos e síntese), `src/lib/personalizacao-contexto.server.ts` (recuperação, conflito, montagem), `src/lib/personalizacao.functions.ts` (listar/desativar/excluir), `src/components/execucao/SeloPersonalizacao.tsx`.
Editados: `especialista-base.server.ts`, `especialista-etapa.server.ts`, `openai-etapa.server.ts`, `execucao.functions.ts`, `PainelExecucao.tsx`, `config/preferencias.tsx`.
Intocados: Registry e suas tabelas, `ranking.ts`, `correcao-etapa.server.ts`, gatekeeper, psicologia e máquina de estados.

## 15. Riscos

Inferência prematura (mínimo de evidências e confiança), contaminação entre marcas e formatos (filtro obrigatório), custo e tamanho de prompt (limites duros), conflito com a Voz de Marca (descarte registrado), falsa sensação de personalização (selo só com uso real).

## 16. Testes

A concisão após rejeições e aprovações repetidas · B outra Voz de Marca sem contaminação · C preferência de Hook não vaza para CTA · D edição pesa mais que Gostei · E Voz de Marca vence inferência · F briefing explícito vence memória · G local estrita sem nenhum envio, verificado no corpo real da requisição ao provedor · H híbrido usa só o autorizado · I revogação interrompe · J exclusão pelo usuário some da próxima geração · K poucos feedbacks não geram regra forte · L persistência após reload e novo login. Mais build, typecheck, lint, linter de RLS e console limpos.

## 17. Não será alterado

Registry e prompts-base versionados, ranking determinístico, correção única, reauditoria, máquina de estados, Gatekeeper, Análise Psicológica, captura da Etapa 1, adaptador de privacidade e a ausência de fallback entre local e nuvem.