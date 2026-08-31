<p align="center">
  <img src="renderer/imgs/logo.png" alt="LLM API Inspector logo" width="160">
</p>

<h1 align="center">LLM API Inspector</h1>

<p align="center">English | <a href="README_CN.md">简体中文</a></p>

LLM API Inspector is a proxy and traffic viewer for LLM APIs. It exposes an OpenAI-compatible `/v1/chat/completions` endpoint, records the full request parameters, tool definitions and streaming responses, and lets you watch in-flight requests live.

## Screenshots

<p align="center">
  <img src="docs/screenshots/chat-view.png" alt="Conversation view" width="800">
  <br>
  <img src="docs/screenshots/overview.png" alt="Request overview" width="800">
</p>

## Features

- Works out of the box, no tedious dependency setup
- OpenAI-compatible proxy (chat/completions)
- Supports both streaming and non-streaming requests
- Inspect messages, registered tools and sampling parameters
- Live view of the model's reasoning and answer as they arrive
- Configurable upstream Base URL
- Local history persisted in SQLite

## Getting Started

1. Launch the app
2. Open **Settings**, fill in the **upstream Base URL** (for example `https://api.openai.com/v1`) and save
3. Point your client at the proxy address, using your real **model** and **API key** (the same ones you would use when calling upstream directly):

```bash
export OPENAI_BASE_URL=http://127.0.0.1:8317/v1
export OPENAI_API_KEY=your-upstream-api-key
```

4. Call Chat Completions as usual — the request shows up in the list on the left

The proxy forwards requests to the upstream service as-is; headers such as `Authorization` are passed through untouched. It only relays and captures traffic.

The **Connection Info** panel on the left shows the proxy Base URL and the current upstream address. You can also change the listening port and toggle LAN access in Settings.

## Examples

Non-streaming:

```bash
curl http://127.0.0.1:8317/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer your-upstream-api-key' \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "hello"}]
  }'
```

Streaming:

```bash
curl http://127.0.0.1:8317/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer your-upstream-api-key' \
  -d '{
    "model": "gpt-4o",
    "stream": true,
    "messages": [{"role": "user", "content": "hello"}]
  }'
```

## Development

### Requirements

- Node.js 22.x (an `.nvmrc` is included)
- macOS / Windows / Linux

```bash
nvm use
npm install
```

If downloading the Electron binary fails, try a mirror:

```bash
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm install
```

### Running in development

```bash
npm start
```

Verify the built-in SQLite module:

```bash
npm run verify:sqlite
```

### Building

```bash
npm run build
```

Platform-specific:

```bash
npm run build:mac
npm run build:win
npm run build:linux
```

### Project structure

```
electron/     main process, proxy, SQLite
renderer/     plain HTML/CSS/JS UI
```

## Security Notes

- The proxy listens on `127.0.0.1` only by default (enable **Settings → Proxy Access → Allow LAN connections** to change this)
- With LAN access enabled it listens on `0.0.0.0`, so devices on the same network can reach it via this machine's LAN IP
- Client headers such as `Authorization` are forwarded to the upstream service; the proxy does not manage API keys itself
