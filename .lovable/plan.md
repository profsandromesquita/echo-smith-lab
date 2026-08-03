# Fase F4 — Privacidade, consentimentos, retenção e observabilidade segura (revisão 2)

## 1. Objetivo

Estabelecer, de forma real e persistente, as regras que governarão qualquer futuro envio de dados a provedores externos: modo de privacidade por chat, consentimento informado versionado, detecção local de dados identificáveis, retenção/exportação/exclusão e logs técnicos sem conteúdo sensível.

Nenhuma API de IA é chamada. Nenhum provedor é conectado. Pipeline, auditoria e resultados continuam simulados sob o ControleDemo.

## 2. Decisões de privacidade

- Modo padrão de novos chats: **Memória Local Estrita**. Herança: chat → padrão da conta.
- **Híbrido Autorizado** não envia nada sozinho: apenas habilita a possibilidade de autorização explícita, por escopo.
- Quatro rótulos distintos e nunca intercambiáveis: **memória de estilo local**, **adaptação local**, **processamento em nuvem**, e **geração totalmente local** — esta última sempre exibida como indisponível, jamais selecionável.
- Sem fallback silencioso: se a etapa local não puder rodar, a interface exige decisão explícita.
- Consentimento tem versão de termos; mudança de texto gera nova versão e o registro antigo permanece no histórico.
- Configuração atual (mutável) é separada do histórico (append-only).

## 3. Modelo de dados e privilégios

Todas as tabelas em `public`, RLS habilitada, políticas separadas por operação e `TO authenticated`, escopadas em `auth.uid() = user_id`. **Os GRANTs são específicos por tabela** — nenhuma tabela recebe o conjunto genérico de quatro operações. `GRANT ALL ... TO service_role` em todas; nenhum grant para `anon` em nenhuma.

| Tabela | authenticated | Escrita |
| --- | --- | --- |
| `preferencias_privacidade` | SELECT, INSERT, UPDATE | própria linha apenas; sem DELETE |
| `termos_consentimento` | SELECT | exclusiva de processo privilegiado |
| `consentimentos` | SELECT | funções de servidor autenticadas |
| `consentimentos_historico` | SELECT | INSERT só pela função de consentimento |
| `fotografias_consentimento` | SELECT | INSERT só pela função segura |
| `eventos_tecnicos` | SELECT (próprios) | só `registrarEvento` no servidor |
| `solicitacoes_conta` | SELECT | criação e cancelamento por função; confirmação/conclusão só privilegiadas |

As escritas restritas usam funções `security definer` com `set search_path = ''`, chamadas exclusivamente por server functions com `requireSupabaseAuth`; `EXECUTE` revogado de `anon`/`authenticated` nas funções internas. RLS permanece como segunda camada, nunca como justificativa para conceder operação desnecessária.

**preferencias_privacidade** (`unique (user_id)`) — `modo_padrao` (`local_estrita`|`hibrido_autorizado`), `alerta_dados_pessoais`, `bloquear_envio_com_alerta`, `retencao_logs_dias` (30/90/180), `retencao_conteudo`.

**chats.modo_privacidade text null** — substituição por chat; nulo herda o padrão da conta.

**termos_consentimento** — `chave`, `versao`, `titulo`, `corpo`, `vigente`; único parcial `(chave) where vigente`. Catálogo sem `user_id`, política de leitura para autenticados.

**consentimentos** — `escopo` (`conta`|`pasta`|`chat`), `escopo_id uuid null`, `categoria`, `provedor`, `etapa`, `finalidade`, `estado` (`concedido`|`recusado`|`revogado`), `termos_id`.

**consentimentos_historico** — espelha os campos + `acao`, `origem`, `ocorrido_em`. Sem políticas de UPDATE/DELETE e trigger `before update or delete` que levanta exceção.

**fotografias_consentimento** — imutável pelo mesmo mecanismo. Guarda **uma linha por permissão autorizada**, cada uma com `categoria`, `provedor`, `etapa`, `finalidade`, `termos_id`, `termos_versao`, `origem`, `decisao`, agrupadas por `fotografia_id`. Não existe `termos_id` único global. Nenhuma coluna guarda conteúdo do briefing. Sem `chat_id` obrigatório e **sem gravação nesta fase** (ver seção 5).

