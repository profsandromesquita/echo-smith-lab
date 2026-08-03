# F5 — Diagnóstico do bloqueador na criação da execução

## Erro exato

Chamada direta da RPC como usuário autenticado, com os mesmos parâmetros que o frontend envia:

```text
POST /rest/v1/rpc/criar_execucao  ->  HTTP 400
{"code":"22P02",
 "details":"Array value must start with \"{\" or dimension information.",
 "message":"malformed array literal: \"hook_master\""}
```

Nenhuma linha é criada porque a exceção ocorre dentro da transação da função, que é revertida por completo.

## Ponto exato da falha

`public.criar_execucao`, no bloco de roteamento por formato, antes de qualquer INSERT:

```sql
if _formato = 'hook' then papeis := papeis || 'hook_master';
elsif _formato in ('headline_video','headline_imagem') then papeis := papeis || 'headline_architect';
elsif _formato = 'cta' then papeis := papeis || 'cta_specialist';
```

## Causa raiz

Concatenação de um literal sem tipo (`unknown`) a um `text[]`. Nesse caso o Postgres resolve o operador `||` como `anyarray || anyarray` e tenta converter `'hook_master'` em `text[]`, falhando com `22P02`. As demais linhas usam `array[...]` e por isso funcionam. Não há problema de assinatura, tipos, enums, jsonb, nulos, grants ou RLS.

## O que foi descartado com evidência

- Assinatura da RPC idêntica à chamada: `(_chat_id uuid, _formato text, _snapshot_chat jsonb, _snapshot_marca jsonb, _snapshot_privacidade jsonb, _modo_privacidade text, _permissoes jsonb) returns uuid`, igual ao declarado em `src/integrations/supabase/types.ts`.
- `GRANT EXECUTE` presente para `authenticated` e `service_role`; função `SECURITY DEFINER` com `search_path = ''`.
- Sessão válida: a exceção acontece depois da checagem de `auth.uid()`, que passou.
- Registry completo: os 10 papéis têm versão publicada e ativa.
- Triggers de imutabilidade (`execucao_eventos`, `execucao_registry_versoes`, `fotografias_consentimento`) disparam apenas em UPDATE/DELETE, nunca em INSERT.
- Tabelas e colunas de execução existem, com grants corretos e RLS ativa.
- Sem erros anteriores nos logs de banco na janela disponível; a falha é de resolução de operador em tempo de execução.

## Arquivos e objetos envolvidos

- Banco: função `public.criar_execucao` — única peça defeituosa.
- `src/lib/execucao.functions.ts` e `src/components/execucao/PainelExecucao.tsx` — corretos, sem alteração necessária.

## Correção mínima recomendada

Nova migração (sem reescrever as anteriores) com `CREATE OR REPLACE FUNCTION public.criar_execucao(...)`, reaproveitando o corpo atual e alterando somente as três linhas de roteamento:

```sql
if _formato = 'hook' then papeis := papeis || array['hook_master'];
elsif _formato in ('headline_video','headline_imagem') then papeis := papeis || array['headline_architect'];
elsif _formato = 'cta' then papeis := papeis || array['cta_specialist'];
```

Nada mais muda: mesma assinatura, mesmo `SECURITY DEFINER`, mesmos grants, mesma ordem de inserções (execução, fotografia, permissões, vínculos com Registry, etapas, evento e transição), mesma máquina de estados, mesmo Registry.

## Impacto

- Sem impacto em RLS, consentimentos, fotografias, Registry ou F6.
- Passa a criar execução para `hook`, `headline_video`, `headline_imagem` e `cta`. `pacote_completo` já funcionava e permanece igual.
- Nenhuma migração aplicada é reescrita; nenhuma tabela é alterada.

## Testes necessários

1. Chamada direta da RPC para cada formato, verificando retorno `uuid` e HTTP 200.
2. Por execução criada: 1 linha em `execucoes`, 1 em `execucao_fotografias` com `fotografia_id` vinculado, N em `execucao_registry_versoes`, N em `execucao_etapas` na ordem correta, evento `criada` e transição registrada.
3. Modo Local Estrita sem consentimento: etapas dependentes de `briefing` em `bloqueada` e execução em `aguardando_consentimento`.
4. Com consentimento de `briefing` concedido: execução em `pronta` e avanço até o fim pelo painel.
5. Isolamento: segunda conta não enxerga a execução da primeira.
6. Navegador: iniciar execução no chat, ver a linha do tempo avançar e os detalhes técnicos preenchidos.

## Observação de ambiente encontrada no diagnóstico

No teste automatizado, o cadastro pela tela `/auth` não chegou a criar usuário no backend (o mesmo cadastro via API funcionou), devolvendo para `/auth?destino=/app`. É independente deste bloqueador e pode ser investigado à parte, se você quiser.