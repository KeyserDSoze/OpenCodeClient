# OpenCode Remote Web Client

## Goal

Creare una web app React deployabile su GitHub Pages che si colleghi direttamente a un server `opencode serve` via HTTP Basic Auth, senza backend intermedio.

## Stack

- React
- TypeScript
- Vite
- `fetch` per REST API
- SSE via `fetch` streaming per poter inviare anche header `Authorization`
- `localStorage` per persistenza locale

## Core UX

1. Setup iniziale con `Server URL`, `Username`, `Password`
2. Verifica `GET /global/health`
3. Caricamento sessioni da `GET /session`
4. Apertura sessione e caricamento messaggi
5. Invio prompt a una sessione esistente o nuova
6. Aggiornamento UI in tempo reale via `GET /event`
7. Vista provider con avvio OAuth tramite `POST /provider/{id}/oauth/authorize`

## Storage Keys

- `opencode_server_config`
- `opencode_sessions_cache`
- `opencode_last_session`

## Endpoint Supportati

- `GET /global/health`
- `GET /session`
- `POST /session`
- `DELETE /session/:id`
- `GET /session/:id/message` con fallback a `GET /session/:id/messages`
- `POST /session/:id/message` con fallback a `POST /session/:id/prompt`
- `GET /config/providers`
- `POST /provider/{id}/oauth/authorize`
- `GET /event` con fallback a `GET /global/event`

## UI Sections

- Setup page
- Header con stato server, versione e stato stream
- Sidebar con sessioni, provider e ultimi eventi
- Chat pane con cronologia, reload e composer

## Deployment

- `npm run build`
- `npm run deploy`
- Vite configurato con `base: "./"` per GitHub Pages

## Server Notes

Esempio avvio server:

```bash
OPENCODE_SERVER_PASSWORD=secret opencode serve --hostname 0.0.0.0 --port 4096 --cors https://username.github.io
```

Consultare `http://SERVER:4096/doc` per la spec OpenAPI pubblicata dal server.