**eventos_tecnicos** — `tipo`, `etapa`, `provedor`, `modelo`, `duracao_ms`, `status`, `codigo_erro` (≤80 chars), `tentativas`, `custo_estimado`, `chat_id null`. Nenhum campo de texto livre. Admin técnico lê apenas agregados por função dedicada.

**solicitacoes_conta** — `tipo` (`exportacao`|`exclusao_conta`), `estado` (`pendente`|`confirmada`|`concluida`|`cancelada`), `confirmado_em`, `concluido_em`.

## 4. Unicidade e coerência dos consentimentos

Unicidade que funciona com `escopo_id` nulo, por dois índices únicos parciais complementares:

```text
unique (user_id, categoria, provedor, etapa)
  where escopo = 'conta' and escopo_id is null

unique (user_id, escopo, escopo_id, categoria, provedor, etapa)
  where escopo <> 'conta' and escopo_id is not null
```

Validação em duas camadas — banco e função de servidor, com as mesmas regras:

- `escopo = 'conta'` exige `escopo_id is null` (CHECK).
- `escopo <> 'conta'` exige `escopo_id is not null` (CHECK).
- `escopo = 'pasta'` exige pasta existente e do usuário (trigger usando `pasta_e_minha`).
- `escopo = 'chat'` exige chat existente e do usuário (trigger usando `chat_e_meu`).
- Combinação inválida é rejeitada no banco com exceção e na função de servidor com resposta neutra, sem revelar existência de recursos de outra conta.

## 5. Autorização "apenas esta execução"

Nesta fase ainda não existem `generation_run` nem jobs. Portanto:

- Consentimentos de escopo **conta** e **chat** são persistidos normalmente.
- O modal e o fluxo de "autorizar apenas esta execução" são construídos e **simulados**: a decisão é montada em memória, exibida integralmente ao usuário e descartada ao final do fluxo simulado.
- **Nenhuma fotografia definitiva órfã é gravada.** A tabela e a função de montagem existem, mas a gravação fica desabilitada até haver execução real.
- Na fase de execução, a fotografia será criada de forma atômica junto à execução correspondente, preservando por permissão: categoria, provedor, etapa, finalidade, `termos_id`, versão dos termos, origem e decisão — com `termos_id` próprio quando as permissões estiverem sujeitas a termos diferentes.

Regras do modal (inalteradas): apresenta quais dados, finalidade, categoria, provedor, etapa, consequência da recusa e cancelar. Ações: apenas esta execução (simulada), este chat, a conta, recusar. Em Memória Local Estrita, `resumo_voz_marca` e `texto_gerado` ficam indisponíveis com explicação visível. Revogação em Privacidade e no painel do chat; revogar não apaga histórico.

## 6. Detecção local de dados pessoais

Módulo `src/lib/pii.ts`, 100% no navegador, determinístico, sem rede:

- e-mail, telefone BR, CPF e CNPJ (com dígito verificador), CEP, cartão (Luhn), URLs com identificadores, datas de nascimento, nomes próprios por heurística conservadora, e termos sensíveis de saúde relevantes ao nicho (diagnóstico, medicação, nome de paciente).
- Cada achado: tipo, trecho, posição, confiança (`alta`/`media`). Confiança média avisa, nunca bloqueia.
- Ações: revisar, editar, **anonimizar** (`[NOME]`, `[EMAIL]`), ignorar conscientemente (caixa marcada; registra a decisão, nunca o trecho), cancelar.
- Texto analisado nunca sai do navegador; só contagem por tipo pode virar evento técnico, e apenas ao prosseguir.
- Roda no Composer antes do envio simulado, com debounce e cache por hash local.

## 7. Retenção, exportação e exclusão de dados locais

