# Feedback do usuário e adaptação progressiva (Adaptive Style Learning)

Nada foi implementado. Este documento é auditoria + plano para aprovação.

## 1. Funcionalidades existentes hoje

| Controle | Onde | Situação |
| --- | --- | --- |
| Favoritar / Editar / Descartar / Comparar / Copiar | `CartaoVariacao.tsx` | 100% visual, fixture da F0. `favorita` vem de `VARIACOES` em `fixtures.ts`; os botões não têm handler (exceto Copiar). Só aparece nos estados demo de `AreaResultados`. |
| Curadoria real | `CuradoriaExecucao.tsx` | Lê `execucao_resultados` de verdade, mas é somente leitura: texto, score, posição, auditoria, correção, fora da curadoria. Nenhum controle de feedback. |
| "Preferências de estilo" | `/config/preferencias` | Página inteiramente de fixture (`PREFERENCIAS_EXPLICITAS`, `PREFERENCIAS_INFERIDAS`). Botões de adicionar/remover não fazem nada; nada persiste. |
| Exemplos da Voz de Marca | `exemplos_marca` + `marca.functions.ts` | Reais e persistentes, com RLS por usuário e vínculo a `perfil_id`. Criados só manualmente na página de Voz de Marca. |
| Memória local de estilo | `armazenamento-local.ts` | Só existe o namespace declarado (IndexedDB `memoria-estilo`) para efeito de limpeza. Nada escreve nele. |
| Uso de feedback nos prompts | `especialista-etapa.server.ts`, `especialista-base.server.ts`, `auditor.server.ts` | Os agentes recebem apenas `nome`, `tom_de_voz` e `posicionamento` do perfil resolvido. Nem os `exemplos_marca` nem qualquer preferência entram no prompt. |

Respostas diretas:
1. Existem hoje: favoritar, editar, descartar, comparar, copiar (cartão demo) e a página de preferências.
2. Apenas visuais/demonstrativos: todos os acima, exceto copiar.
3. Persistem no banco: nada de feedback. Só `exemplos_marca` (criação manual).
4. Nenhum feedback influencia execuções futuras.
5. Isolamento por conta: sim, via RLS em `perfis_marca`/`exemplos_marca`. Isolamento por perfil de marca: existe para exemplos (`perfil_id`); inexistente para feedback, que não existe.

## 2. Lacunas

- Não há tabela de feedback, de edição de resultado nem de preferência inferida.
- A curadoria real não tem nenhuma ação.
- Não há caminho de resultado entregue para exemplo de referência do perfil ativo.
- Não há camada de recuperação e injeção de contexto dinâmico nos agentes.
- A página de preferências promete algo que não existe.
- `execucao_resultados` é append-only: feedback e edição precisam de tabelas próprias, nunca sobrescrever o resultado.

## 3. Componentes e tabelas envolvidos

Componentes: `CuradoriaExecucao.tsx` (alvo principal), `PainelExecucao.tsx`, `CartaoVariacao.tsx` (legado a aposentar), `/config/preferencias`, `/config/voz-de-marca`, `SeletorPerfil`.
Tabelas existentes: `execucoes`, `execucao_resultados`, `execucao_etapas`, `perfis_marca`, `exemplos_marca`, `preferencias_privacidade`, `consentimentos`.
Servidor: `execucao.functions.ts`, `marca.functions.ts`, `especialista-etapa.server.ts`, `auditor.server.ts`. O Registry permanece intocado.

## 4. Arquitetura recomendada

Três camadas separadas, sem tocar no Registry:

```text
captura                síntese                      uso
feedback_resultado  ->  preferencias_inferidas  ->  contexto dinâmico por etapa
edicoes_resultado   ->  (padrões + motivos)         (bloco separado do prompt-base)
exemplos_marca      --------------------------->    few-shot autorizado
```

Princípios:
- O prompt-base do Registry permanece imutável. O aprendizado entra como bloco adicional, rotulado, montado em tempo de execução e registrado no snapshot da execução.
- Precedência fixa: Registry > Voz de Marca explícita > parâmetros da execução > preferências inferidas > exemplos aprovados. Conflito com a Voz de Marca explícita: a inferida é descartada e o descarte fica registrado.
- Síntese sempre no servidor, por usuário e perfil de marca; nunca global.

## 5. Modelo de dados

```text
feedback_resultado
  id, user_id, execucao_id, resultado_id, variacao_id, perfil_marca_id,
  formato, papel, sinal ('positivo'|'negativo'), motivos text[], comentario,
  criado_em, atualizado_em
  UNIQUE (user_id, resultado_id, variacao_id)   -- duplo clique não duplica

edicoes_resultado
  id, user_id, execucao_id, resultado_id, variacao_id, perfil_marca_id,
  texto_original, texto_editado, diff jsonb, virou_exemplo bool,
  exemplo_id fk exemplos_marca, criado_em

preferencias_inferidas
  id, user_id, perfil_marca_id, formato, papel, tipo ('aprovado'|'rejeitado'),
  padrao text, motivo text, ocorrencias int, ultima_ocorrencia_em,
  origem ('feedback'|'edicao'|'exemplo'), ativa bool, corrigida_pelo_usuario bool,
  criado_em, atualizado_em

preferencias_aprendizado   -- uma linha por usuário
  user_id, ativo bool, usar_exemplos bool, limite_exemplos int, atualizado_em
```

`exemplos_marca` é reutilizada para "usar como referência" (ganha colunas opcionais `origem`, `execucao_id`, `resultado_id`). Toda tabela nova: `GRANT` para `authenticated`, `GRANT ALL` para `service_role`, RLS por `auth.uid() = user_id`, sem acesso anônimo.

