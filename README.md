# Nutricionist AI

Plataforma **educativa** de nutrição com inteligência artificial, em português do Brasil, com **banco de dados local (IndexedDB)** e funcionamento offline para tudo o que não depende da IA.

> ⚠️ O Nutricionist AI não é um serviço de saúde. As informações são educativas, as estimativas são aproximadas e nada substitui a avaliação de um(a) nutricionista ou médico(a).

## Funcionalidades

| Área | O que funciona |
| --- | --- |
| **Contas locais** | Cadastro, login, sessão, logout, edição de perfil, troca de senha. Senhas com **PBKDF2-SHA256 (310 mil iterações) + sal**, comparação em tempo constante, bloqueio de 5 min após 5 tentativas erradas. |
| **Recuperação de senha** | Por **código de recuperação local** exibido uma única vez no cadastro (guardado só como hash). Não há envio de e-mail — veja “Limitações”. |
| **Consentimento (LGPD)** | Consentimento obrigatório para o tratamento local; consentimento **separado e revogável** para envio de dados à IA e para usar o perfil no chat. |
| **Questionário** | 17 etapas com barra de progresso, voltar/pular, salvamento a cada etapa, edição posterior. Avisos para menores de idade, gestação/amamentação, histórico de transtorno alimentar e condições clínicas (sem metas restritivas nesses casos). |
| **Perfil nutricional** | TMB (Mifflin-St Jeor) e gasto diário **identificados como estimativas**, faixa calórica orientativa com déficit/superávit moderado (nunca abaixo da TMB), proteína e água orientativas, IMC com ressalvas. |
| **Plano alimentar** | Gerado **por regras locais** (offline) ou **com IA** (opcional, com pedido de personalização). Refeições marcáveis como concluídas, substituições, lista de compras, receitas, hidratação/sono/atividade, metas semanais e hábitos. |
| **Analisar comida (foto)** | Câmera ao vivo ou galeria, pré-visualização, **recorte**, refazer foto, dicas de porção/marca, análise por IA de visão, **confirmação/correção** dos itens (candidatos quando há dúvida, busca na base, rótulos), edição de porções e só então o cálculo. |
| **Tabela nutricional** | Foto ao lado (desktop) ou acima (celular). kcal e kJ, carboidratos, açúcares totais/adicionados, proteínas, gorduras totais/saturadas/trans/mono/poli, fibras, sódio, colesterol, potássio, cálcio, ferro; alternância **porção / 100 g**; %VD (IN ANVISA 75/2020) só onde há referência; **origem de cada valor** (rótulo, base, estimativa IA, manual); “não disponível” quando não há dado (nada é inventado). |
| **Diário** | Café, almoço, lanche, jantar e outras; foto, nome, horário, porções e nutrientes; adicionar manualmente, editar, duplicar, excluir, navegar por datas; totais diários (incl. fibras e sódio). Uma análise de foto gera no máximo **uma** refeição (sem contagem dupla). |
| **Dashboard** | Saudação, resumo do dia, anel de calorias (ocultável), barras e rosca de macros, refeições recentes com miniaturas, hábitos do dia, água, consistência semanal, atalho para o analisador e sugestão do dia. |
| **Progresso** | Peso opcional (desativável) com gráfico por registro/semana/mês, medidas corporais, histórico de refeições e nutrientes, **comparação entre períodos**, hábitos com meta semanal, exportação. |
| **Chat com IA** | Sugestões de perguntas, histórico local por conversa, limpar histórico, uso opcional do perfil, avisos educativos. Sem IA configurada, nada é simulado. |
| **Receitas** | 12 receitas com ilustração, ingredientes, preparo, tempo, porções, **estimativa nutricional calculada da base TACO**, filtros (preferência, tempo, ingredientes, favoritas), adicionar à lista de compras, registrar 1 porção no diário. |
| **Lista de compras** | Listas semanais, categorias, quantidades e preço opcional (R$), marcar comprados, editar/remover, integração com plano e receitas. |
| **Lembretes** | Refeições, água, planejamento, hábitos e pausas, com horários/intervalos e dias; pedem permissão de notificação. |
| **Privacidade e dados** | Consentimentos, contagem de registros e uso de armazenamento, armazenamento persistente, **exportação JSON** (com ou sem fotos), excluir fotos, conversas e **todos os dados/conta**. |
| **Experiência** | Responsivo (barra inferior no celular, menu lateral no desktop), tema claro/escuro/sistema, estados de carregamento, vazios, erros e confirmações, foco visível, rótulos ARIA, `prefers-reduced-motion`, PWA instalável com service worker offline. |

## Arquitetura

