# Auditoria funcional — "Curadoria final" e Voz de Marca

Nenhuma alteração foi implementada. Este documento é só diagnóstico + recomendação.

## 1. Diagnóstico da "Curadoria final"

**Classificação: mock legado da F0, duplicado em relação à curadoria real.**

A seção inferior é renderizada por `ConteudoDemo`, dentro de `src/components/chat/AreaResultados.tsx` (linhas 259–275, ramo `case "entregue"` do `switch (estado)`). Ela não tem nenhuma relação com execução, chat ou banco.

```text
Workspace
 └── AreaResultados
      ├── PainelExecucao(chatId)   -> dados reais (execucoes, execucao_etapas)
      │     └── CuradoriaExecucao  -> "Curadoria desta execução" (entrega real, notas reais)
      └── ConteudoDemo             -> switch por estado simulado da F0
            └── "Curadoria final"  -> VARIACOES (fixture) + PainelRanking (SINAIS_RANKING, fixture)
```

## 2. Fonte dos dados

- Textos dos cartões: constante `VARIACOES` em `src/lib/fixtures.ts:140`, importada em `AreaResultados.tsx:22`.
- Painel "Por que esta é a ordem": `PainelRanking` (`src/components/pipeline/PainelCuradoria.tsx`) lendo `SINAIS_RANKING`, também fixture.
- Qual ramo aparece: `useDemo().estado`, um `useState` em memória com valor inicial `"entregue"` (`src/lib/demo-state.tsx:59`).

Não há leitura de `execucao_resultados`, `entrega`, ranking determinístico, `execution_id` nem `chat_id`. O estado padrão `"entregue"` é o motivo de a seção aparecer sempre, inclusive em chat novo.

## 3. Quando ela atualiza hoje

Apenas quando alguém troca o estado no painel "Estados" (`ControleDemo`, visível só em DEV) ou quando o React remonta o `DemoProvider` — o que reseta para `"entregue"`. Não reage a ranking, entrega, reload, troca de chat, execução parcial ou correção.

Cenários pedidos, resultado real:

| Cenário | Esperado | Hoje |
| --- | --- | --- |
| A. Chat novo sem execução | Estado vazio | Mostra 5 variações fictícias como se fossem entrega |
| B. Execução concluída | Só itens entregues | Mostra fixtures; a entrega real está acima, em `CuradoriaExecucao` |
| C. Execução parcial | Itens válidos + aviso | Só se o estado demo for trocado à mão |
| D. Item corrigido | Só a corrigida como final | Fixture não conhece correção; o comportamento correto já existe em `CuradoriaExecucao` |
| E. Troca de chat | Nada do chat anterior | Fixtures idênticas em todo chat (conteúdo de nenhum chat) |
| F. Reload | Restaurar do servidor | Volta ao mesmo mock, estado demo reseta para "entregue" |

## 4. Quando deveria atualizar

Junto com a execução ativa: após `entrega` concluída, após reload (do servidor), ao trocar de chat, e voltar a vazio ao iniciar nova execução. Esse comportamento **já existe** em `CuradoriaExecucao` (`src/components/execucao/CuradoriaExecucao.tsx`), que lê `execucao_resultados` (`entrega`, `variacao`, `auditoria`, `correcao`, `adaptacao`) da execução real, exibe nota, posição, itens fora da curadoria e a correção única.

Ou seja: há duplicação funcional, e a versão duplicada é a falsa.

## 5. Diagnóstico do fluxo de Voz de Marca

**Classificação: funcionalidade completa, sem caminho de descoberta. Problema de navegação, não de dados nem de permissão.**

