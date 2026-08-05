# F6D — Execução da matriz restante e veredito final

Blocos 3, 5, 7, 8, 9, 10 e 13 permanecem aprovados e não são reexecutados. Esta etapa fecha apenas o que falta.

## O que será executado

**1. CTA real (lacuna do bloco 1)**
Uma execução formato CTA em Híbrido Autorizado, com chamada real ao Claude Fable 5. Conferir 5 variações, provedor/modelo/versão do Registry na etapa, metadados gerados no servidor, tokens/custo/duração. Depois, cenários de saída inválida, recusa e truncamento — nenhum CTA pode ser persistido nesses casos.

**2. Correção real de Hook, Headline e CTA (lacuna do bloco 2)**
Três execuções com reprovação do auditor provocada por pré-condição controlada. Conferir que a correção volta ao especialista de origem, reusa a versão do Registry da geração original, preserva o original no histórico e passa pela segunda auditoria.

**3. Bloqueio de segunda correção**
Tentativa de corrigir duas vezes o mesmo item deve ser recusada pelo servidor, não pela interface.

**4. Paralelismo real dos especialistas (bloco 4)**
Execução multi-formato com Hook, Headline e CTA concorrentes. Conferir elegibilidade decidida no servidor, barreira só após estado terminal de todos, ausência de duplicatas sob duas sessões da mesma conta, reload no meio do processamento e um ramo falhando sem derrubar os demais.

**5. Voz de Marca por provedor (lacuna do bloco 6)**
Quatro execuções: autorização só para Anthropic, só para OpenAI, nenhuma e ambas. Nota válida quando avaliável; `null` com fator neutralizado quando não. Nenhuma autorização pode vazar de um provedor para o outro.

**6. Segurança dos metadados (bloco 11)**
Respostas do provedor adulteradas tentando trocar `execution_id`, item original, papel, formato, versão do Registry e número da correção. O servidor deve ignorar ou rejeitar cada caso.

**7. Regressão F1–F6C e saúde do build (bloco 12)**
Fluxos de auth, pastas, chats, perfis de marca, privacidade e Registry. Typecheck, build, preview, console sem erro, varredura por credenciais no bundle cliente. Confirmação de que Llama, WebLLM e adaptação local real seguem fora do escopo.

## Regras de execução

Correções limitadas a defeitos reais, no menor escopo possível, sempre reportadas. Divergência estrutural não vira implementação: vira registro na matriz e volta ao Plan Mode. Cenários que dependem de estado difícil de provocar naturalmente (reprovação do auditor, adulteração de resposta, truncamento) usam pré-condição controlada e ficam marcados como tal, separados das evidências de chamada real paga.

## Entrega final

Matriz consolidada dos blocos 1 a 13, cada linha com requisito, resultado, tipo de evidência (chamada real OpenAI/Anthropic, cenário controlado, JWT real, consulta ao banco, leitura de código), status entre aprovado / parcialmente aprovado / reprovado / reprovado e corrigido, e correção mínima aplicada quando houver. Ao final, o veredito definitivo da F6D.

## Detalhes técnicos

O harness anterior em `/tmp/f6d` foi perdido no reset do sandbox e será recriado: JWT real por conta comum, chamadas ao `_serverFn` do dev server local, leitura direta do banco para evidência. `service_role` só prepara fixture e inspeciona — nunca serve como prova de RLS ou autorização. Esta fase envolve chamadas pagas reais à OpenAI e à Anthropic e escrita em `execucoes`, `execucao_etapas`, `execucao_resultados` e `execucao_reservas_custo`.