```
server/                 Backend intermediário (Node) — guarda a chave da IA, nunca o navegador
  index.ts              HTTP: /api/health, /api/ai/analyze-image, /api/ai/plan, /api/ai/chat; serve dist/ em produção
  ai.ts                 Integração com Claude (Anthropic SDK): prompts com regras de segurança, JSON Schema + validação Zod
src/
  db/                   Persistência (IndexedDB via idb)
    types.ts            Entidades
    index.ts            Abertura do banco + migrações versionadas
    repo.ts             Repositório: todas as leituras/escritas, exportação e exclusão
  lib/                  Lógica pura (testável): nutrition, foods (TACO), recipes, planGenerator, crypto, validation, image, date
  services/             auth (contas locais), ai (cliente /api), plans, openFoodFacts (rótulos), reminders
  context/              Estado da sessão/configurações e notificações (toasts)
  components/           UI reutilizável: ui, charts (SVG), NutritionTable, FoodPicker, MealEditor, ImageCapture, Layout
  pages/                As 17 telas
tests/                  Vitest + fake-indexeddb
public/                 Ícone, manifest e service worker
```

### Banco de dados (IndexedDB `nutricionist-ai`)

| Store | Conteúdo | Índices |
| --- | --- | --- |
| `users` | Conta (hash de senha e do código de recuperação) | `by_email` (único) |
| `consents`, `questionnaires`, `settings` | Consentimentos, respostas do questionário, preferências | chave = `userId` |
| `foods` | Alimentos próprios e rótulos salvos (a base TACO fica no código) | `by_user`, `by_barcode` |
| `images` | Fotos comprimidas (JPEG ≤ 1024 px, máx. 1,5 MB cada, 150 MB no total) | `by_user` |
| `analyses` | Análises de foto (itens identificados, incertezas, itens confirmados) | `by_user` |
| `meals` | Diário/histórico de refeições | `by_user`, `by_user_date` |
| `weights`, `measurements` | Peso e medidas | `by_user_date` |
| `plans`, `planChecks` | Planos e refeições marcadas | `by_user`, `by_plan_date` |
| `habits`, `habitLogs`, `water` | Hábitos, registros diários e hidratação | `by_user`, `by_user_date` |
| `chats` | Conversas com a IA | `by_user` |
| `favorites`, `shoppingLists`, `reminders` | Receitas favoritas, listas de compras, lembretes | `by_user` |

Para evoluir o esquema, incremente `DB_VERSION` em `src/db/index.ts` e adicione um bloco `if (oldVersion < N)` — os dados existentes são preservados.

### Fontes nutricionais

- **Base local**: seleção de 45 alimentos com valores por 100 g baseados na **TACO 4ª ed. (NEPA/UNICAMP, 2011)**, de uso livre com citação. Nutrientes não transcritos ficam `null` (“não disponível”). Para uso profissional, consulte a tabela oficial ou a **TBCA (USP/FoRC)**, que pode ser integrada estendendo `src/lib/foods.ts`.
- **Rótulos**: **Open Food Facts** (licença ODbL, atribuição exibida). Consulta só quando o usuário busca; o rótulo escolhido fica salvo para uso offline. O usuário também pode transcrever um rótulo manualmente.
- **Estimativas da IA**: usadas apenas para itens sem correspondência na base, sempre marcadas como “Estimativa IA”.
- **%VD**: valores diários de referência da IN ANVISA nº 75/2020 (2.000 kcal).

## Como executar

Requisitos: **Node.js 20+** (testado com 22).

```bash
npm install
cp .env.example .env      # opcional: preencha ANTHROPIC_API_KEY para ativar a IA
npm run dev               # front-end (Vite, http://localhost:5173) + API (http://localhost:8787)
```

Produção (um único processo servindo front-end e API):

```bash
npm run build
npm start                 # http://localhost:8787
```

Sem a chave, o app funciona normalmente — contas, questionário, plano por regras locais, diário, receitas, compras, progresso, hábitos, lembretes, exportação — e as telas de IA informam que ela não está configurada. **Nenhuma resposta de IA é simulada.**

### Configurar a IA

1. Crie uma chave em <https://console.anthropic.com/> e coloque em `.env`: `ANTHROPIC_API_KEY=...`
2. (Opcional) `ANTHROPIC_MODEL` — padrão `claude-opus-5-5`.
3. Reinicie o servidor. `GET /api/health` deve retornar `"ai": true`.

A chave fica **apenas no servidor** (`server/`), nunca no código do navegador. O servidor valida as requisições, limita tamanho e frequência (30/min por IP), não armazena fotos nem conversas e usa *server-side fallback* da API em caso de recusa. Em hospedagem, rode o servidor atrás de HTTPS; se o front-end estiver em outro domínio, defina `ALLOWED_ORIGIN`.

## App Android (.apk)

O app Android usa **Capacitor**: é o mesmo app web, empacotado em um WebView nativo, com recursos nativos onde o navegador é limitado:

