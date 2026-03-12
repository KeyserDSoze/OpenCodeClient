# OpenCode Client Implementation Spec

## Goal

Implementare ed estendere un client web React per `opencode serve` che funzioni interamente nel browser, sia deployabile su GitHub Pages e supporti sessioni, chat, streaming SSE e strumenti API avanzati.

## Current Baseline

Il repository contiene gia una base funzionante con:

- setup server con Basic Auth
- health check
- lista sessioni
- chat con messaggi
- provider OAuth
- stream SSE
- metadata workspace (project, path, vcs, agents)
- API tools per `find`, `file/content`, `command`, `shell`
- toggle tra invio sync e async

File principali:

- `src/App.tsx`
- `src/api/opencode.ts`
- `src/storage/config.ts`
- `src/components/Chat.tsx`
- `src/components/ApiTools.tsx`
- `src/components/SessionList.tsx`
- `src/types/opencode.ts`
- `OPENCODE_API_AI_SPEC.md`

## Required Stack

- React
- TypeScript
- Vite
- fetch API
- SSE via readable stream (`fetch` + `text/event-stream`)
- localStorage

## Functional Areas

### 1. Server Setup

Implementare un form con:

- server URL
- username
- password

Persistenza locale:

- `opencode_server_config`

### 2. Session Management

Supportare:

- `GET /session`
- `POST /session`
- `GET /session/status`
- `GET /session/{id}`
- `DELETE /session/{id}`
- `POST /session/{id}/fork`
- `POST /session/{id}/abort`

### 3. Chat

Supportare:

- `GET /session/{id}/message`
- `POST /session/{id}/message`
- `POST /session/{id}/prompt_async`

Il composer deve supportare override per singolo prompt di:

- `agent`
- `model`
- `tools`

La chat deve permettere il toggle tra:

- sync reply
- async SSE

Persistenza locale:

- `opencode_last_session`
- `opencode_prompt_mode`
- `opencode_selected_agent`
- `opencode_selected_model`
- `opencode_selected_tools`

### 4. Real-Time Updates

Gestire stream eventi da:

- `GET /event`
- fallback `GET /global/event`

Aggiornare UI su eventi come:

- `server.connected`
- `session.updated`
- `message.created`
- `message.updated`
- `tool.executed`

### 5. Workspace Metadata

Caricare e mostrare:

- `GET /project`
- `GET /project/current`
- `GET /path`
- `GET /vcs`
- `GET /agent`

### 6. Providers

Caricare e fondere i dati provenienti da:

- `GET /config/providers`
- `GET /provider`
- `GET /provider/auth`
- `POST /provider/{id}/oauth/authorize`

### 7. API Tools

Implementare una vista strumenti con:

- `GET /find?pattern=`
- `GET /find/file?query=`
- `GET /file/content?path=`
- `POST /session/{id}/command`
- `POST /session/{id}/shell`

### 8. Deploy

Preparare sia:

- script manuale `npm run deploy`
- workflow GitHub Actions per Pages

Supportare anche custom domain futuro con `public/CNAME`.

## Architecture Guidance

### App State

Tenere in `src/App.tsx` lo stato alto livello:

- config server
- stato connessione
- sessioni
- sessione selezionata
- messaggi
- stream state
- provider
- metadata workspace
- prompt mode

### API Layer

Tenere in `src/api/opencode.ts`:

- request helpers
- Basic Auth header builder
- fallback endpoint logic
- normalizzazione payload API
- subscribeToEvents

### Components

Usare componenti separati per:

- setup/config form
- session list/sidebar
- chat/message composer
- api tools
- message renderer

## Implementation Tasks

1. leggere `OPENCODE_API_AI_SPEC.md`
2. verificare i tipi in `src/types/opencode.ts`
3. aggiungere o estendere gli helper API necessari
4. mantenere compatibilita con risposte parziali o shape diverse
5. usare fallback per endpoint che variano tra versioni server
6. aggiornare la UI senza introdurre backend
7. mantenere layout responsive desktop/mobile
8. eseguire build finale con `npm run build`

## Coding Rules

- usare TypeScript strict-safe
- evitare dipendenze inutili
- usare solo `fetch`, niente backend
- salvare solo configurazioni client-safe in localStorage
- non introdurre segreti hardcoded
- mantenere UI leggibile anche con output lunghi

## Acceptance Criteria

La feature e completa quando:

- il client si connette a un server OpenCode reale
- la health check passa
- le sessioni vengono lette e create correttamente
- la chat funziona sia in sync sia in async
- agent e model possono essere selezionati dal composer e persistono localmente
- i tools possono essere selezionati dal composer e persistono localmente
- gli eventi SSE aggiornano la UI
- la sidebar mostra project/path/vcs/agents/providers
- API Tools eseguono find, file content, slash command e shell
- il repository e pronto per deploy automatico su GitHub Pages
- `npm run build` termina senza errori

## Suggested Next Enhancements

Implementare dopo il baseline:

- selector modello e agent per singolo prompt
- fork session dalla UI
- viewer OpenAPI `/doc`
- explorer file/workspace
- pannello log server/client
- cronologia comandi tool

## Prompt Template For Another LLM

```text
Read `OPENCODE_API_AI_SPEC.md` and `OPENCODE_CLIENT_IMPLEMENTATION_SPEC.md`.
Use the existing React/Vite codebase as baseline.
Do not add a backend.
Extend the current client without rewriting working features.
Keep TypeScript strict, preserve GitHub Pages compatibility, and run the production build at the end.
```
