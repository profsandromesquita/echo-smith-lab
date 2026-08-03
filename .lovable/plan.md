# Pré-condição de roteamento real antes de reexecutar a matriz da F6D

Objetivo: garantir que nenhuma etapa fixada em provedor real caia em simulação, antes de gastar chamadas reais na matriz 1–13. Sem mudança de arquitetura e sem ampliar escopo.

## Estado atual verificado (leitura de código)

Hoje existem quatro leituras separadas da versão fixada, e elas não são equivalentes:

- `gatekeeper-etapa.server.ts` — lê pelo cliente privilegiado (corrigido no bloco anterior).
- `especialista-etapa.server.ts` (Hook, Headline, CTA) — lê `registry_versoes` pelo cliente do usuário.
- `openai-etapa.server.ts` (Psicologia, Auditor, segunda auditoria) — lê pelo cliente do usuário.
- `correcao-etapa.server.ts` (correção pelo especialista de origem) — lê `execucao_registry_versoes` + `registry_versoes` pelo cliente do usuário.

Como `registry_versoes` é configuração de plataforma restrita a `admin_tecnico` por RLS, uma conta comum recebe `null` nessas três leituras. É a mesma causa raiz já identificada, ainda presente em todos os papéis que não são o Gatekeeper.

## Correção mínima

1. Criar uma rotina server-side única de leitura da versão fixada, usada por todos os papéis reais (Gatekeeper, Psicologia, Hook Master, Headline Architect, CTA, Auditor, correção, segunda auditoria). Ela:
   - recebe apenas o `registry_versao_id` já persistido na etapa (ou o vínculo `execucao_registry_versoes` da execução), nunca um ID vindo do cliente;
   - confirma o vínculo etapa → execução → usuário autenticado antes de ler com privilégio;
   - exige versão publicada, provedor válido e modelo presente, retornando erro tipado em vez de `null` genérico;
   - devolve só o necessário para executar a etapa; instruções, schema e configuração completa nunca voltam ao cliente;
   - permanece em módulo `.server`, fora do grafo do cliente.
2. Trocar as quatro leituras atuais por essa rotina, preservando o comportamento de cada papel.
3. Fechar o fallback: para etapa fixada em `openai` ou `anthropic`, qualquer configuração ausente, erro de leitura, provedor inválido, modelo ausente, versão não publicada ou inconsistente termina a etapa com `configuracao_indisponivel`, sem retry cego e sem nenhuma chamada ao adaptador simulado. O simulado só roda quando a versão fixada declarar `provedor = simulado` ou em teste administrativo identificado.

## Validação em quatro etapas, nesta ordem

**A. Auditoria de código/SQL** — confirmar que nenhum caminho de execução chama o adaptador simulado com provedor real fixado, e que a rotina única é a única porta de leitura do Registry.

**B. Smoke test por papel** — conta comum com JWT real, um papel por vez (Gatekeeper, Psicologia, Hook Master, Headline Architect, CTA, Auditor). Evidência no banco para cada um: provedor real esperado, modelo real esperado, versão do Registry, tokens de entrada e saída, duração, custo, linha em `execucao_reservas_custo`, ausência de modelo mock e ausência de fallback.

**C. Ciclo real de correção** — cenário completo: variação reprovada pelo Auditor, correção pelo especialista de origem na mesma versão do Registry, segunda auditoria real, original preservado no histórico.

**D. Falha segura** — cenário controlado com configuração real indisponível: nenhuma chamada simulada, nenhum resultado criativo mock persistido, etapa em `configuracao_indisponivel`, mensagem segura na interface, sem retry cego.

## Reexecução da matriz

Somente com A–D aprovados, reexecuto integralmente os itens 1–13 da matriz de encerramento, incluindo isolamento entre contas com JWTs reais. `service_role` apenas para fixtures e inspeção posterior. Cada linha da matriz identifica a origem da evidência: chamada real OpenAI, chamada real Anthropic, cenário controlado, leitura de código/SQL ou consulta ao banco.

A F6D só é encerrada se nenhuma execução de usuário comum usar fallback simulado e toda a matriz passar.

## Fora de escopo

Llama, WebLLM, adaptação local, memória adaptativa, novos provedores, novos formatos e qualquer item de fase seguinte.