- `/config/voz-de-marca` existe e é funcional (`src/routes/_authenticated/config/voz-de-marca.tsx`): listagem, estado vazio honesto, botão "Novo perfil de marca", formulário (`FormularioPerfil`), editar, duplicar, definir padrão, excluir com substituto, contagem de pastas/chats/exemplos, invalidação de `chavesMarca.raiz` (atualiza sem logout).
- O seletor do chat (`SeletorPerfil` em `PainelParametros`) lista `opcoesPerfis()` corretamente, mostra "Nenhum perfil" e respeita a resolução chat → pasta → padrão via `opcoesPerfilAtivo`. Isolamento por conta é garantido pelas RLS da F3 sobre `perfis_marca`.
- O que falta: **acesso**. A engrenagem do `AppShell` aponta fixamente para `/config/privacidade` (`src/components/layout/AppShell.tsx:51`) e não existe menu compartilhado entre as páginas de configuração — `CascaSimples` só tem "Voltar ao workspace" + conta. O único link para a página é no onboarding (`onboarding.tsx:117`), fácil de perder. O seletor não tem ação de criar, e "Voz: Sem perfil de marca" no `ResumoContexto` é um popover informativo, sem atalho.

Portanto, entre as hipóteses levantadas: o menu de configurações **nunca foi implementado**; a rota existe sem navegação; falta botão de criar no ponto de uso. Não é lista vazia por consulta, nem falha de permissão.

## 6. Impacto para o usuário

- Curadoria final: risco alto de credibilidade — conteúdo demonstrativo apresentado como resultado real, ao lado da entrega verdadeira.
- Voz de Marca: recurso central da F3 praticamente inalcançável depois do onboarding; usuário conclui que a funcionalidade não existe.

## 7. Solução mínima recomendada (para aprovação)

**Curadoria final**
- Remover o ramo `case "entregue"` que renderiza "Curadoria final" com `VARIACOES` e o `PainelRanking` de fixture. A curadoria real de `CuradoriaExecucao` passa a ser a única.
- Quando não houver execução, exibir o estado vazio já existente ("Comece pelo briefing"), nunca variações.
- Manter os demais estados demo apenas sob `import.meta.env.DEV`, para não exibir cenários simulados em produção.

**Voz de Marca**
- Criar uma navegação de configurações compartilhada (Privacidade, Voz de marca, Preferências, IA local) dentro de `CascaSimples`/`PaginaConfig`.
- No seletor do chat: item final "Criar nova voz de marca" e, no estado vazio, link "Criar voz de marca" — ambos levando a `/config/voz-de-marca`.
- Tornar "Voz: …" no `ResumoContexto` um atalho para a mesma página.
- Manter `/config/voz-de-marca` como única área de gerenciamento; sem mudança de schema, de resolução chat → pasta → padrão, de consentimento ou de pipeline.

## 8. Arquivos afetados (se aprovado)

- `src/components/chat/AreaResultados.tsx` — remover a curadoria mock; gate DEV nos estados demo.
- `src/components/pipeline/PainelCuradoria.tsx` — deixa de ser usado no chat (remover ou restringir a DEV).
- `src/components/layout/CascaSimples.tsx` + `AppShell.tsx` (`PaginaConfig`) — navegação entre configurações.
- `src/components/marca/SeletorPerfil.tsx` — ação de criar / estado vazio com link.
- `src/components/chat/ResumoContexto.tsx` — atalho para gerenciar voz de marca.

Sem mudanças em `src/lib/marca*`, banco, RLS ou funções de servidor.

## 9. Critérios de aceite

1. Chat sem execução não exibe nenhuma variação; mostra estado vazio.
2. Chat com execução concluída exibe apenas a curadoria real daquela execução, uma única vez.
3. Trocar de chat e recarregar refletem sempre dados do servidor.
4. Item corrigido aparece só na versão final; original permanece em "Fora da curadoria".
5. A partir do chat, o usuário chega a `/config/voz-de-marca` em no máximo dois cliques.
6. Criar o primeiro perfil e voltar ao chat: perfil aparece no seletor sem logout e pode ser selecionado.
7. Segundo perfil, herança por pasta, override por chat e isolamento entre contas seguem inalterados.

## 10. Confirmação

Nenhuma alteração de código, schema, dado ou configuração foi feita nesta auditoria.