Separação de categorias garantida por construção: Voz de Marca declarada (`perfis_marca`), exemplos fornecidos (`exemplos_marca.origem = 'manual'`), exemplos aprovados (`origem = 'feedback'`), preferências inferidas (`preferencias_inferidas`), memória do chat (`mensagens`), memória privada local (IndexedDB `memoria-estilo`).

## 6. Comportamento da interface

Em cada item de `CuradoriaExecucao`: Copiar · Gostei · Não gostei · Editar · Usar como referência.
- Gostei: registra sinal positivo e oferece "salvar como exemplo de referência do perfil <nome>".
- Não gostei: popover com motivos rápidos (genérico, clichê, longo demais, pouco claro, agressivo demais, fraco, desalinhado com a Voz de Marca, não corresponde ao público, outro) e comentário opcional.
- Editar: campo com o texto original preservado; salva a versão editada e o diff; opção de marcar como exemplo aprovado. O resultado original nunca é sobrescrito.
- Usar como referência: cria exemplo vinculado apenas ao perfil de marca ativo daquela execução; removível depois. Sem perfil ativo, oferece selecionar ou criar antes.
- Estados honestos: sem perfil ativo, aprendizado desligado, modo local estrito.
- Nova área "Preferências aprendidas" substituindo o conteúdo fixture de `/config/preferencias`: listas separadas de explícitas e inferidas, corrigir, remover, desligar o uso, limpar tudo, e lista dos exemplos de referência com origem.
- No painel da execução, quando o contexto dinâmico for usado: selo "Personalização por preferências aplicada", com detalhamento do que entrou.
- Vocabulário: adaptação por preferências, memória contextual, exemplos de referência, personalização progressiva. Nunca fine-tuning ou treinamento.

## 7. Recuperação e injeção no prompt

No início da etapa de cada especialista e do Auditor, depois da resolução do perfil e do consentimento:
1. Filtro por `user_id` + perfil de marca ativo + formato + papel.
2. Preferências inferidas ativas ordenadas por relevância (ocorrências × recência); máximo 8 itens, cerca de 600 caracteres.
3. Exemplos aprovados: máximo 3, deduplicados, priorizando recência e diversidade, com texto truncado.
4. Descarte de qualquer inferência que contrarie campos explícitos do perfil (`preferidas`, `evitadas`, `principios`, `orientacoes`); o descarte é registrado como evento técnico.
5. O bloco entra como seção rotulada da entrada da etapa, nunca concatenado ao `instrucoes_sistema` do Registry, e é gravado em `snapshot_marca`/`entrada_resumo` para rastreabilidade.

## 8. Privacidade

- Feedback, motivos e edições ficam na conta do usuário. Clicar em "Gostei" nunca dispara chamada externa.
- Memória local estrita: nenhuma preferência inferida nem exemplo entra no contexto enviado à nuvem; o painel informa "personalização não aplicada neste modo". Sem fallback silencioso.
- Híbrido autorizado: injeção só com consentimento vigente por categoria, provedor, etapa e finalidade, reutilizando `autorizar_execucao` e o modal existente, com a nova finalidade descrita de forma explícita.
- Revogação futura suportada: sem consentimento, a etapa simplesmente não recebe o bloco.

## 9. Plano em etapas

**Etapa 1 — Captura**
Tabelas `feedback_resultado` e `edicoes_resultado`, extensão de `exemplos_marca`, funções de servidor validando propriedade da execução e do resultado, UI de feedback, motivos, edição e "usar como referência" em `CuradoriaExecucao`, aposentadoria dos controles fixture de feedback.

**Etapa 2 — Síntese e uso**
`preferencias_inferidas` e rotina de síntese no servidor, recuperação com limites, injeção como bloco separado nos especialistas e no Auditor, selo de personalização aplicada, precedência da Voz de Marca explícita.

**Etapa 3 — Transparência e privacidade**
Página "Preferências aprendidas" real, corrigir/remover/desligar/limpar, consentimento por finalidade, comportamento no modo local estrito, memória local em IndexedDB `memoria-estilo`.

Cada etapa é validada antes da seguinte.

## 10. Riscos

- Feedback escasso gerando inferência ruim: exigir mínimo de ocorrências antes de ativar uma preferência.
- Contaminação entre perfis de marca: mitigada por perfil obrigatório em toda leitura.
- Crescimento de prompt e custo: limites duros de itens e caracteres.
- Duplo clique e concorrência: restrição de unicidade e upsert idempotente.
- Regressão na curadoria real: a Etapa 1 não altera pipeline nem resultados existentes.
- Percepção de "treinamento do modelo": guardas de vocabulário na interface.

## 11. Critérios de aceite

1. Cada item entregue tem Gostei, Não gostei, Editar, Usar como referência e Copiar.
2. Feedback vinculado a resultado, execução, usuário e perfil corretos.
3. Edição preserva o original e grava a versão editada com diff.
4. Exemplo aprovado é recuperável em execuções futuras do mesmo perfil e formato.
5. Preferências de uma marca não afetam outra.
6. Preferências de uma conta não afetam outra, verificado com duas contas.
7. Voz de Marca explícita prevalece; inferências conflitantes são descartadas e registradas.
8. Nenhuma alteração automática em prompts-base ou Registry.
9. O usuário visualiza, corrige, remove e apaga todo o aprendizado.
10. Modo local estrito não envia memória privada à nuvem.
11. Nenhum texto de interface menciona fine-tuning ou treinamento.
12. Build, typecheck, lint, linter de RLS e console limpos.

## 12. Confirmação

Nenhuma alteração de código, schema, dado ou configuração foi feita nesta auditoria.