- Chat, pasta e perfil de marca passam a usar um diálogo destrutivo unificado com impacto explícito e confirmação por digitação nas operações irreversíveis.
- **Dados locais — remoção seletiva por namespace, nunca varredura da origem.** Todo armazenamento local da aplicação passa a usar o prefixo `copyforja:` e um banco IndexedDB nomeado `copyforja`. A limpeza remove somente: chaves `copyforja:*` do localStorage (preferências locais, cache de detecção), os stores declarados do IndexedDB `copyforja` (`memoria-estilo`, `cache-pii`, `modelo-local`), e artefatos futuros do modelo local. A interface lista explicitamente cada recurso removido antes e depois da ação. **Preservados:** sessão de autenticação Supabase, configurações necessárias ao funcionamento e qualquer chave fora do namespace.
- Entrada em Configurações › IA local para remover o modelo, desabilitada com rótulo honesto de indisponível.
- `retencao_logs_dias` é armazenada e exibida; nenhuma rotina automática de expurgo é ligada nesta fase.
- **Exportação**: função de servidor autenticada monta JSON com perfil, pastas, chats, mensagens, perfis de Voz de Marca, exemplos, preferências de privacidade e histórico de consentimentos. Exclui Secrets, dados administrativos e eventos de outras contas. Download gerado no navegador.

## 8. Exclusão de conta

- Solicitação registrada, confirmação em duas etapas com digitação, e função de servidor que apaga em ordem de dependência **todos** os dados pessoais e operacionais da conta.
- **Nenhum registro permanece vinculado ao `user_id` excluído.** Não se presume obrigação de retenção que ainda não foi definida juridicamente.
- Enquanto não existir política jurídica aprovada, o padrão é **exclusão**. Se algum registro precisar permanecer por política futura aprovada, ele será **pseudonimizado ou anonimizado** — `user_id` substituído por identificador não reversível e colunas identificáveis removidas — nunca mantido com o vínculo original.
- A tela informa, antes da confirmação, exatamente o que é apagado, o que eventualmente permanece de forma anonimizada, a finalidade e o prazo. Sem finalidade e prazo definidos, nada permanece.
- Sessão encerrada ao final.

## 9. Observabilidade segura

- Único caminho de escrita: `registrarEvento` em `src/lib/telemetria.functions.ts`, com validação Zod `.strict()` de schema fechado. Cliente não escreve na tabela.
- Erros normalizados para códigos (`timeout`, `rate_limit`, `invalid_input`, `provider_error`, `unknown_outcome`); mensagem original nunca persiste.
- `src/lib/error-capture.ts` revisado para não enviar corpo de mensagens nem briefing.
- Admin técnico vê apenas agregados.
- Teste automatizado insere briefing com PII conhecida e verifica por consulta ao banco que nenhuma linha de `eventos_tecnicos` contém esses trechos.

## 10. Rotas e componentes afetados

Nenhuma rota nova de nível superior.

- `src/routes/_authenticated/config/privacidade.tsx` — modo padrão real, consentimentos ativos, histórico, retenção, dados locais, exportação, exclusão de conta.
- `src/routes/_authenticated/config/ia-local.tsx` — rótulos honestos e remoção de modelo (desabilitada).
- `src/components/privacy/ModalConsentimento.tsx` — categoria, provedor, etapa, finalidade e consequência reais, com as quatro ações.
- `src/components/privacy/Indicadores.tsx` — selos dos quatro rótulos.
- Novos: `AlertaDadosPessoais.tsx`, `DialogoDestrutivo.tsx`, `HistoricoConsentimentos.tsx`.
- `src/components/chat/Composer.tsx` — checagem local de PII antes do envio simulado.
- `src/components/chat/ResumoContexto.tsx` — modo real do chat e origem.
- `src/components/layout/PainelParametros.tsx` — seletor de modo por chat.
- `PainelPastas.tsx` e diálogos de exclusão de F2/F3 — passam a usar o diálogo destrutivo unificado.
- Novos módulos: `privacidade.functions.ts`, `privacidade.ts`, `consentimento.functions.ts`, `telemetria.functions.ts`, `pii.ts`, `armazenamento-local.ts`, `exportacao.functions.ts`.

Preservados: AppShell, MenuConta, ControleDemo, Thread, AreaResultados, CartaoVariacao, layout de três colunas, fixtures de pipeline.

## 11. Sequência de implementação — dois checkpoints internos de uma mesma F4

