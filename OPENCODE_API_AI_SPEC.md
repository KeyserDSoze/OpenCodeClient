# OpenCode Server API (AI-Friendly Specification)

## Overview

OpenCode exposes an HTTP API for programmatic access.

The API allows clients to:

- manage sessions
- send messages to agents
- interact with files
- run commands
- monitor events
- authenticate providers
- access project information

Base URL:

```text
http://<hostname>:<port>
```

Example:

```text
http://localhost:4096
```

OpenAPI spec is available at:

```text
GET /doc
```

Example:

```text
http://localhost:4096/doc
```

---

# Authentication

OpenCode server uses HTTP Basic Authentication.

Header format:

```http
Authorization: Basic base64(username:password)
```

Example:

```http
Authorization: Basic b3BlbmNvZGU6cGFzc3dvcmQ=
```

Default username:

```text
opencode
```

---

# Event Streaming

OpenCode provides Server Sent Events (SSE).

Endpoint:

```text
GET /event
```

This stream emits events such as:

```text
server.connected
message.created
message.updated
session.updated
tool.executed
```

Example client (JavaScript):

```javascript
const eventSource = new EventSource(`${server}/event`);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data);
};
```

---

# Global APIs

## Health Check

Check server status.

```text
GET /global/health
```

Response:

```json
{
  "healthy": true,
  "version": "0.5.0"
}
```

---

## Global Events

```text
GET /global/event
```

Returns:

```text
Server Sent Events stream
```

---

# Project APIs

## List Projects

```text
GET /project
```

Response:

```json
[
  {
    "id": "project_1",
    "name": "example-project",
    "path": "/workspace/example"
  }
]
```

---

## Current Project

```text
GET /project/current
```

Response:

```json
{
  "id": "project_1",
  "name": "example-project"
}
```

---

# Path & VCS APIs

## Current Path

```text
GET /path
```

Response:

```json
{
  "root": "/workspace/project"
}
```

---

## VCS Info

```text
GET /vcs
```

Response:

```json
{
  "branch": "main",
  "dirty": false
}
```

---

# Config APIs

## Get Config

```text
GET /config
```

Returns server configuration.

---

## Update Config

```text
PATCH /config
```

Body example:

```json
{
  "defaultModel": "gpt-4o"
}
```

---

## List Providers

```text
GET /config/providers
```

Response:

```json
{
  "providers": [
    {
      "id": "openai",
      "models": ["gpt-4o", "gpt-4.1"]
    }
  ],
  "default": {
    "openai": "gpt-4o"
  }
}
```

---

# Provider APIs

## List Providers

```text
GET /provider
```

Response:

```json
{
  "all": ["openai", "anthropic"],
  "connected": ["openai"],
  "default": {
    "openai": "gpt-4o"
  }
}
```

---

## Provider Authentication Methods

```text
GET /provider/auth
```

Response:

```json
{
  "openai": ["oauth", "apikey"]
}
```

---

## Start OAuth Login

```text
POST /provider/{id}/oauth/authorize
```

Example:

```text
POST /provider/openai/oauth/authorize
```

Response:

```json
{
  "url": "https://provider-login-url"
}
```

Client should open this URL in browser.

---

## OAuth Callback

```text
POST /provider/{id}/oauth/callback
```

Returns:

```json
true
```

---

# Session APIs

Sessions represent conversations with an agent.

---

## List Sessions

```text
GET /session
```

Response:

```json
[
  {
    "id": "session_123",
    "title": "Refactor backend"
  }
]
```

---

## Create Session

```text
POST /session
```

Body:

```json
{
  "title": "New Session"
}
```

Response:

```json
{
  "id": "session_abc"
}
```

---

## Session Status

```text
GET /session/status
```

Response:

```json
{
  "session_abc": "running"
}
```

---

## Get Session

```text
GET /session/{id}
```

Example:

```text
GET /session/session_abc
```

---

## Delete Session

```text
DELETE /session/{id}
```

Response:

```json
true
```

---

## Fork Session

```text
POST /session/{id}/fork
```

Body:

```json
{
  "messageID": "msg123"
}
```

Creates a new branch session.

---

## Abort Session

```text
POST /session/{id}/abort
```

Stops a running agent.

---

# Message APIs

Messages represent interactions with the AI.

---

## List Messages

```text
GET /session/{id}/message
```

Example:

```text
GET /session/session_abc/message
```

Response:

```json
[
  {
    "info": {
      "id": "msg1",
      "role": "user"
    },
    "parts": [
      {
        "type": "text",
        "text": "Hello"
      }
    ]
  }
]
```

---

## Send Message

```text
POST /session/{id}/message
```

Body:

```json
{
  "parts": [
    {
      "type": "text",
      "text": "Write a Python sorting function"
    }
  ]
}
```

Optional fields:

```json
{
  "model": "gpt-4o",
  "agent": "coder",
  "tools": []
}
```

Response:

```json
{
  "info": {
    "id": "msg2"
  },
  "parts": [
    {
      "type": "text",
      "text": "Here is a Python function..."
    }
  ]
}
```

---

## Async Message

```text
POST /session/{id}/prompt_async
```

Same body as `/message`.

Returns:

```text
204 No Content
```

Use `/event` stream for response.

---

## Execute Slash Command

```text
POST /session/{id}/command
```

Body:

```json
{
  "command": "/test",
  "arguments": []
}
```

---

## Run Shell Command

```text
POST /session/{id}/shell
```

Body:

```json
{
  "command": "ls -la",
  "agent": "coder"
}
```

---

# File APIs

## Search in Files

```text
GET /find?pattern=<pattern>
```

Example:

```text
GET /find?pattern=TODO
```

Response:

```json
[
  {
    "path": "src/app.ts",
    "line_number": 12,
    "lines": "TODO: refactor"
  }
]
```

---

## Find Files

```text
GET /find/file?query=<query>
```

Example:

```text
GET /find/file?query=app
```

Response:

```json
[
  "src/app.ts",
  "src/app.test.ts"
]
```

---

## Read File

```text
GET /file/content?path=<path>
```

Example:

```text
GET /file/content?path=src/app.ts
```

Response:

```json
{
  "content": "console.log('hello');"
}
```

---

# Agent APIs

## List Agents

```text
GET /agent
```

Response:

```json
[
  {
    "id": "coder",
    "description": "Coding agent"
  }
]
```

---

# Logging API

Write a log entry.

```text
POST /log
```

Body:

```json
{
  "service": "client",
  "level": "info",
  "message": "User opened session"
}
```

---

# Docs API

Get API specification.

```text
GET /doc
```

Returns OpenAPI documentation.

---

# Recommended Client Workflow

Typical client flow:

```text
1 connect to server
2 check health
3 list sessions
4 create or open session
5 send message
6 listen to event stream
7 display response
```

Example sequence:

```text
GET /global/health
GET /session
POST /session
POST /session/{id}/message
GET /event
```

---

# End of Specification