- **Câmera e galeria nativas** (`@capacitor/camera`) no analisador de fotos.
- **Lembretes agendados no sistema** (`@capacitor/local-notifications`): chegam **mesmo com o app fechado**.
- **Exportação de dados** pelo menu de compartilhamento do Android (`@capacitor/filesystem` + `@capacitor/share`).
- **Botão voltar** do Android (fecha diálogos, depois volta de tela, depois sai), barra de status no tema do app, splash e ícone próprios.
- Banco de dados local (IndexedDB) no armazenamento privado do app.

### Gerar o APK

Requisitos: Node 20+, **JDK 21** e **Android SDK** (plataforma 36). Com o Android Studio instalado, basta:

```bash
npm install
npm run apk        # build web + cap sync + gradlew assembleDebug
# APK em android/app/build/outputs/apk/debug/app-debug.apk
```

Ou abra a pasta `android/` no Android Studio (`npx cap open android`). O workflow `.github/workflows/android.yml` também gera o APK no GitHub Actions (aba Actions → “APK Android” → artefato).

O APK gerado assim é assinado com a **chave de depuração** — serve para instalar e testar (habilite “instalar apps de fontes desconhecidas”). Para publicar na Play Store, gere um **AAB de release assinado com sua própria chave** (Android Studio → Build → Generate Signed Bundle) e guarde a chave com segurança: sem ela não é possível publicar atualizações.

### IA no app Android

No APK, a página roda em `https://localhost`, então o app precisa do endereço do servidor intermediário (`server/`), que guarda a chave da IA. Em **Perfil e configurações → Servidor de IA**, informe a URL e toque em “Salvar e testar”:

- **Produção**: hospede o servidor (`npm run build && npm start`) com HTTPS (ex.: Render, Railway, Fly.io, uma VPS) e use `https://seu-servidor`.
- **Testes na rede local**: rode `npm start` no computador e informe `http://IP-DO-COMPUTADOR:8787` (celular e computador na mesma rede Wi-Fi).

O servidor já aceita a origem do app Android (CORS para `https://localhost`). Também é possível embutir o endereço no build: `VITE_API_URL=https://seu-servidor npm run apk`.

## Testes

```bash
npm test          # Vitest: cadastro, login, bloqueio, recuperação, troca de senha, questionário, plano
                  # (restrições/veganismo/alergias), cálculos nutricionais, diário (salvar, duplicar,
                  # excluir, sem contagem dupla, validação), exportação, exclusão total e lembretes
npm run typecheck
```

### Roteiro de teste manual

1. Crie uma conta → guarde o código de recuperação → responda ao questionário.
2. Veja o perfil nutricional e o plano; marque refeições; salve a lista de compras.
3. No Diário, adicione um alimento da base TACO, edite a porção, duplique e exclua.
4. Em “Analisar comida”, escolha uma foto, recorte e use “Registrar manualmente” (ou “Analisar com IA” se configurada).
5. Ative o tema escuro, oculte calorias, configure lembretes e permita notificações.
6. Em Privacidade e dados, exporte o JSON e teste “Excluir tudo”.
7. Desconecte a internet: diário, histórico e receitas continuam funcionando (após `npm run build && npm start` e um primeiro carregamento).

## Limitações conhecidas (sem fingir que funcionam)

- **Contas locais**: existem só naquele navegador/dispositivo. Recuperação por e-mail, login em vários dispositivos e sincronização **exigem um serviço externo** (ex.: Supabase Auth, Firebase Auth, Auth0 ou um backend próprio). O ponto de integração é `src/services/auth.ts`.
- **Criptografia em repouso**: apenas senhas e códigos são protegidos (hash). Os demais dados ficam legíveis para quem tiver acesso ao perfil do navegador. Limpar os dados do site apaga tudo — exporte periodicamente.
- **Lembretes**: no navegador, só disparam com o app aberto (aba ou PWA); no **app Android** são agendados no sistema e funcionam com o app fechado.
- **Análise por foto** é estimativa: peso, óleo, ingredientes ocultos e marcas não podem ser determinados com precisão por imagem. A marca só é sugerida com evidência visível e deve ser confirmada pelo rótulo.
- A integração com a IA foi validada contra um **mock** local da API (formato da requisição, schema e tratamento de erros); com uma chave real, faça um teste de ponta a ponta antes de publicar.
- O conteúdo do servidor intermediário não é autenticado: em produção, adicione autenticação e/ou limites por usuário para evitar uso indevido da sua chave.

## Licenças e atribuições

- TACO — Tabela Brasileira de Composição de Alimentos, NEPA/UNICAMP (uso livre com citação).
- Open Food Facts — dados sob Open Database License (ODbL).
- Ícones: lucide-react (ISC).