**Checkpoint A**
1. Migração: tabelas, `chats.modo_privacidade`, grants específicos por tabela, RLS, triggers de imutabilidade e de propriedade, CHECKs de coerência, os dois índices únicos parciais, seed da primeira versão dos termos.
2. `privacidade.functions.ts` + `privacidade.ts`: preferências da conta, modo por chat, resolução do modo efetivo.
3. `consentimento.functions.ts`: conceder, recusar, revogar, listar ativos, listar histórico; montagem simulada da autorização única sem gravação.
4. `pii.ts` + `AlertaDadosPessoais` + integração no Composer.
5. Modal de consentimento real, indicadores de rótulo e página de Privacidade na parte de modos e consentimentos.
6. Testes de isolamento entre contas, unicidade, coerência de escopo e integridade do histórico.

**Checkpoint B**
7. `telemetria.functions.ts` e revisão do error-capture.
8. Exportação completa.
9. Namespace de armazenamento local e limpeza seletiva com lista explícita.
10. Exclusão de conta com diálogo destrutivo unificado.
11. Regressão completa F1–F3, visual e de build.

## 12. Riscos

- **Falso positivo na detecção de PII** — confiança graduada, dígito verificador, sem bloqueio em confiança média.
- **Consentimento parecer permissão automática** — escopo explícito, rótulo de validade, revogação visível.
- **Vazamento de conteúdo em logs** — schema fechado, sem campo livre, teste de verificação.
- **Limpeza local apagar sessão** — namespace obrigatório e lista de chaves declarada; teste que confirma sessão preservada após a limpeza.
- **Exclusão de conta deixar resíduo vinculado** — verificação automatizada de que nenhuma tabela retém o `user_id` excluído.
- **Regressão em F2/F3 pelo diálogo unificado** — mesmas funções de servidor, troca só da camada visual.

## 13. Critérios de aceite

- Modo de privacidade por chat persiste; origem (chat ou padrão) sempre exibida.
- Consentir, recusar e revogar funcionam por escopo e ficam no histórico; histórico não é alterável nem apagável.
- Duplicata de consentimento é impossível, inclusive no escopo conta com `escopo_id` nulo.
- Escopo inválido ou recurso de outra conta é rejeitado no banco e na função, com resposta neutra.
- "Apenas esta execução" é apresentada e simulada sem gravar fotografia órfã.
- Detecção local alerta, permite editar, anonimizar, ignorar conscientemente e cancelar; nada do texto chega ao backend.
- Cliente não consegue escrever diretamente em `consentimentos`, `consentimentos_historico`, `fotografias_consentimento`, `eventos_tecnicos` nem em `termos_consentimento`.
- Limpeza local remove só o namespace declarado e mantém a sessão ativa.
- Exclusão de conta não deixa nenhum registro vinculado ao `user_id`; a tela declara o que permanece, por que e por quanto tempo.
- Exportação devolve apenas dados da própria conta.
- Nenhuma linha de `eventos_tecnicos` contém briefing, mensagem, exemplo, prompt, resposta, token ou PII.
- Nenhuma chamada de rede a provedor de IA em toda a fase.
- F1–F3 intactas; identidade visual, responsividade e ControleDemo preservados; build, tipos e console limpos.

## 14. Testes

Duas contas reais, via navegador: trocar modo por chat e recarregar; conceder, recusar e revogar em escopos conta, pasta e chat; tentar duplicar consentimento de conta; tentar escopo `conta` com `escopo_id` preenchido e escopo `pasta` com id de outra conta; percorrer "apenas esta execução" e confirmar por consulta que nenhuma fotografia foi gravada; tentativa de INSERT direto pelo cliente nas tabelas restritas (deve falhar); briefing com e-mail, telefone e CPF válidos com alerta, anonimização, ignorar consciente e cancelamento; exportar e conferir o JSON; limpar dados locais e confirmar por inspeção que só chaves `copyforja:*` sumiram e a sessão continua; solicitar exclusão de conta, cancelar, depois concluir e verificar ausência de resíduo por `user_id`; isolamento entre contas por id direto; consulta confirmando ausência de conteúdo sensível em `eventos_tecnicos`; regressão completa de F1, F2 e F3; regressão visual em 375, 768 e 1440 px; build, typecheck e console sem erros.

## 15. Confirmação de escopo

Nenhuma fase posterior será antecipada e nenhuma fase nova é criada — A e B são checkpoints internos da F4. Ficam de fora: chamadas a provedores de IA, Llama local real, WebLLM, Registry de agentes, jobs, `generation_run`, pipeline real, auditoria real, ranking real, memória adaptativa, embeddings, RAG, pagamentos e colaboração.
