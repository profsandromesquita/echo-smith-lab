## Objetivo

Reduzir densidade e criar hierarquia na tela `/app/c/$chatId`: a copy gerada e a conversa passam a dominar; auditoria, versões e estados técnicos ficam disponíveis sob demanda. Mudança **exclusivamente de apresentação** — nenhuma funcionalidade, mock, rota, dado, autenticação ou token visual é alterado.

## Escopo de arquivos

| Arquivo | Mudança |
| --- | --- |
| `src/components/chat/Composer.tsx` | Compositor compacto |
| `src/components/chat/Workspace.tsx` | Cabeçalho com resumo de contexto clicável |
| `src/components/chat/Thread.tsx` | Mensagem da plataforma como "Diretriz estratégica" |
| `src/components/pipeline/CartaoVariacao.tsx` | Card fechado enxuto + expansão "Ver auditoria" |
| `src/components/chat/AreaResultados.tsx` | Ajuste mínimo de espaçamento/uso do aviso honesto |
| novo: `src/components/chat/ResumoContexto.tsx` | Popover com Voz de Marca, modo de privacidade e IA local |

Nada fora dessa lista. Landing, config, admin, auth, `AppShell`, `PainelParametros`, `PainelPastas`, `ControleDemo`, `demo-state` e `fixtures` permanecem intactos.

## 1. Compositor

- Uma linha superior compacta: seletor Texto / Rascunho / Briefing estruturado como `ToggleGroup` só-ícone em telas pequenas e ícone+rótulo a partir de `sm`, altura reduzida, sem margem extra.
- Textarea com `rows={2}` e auto-crescimento por classe (`min-h`/`field-sizing`), sem altura vazia sobrando.
- Aviso de privacidade vira um ícone discreto (`ShieldCheck`) com `Tooltip` contendo o texto atual completo — texto preservado, apenas sob demanda.
- Botão "Gerar pacote" permanece como ação primária, alinhado à direita na mesma linha do aviso.

## 2. Contexto do chat

- Cabeçalho passa a ter: título do chat + **um** status principal (o estado dominante da execução, ex. "Entregue" / "Executando" / "Sem conexão", derivado do `DemoProvider` já existente).
- Voz de marca, modo de privacidade e estado da IA local são agrupados num botão-resumo compacto (`Voz: Jainara · Local estrita · IA local ativa`, truncado no mobile) que abre um `Popover` com as três informações completas, incluindo `SeloIaLocal` não-compacto. Nenhuma informação é removida.

## 3. Mensagem de análise

- Mensagens do autor `plataforma` são renderizadas como bloco de sistema curto rotulado **"Diretriz estratégica"**, exibindo somente a frase-diagnóstico (primeira sentença objetiva do mock).
- O restante do texto fica em um `Collapsible` "Ver análise". Nada do conteúdo do fixture é descartado.
- Mensagens do usuário mantêm o balão atual.

## 4. Cards de resultado

Estado fechado:
- badge de formato + posição (uma linha, sem sequência de etiquetas);
- texto final em destaque tipográfico (elemento dominante do card);
- **nota geral** — média das três notas de auditoria, calculada em tempo de render, sem mudar os fixtures;
- ações: Copiar, Favoritar e um menu `…` (dropdown) com Comparar versões, Editar e Descartar.

Área expandível "Ver auditoria" (`Collapsible`, fechada por padrão):
- Impacto, Clareza e Ritmo em linha compacta (não mais três caixas grandes);
- justificativa técnica;
- lista de versões (original, corrigida, adaptada, final) com seus rótulos;
- ações Comparar versões, Editar e Descartar também presentes aqui.

O estado "Removida da curadoria" continua sinalizado, com o mesmo tratamento visual atual (borda tracejada + opacidade) e o rótulo movido para junto do formato.

## 5. Chips e caixas

- No máximo um badge de formato + um de posição no estado fechado.
- Badges de versão migram para a expansão.
- Três caixas de nota substituídas por nota geral; individuais preservadas na expansão.

## 6. Preservação

Tokens semânticos, paleta, tipografia (Space Grotesk/DM Sans), textos em pt-BR, todos os estados do `ControleDemo` (vazio, briefing insuficiente, executando, adaptação local, preservação reprovada, parcial, cancelado, erro de provedor, consentimento pendente, resultado incerto, entregue, offline) e todas as ações existentes. Acessibilidade: `aria-label` em botões-ícone, tooltip com conteúdo também acessível por teclado, `Collapsible` com estado anunciado.

## Validação

Playwright em 375, 768 e 1440 px, percorrendo os estados-chave do `ControleDemo`, com screenshots antes/depois; checagem de zero erro de console, ausência de overflow horizontal, e conferência item a item de que nenhuma ação ou informação sumiu (apenas mudou de nível). Typecheck e lint ao final.

## Fora do escopo

Qualquer comportamento real (F2+), persistência, mudança em fixtures/estado global, redesign de outras páginas ou alteração de identidade visual.
