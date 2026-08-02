# Brand Voice Studio

Estou iniciando um novo projeto no Lovable.

Anexei três documentos que devem ser tratados como as fontes principais de contexto e requisitos do projeto:

1. Documento de Visão de Produto: define objetivo, público, experiência, funcionalidades e regras de negócio.
2. Arquitetura de Pipeline Multi-Agente: define os papéis dos agentes, o fluxo de geração, auditoria, memória e ponderação.
3. ADR IA Híbrida Local-Browser: define o uso de Llama 3.2 localmente no navegador, com fallback controlado para nuvem.

Leia os três documentos integralmente e investigue a melhor arquitetura para construir esta plataforma dentro do ecossistema Lovable.

Use somente o Plan Mode nesta etapa.

Não crie, altere ou implemente código ainda.
Não configure banco de dados.
Não crie Edge Functions.
Não solicite chaves de API.
Não inicie integrações.
Não gere a interface ainda.

Quero primeiro um plano mestre revisável.

Decisões já aprovadas

- O frontend deve seguir o padrão nativo do Lovable com React e Vite.
- Não migrar para Next.js.
- O backend deverá ser avaliado preferencialmente com Lovable Cloud.
- Todas as APIs autenticadas deverão usar Secrets e funções seguras no backend.
- Nenhuma credencial poderá ser exposta no frontend.
- Os modelos externos devem ser tratados como configurações substituíveis.
- Os papéis dos agentes não devem ficar permanentemente acoplados a um modelo específico.

Modelos e papéis iniciais

- Gatekeeper e orquestração: GPT-5.6 Sol.
- Hook Master: Claude Fable 5.
- Headline Architect: Claude Fable 5.
- Identificador da API Anthropic: claude-fable-5.
- Storytelling e legendas: GPT-5.6 Sol.
- Auditor e análise psicológica: GPT-5.6 Sol com esforço de raciocínio alto ou máximo.
- Adaptação local de estilo: Llama 3.2 executado no navegador.

Embora Hook Master e Headline Architect usem inicialmente o mesmo modelo, eles devem possuir instruções, objetivos, limites e critérios de avaliação diferentes.

Aprendizado Adaptativo de Estilo

Substitua qualquer referência a “RLHF Local” pelos conceitos:

- Aprendizado Adaptativo de Estilo;
- Refinamento de Preferências;
- Few-Shot Prompting Dinâmico;
- Memória Persistente Local.

Esse mecanismo não modifica os pesos do modelo e não deve ser tratado como fine-tuning.

Favoritos, edições, descartes e preferências deverão ser armazenados localmente e usados para selecionar exemplos relevantes nas próximas gerações.

Separe:

- preferências explícitas;
- preferências inferidas;
- exemplos fornecidos pelo usuário;
- edições feitas pelo usuário;
- favoritos;
- padrões recorrentes.

Preferências inferidas não podem sobrescrever silenciosamente regras explícitas.

IA local e privacidade

O Llama local deve atuar prioritariamente como Adaptador Local de Estilo e Preferências.

O fluxo pretendido é:

1. especialistas em nuvem geram as propostas;
2. o auditor avalia e seleciona;
3. o Llama local aplica Voz de Marca e preferências;
4. uma verificação local confirma preservação de sentido, formato e intenção;
5. qualquer nova auditoria em nuvem exige consentimento quando envolver conteúdo privado.

O download do modelo local:

- não é obrigatório;
- pode ser adiado;
- não deve iniciar automaticamente no celular;
- pode ser instalado posteriormente;
- pode ser removido pelo usuário;
- deve informar tamanho, requisitos e progresso.

Nunca faça fallback silencioso para nuvem.

Quando o processamento local não estiver disponível, a interface deve explicar a situação e pedir consentimento antes de enviar conteúdo potencialmente privado para a nuvem.

Loop de auditoria

No MVP, cada resultado reprovado pode passar por no máximo uma nova tentativa de correção.

Não criar loops ilimitados.

Corpus das 1.000 headlines

O corpus ainda será fornecido posteriormente.

Não invente headlines, métricas, fontes ou autorizações.

Não inclua o corpus no Project Knowledge.

Planeje apenas a futura infraestrutura de importação, validação, indexação, RAG, rastreabilidade e administração.

O que quero receber neste plano

1. Síntese do produto e da proposta de valor.
2. Fluxo principal do usuário.
3. Escopo recomendado para o MVP.
4. Páginas e rotas mínimas.
5. Componentes e áreas centrais da experiência.
6. Estados principais da interface.
7. Papéis e permissões do aplicativo.
8. Entidades e dados que precisarão ser persistidos.
9. Separação entre frontend, Lovable Cloud, processamento local e APIs externas.
10. Arquitetura proposta para o pipeline multi-agente.
11. Contratos conceituais entre os agentes.
12. Estratégia para execução paralela dos especialistas.
13. Estratégia para auditoria, correção e consolidação.
14. Estratégia de memória de conversa.
15. Estratégia de Voz de Marca.
16. Estratégia de Aprendizado Adaptativo de Estilo.
17. Estratégia para IndexedDB, armazenamento do modelo local e dados sincronizados.
18. Estratégia de privacidade e consentimento.
19. Estratégia de erros, timeout, cancelamento e indisponibilidade dos provedores.
20. Estratégia de observabilidade sem armazenar conteúdo sensível.
21. Estratégia futura para o corpus das 1.000 headlines.
22. Fases de construção pequenas e verificáveis.
23. Critérios de aceite para cada fase.
24. Riscos, conflitos e decisões ainda pendentes.

Analise também se o MVP pode ser orquestrado apenas com Lovable Cloud e funções de backend ou se existe uma necessidade real de um serviço externo como LangGraph.

Não escolha LangGraph apenas porque ele aparece no documento.

Compare:

- Lovable Cloud;
- serviço externo de orquestração;
- arquitetura híbrida.

Considere simplicidade, manutenção, paralelismo, duração das execuções, retomada após falha, observabilidade, segurança e custo.

Formato da resposta

Organize a resposta em:

1. Entendimento do produto.
2. Decisões arquiteturais recomendadas.
3. Riscos e pontos que precisam de validação.
4. Arquitetura proposta.
5. Plano de fases.
6. Critérios de aceite.
7. Informações que ainda precisarei fornecer.
8. Recomendação do conteúdo que deverá entrar no Project Knowledge.

Não implemente nada.

Ao terminar, aguarde minha revisão pelo chat antes de gerar ou executar qualquer plano de implementação.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/4aa33891-0e15-49f2-b573-0dd401cf3601).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
