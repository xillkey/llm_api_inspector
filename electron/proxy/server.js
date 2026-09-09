import http from 'node:http';
import { BrowserWindow } from 'electron';
import {
  createRequest,
  extractModelFromRequestJson,
  getAllowLan,
  getInspectEnabled,
  getProxyPort,
  getUpstreamBaseUrl,
  updateRequest,
} from '../store/repo.js';
import { StreamAssembler } from './assembler.js';
import { SSEParser, decodeChunk } from './sse.js';

let server = null;
let currentPort = null;
let currentBindHost = null;
let proxyStartError = null;

function getBindHost() {
  return getAllowLan() ? '0.0.0.0' : '127.0.0.1';
}

function buildBaseUrl(port, allowLan) {
  if (allowLan) return `http://0.0.0.0:${port}/v1`;
  return `http://127.0.0.1:${port}/v1`;
}

function getMainWindow() {
  return BrowserWindow.getAllWindows()[0] ?? null;
}

function broadcast(channel, payload) {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload);
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function buildUpstreamUrl(baseUrl, reqPath) {
  const base = baseUrl.replace(/\/+$/, '');
  const path = reqPath.startsWith('/') ? reqPath : `/${reqPath}`;
  const suffix = path.startsWith('/v1/') ? path.slice('/v1'.length) : path;

  if (base.endsWith(path) || base.endsWith(suffix)) {
    return base;
  }
  return `${base}${suffix}`;
}

function buildUpstreamHeaders(clientHeaders) {
  const headers = { ...clientHeaders };
  delete headers.host;
  delete headers.connection;
  delete headers['content-length'];
  return headers;
}

function rejectBadRequest(res, message) {
  res.writeHead(400, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      error: {
        message,
        type: 'invalid_request_error',
      },
    })
  );
}

function rejectNoUpstream(res) {
  res.writeHead(502, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      error: {
        message: 'Upstream base URL not configured. Set it in Settings.',
      },
    })
  );
}

function createDeltaEmitter(requestId) {
  let pending = { contentDelta: '', reasoningDelta: '', toolCalls: null };
  let timer = null;

  const flush = () => {
    if (!pending.contentDelta && !pending.reasoningDelta && !pending.toolCalls) return;
    broadcast('request:delta', {
      id: requestId,
      contentDelta: pending.contentDelta,
      reasoningDelta: pending.reasoningDelta,
      toolCalls: pending.toolCalls,
    });
    pending = { contentDelta: '', reasoningDelta: '', toolCalls: null };
    timer = null;
  };

  return {
    push(contentDelta = '', reasoningDelta = '', toolCalls = null) {
      pending.contentDelta += contentDelta;
      pending.reasoningDelta += reasoningDelta;
      if (toolCalls) pending.toolCalls = toolCalls;
      if (!timer) {
        timer = setTimeout(flush, 50);
      }
    },
    flush,
    stop() {
      if (timer) clearTimeout(timer);
      flush();
    },
  };
}

function getToolCallsSnapshot(assembler) {
  return [...assembler.toolCalls.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, tc]) => ({
      index,
      id: tc.id,
      type: tc.type,
      name: tc.function.name,
      arguments: tc.function.arguments,
    }));
}

function applyUpstreamHeaders(upstreamResponse, res) {
  res.statusCode = upstreamResponse.status;
  for (const [key, value] of upstreamResponse.headers.entries()) {
    if (key === 'transfer-encoding') continue;
    res.setHeader(key, value);
  }
}

async function forwardStreamResponse(upstreamResponse, res, clientClosed) {
  const contentType = upstreamResponse.headers.get('content-type') || 'application/json';
  res.setHeader(
    'Content-Type',
    contentType.includes('text/event-stream') ? contentType : 'text/event-stream; charset=utf-8'
  );
  if (!res.headersSent) res.writeHead(upstreamResponse.status);

  if (!upstreamResponse.body) {
    throw new Error('Upstream returned empty stream body');
  }

  for await (const chunk of upstreamResponse.body) {
    if (clientClosed) break;
    res.write(Buffer.from(chunk));
  }
  if (!clientClosed) res.end();
}

function parseRequestBody(bodyBuffer) {
  try {
    return JSON.parse(bodyBuffer.toString('utf8'));
  } catch {
    return null;
  }
}

async function handleChatCompletion(req, res, bodyBuffer, upstreamBaseUrl) {
  const requestBody = parseRequestBody(bodyBuffer);
  if (!requestBody) {
    rejectBadRequest(res, 'Invalid JSON body');
    return;
  }

  const isStream = Boolean(requestBody.stream);
  const inspect = getInspectEnabled();
  const model = requestBody.model || extractModelFromRequestJson(bodyBuffer.toString('utf8'));

  let record = null;
  if (inspect) {
    record = createRequest({
      model,
      path: req.url,
      is_stream: isStream,
      request_json: bodyBuffer.toString('utf8'),
    });
    broadcast('request:created', record);
  }

  const abortController = new AbortController();
  let clientClosed = false;

  req.on('close', () => {
    clientClosed = true;
    abortController.abort();
  });

  const upstreamUrl = buildUpstreamUrl(upstreamBaseUrl, req.url);
  const upstreamHeaders = buildUpstreamHeaders(req.headers);

  let upstreamResponse;
  try {
    upstreamResponse = await fetch(upstreamUrl, {
      method: req.method,
      headers: upstreamHeaders,
      body: bodyBuffer,
      signal: abortController.signal,
    });
  } catch (err) {
    const state = clientClosed || err.name === 'AbortError' ? 'aborted' : 'error';
    if (record) {
      const updated = updateRequest(record.id, {
        state,
        http_status: 0,
        ended_at: new Date().toISOString(),
        error: err.message,
      });
      broadcast('request:updated', updated);
    }
    if (!clientClosed && !res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: err.message } }));
    }
    return;
  }

  applyUpstreamHeaders(upstreamResponse, res);

  if (!inspect) {
    try {
      if (!isStream) {
        const responseBuffer = Buffer.from(await upstreamResponse.arrayBuffer());
        res.end(responseBuffer);
      } else {
        await forwardStreamResponse(upstreamResponse, res, clientClosed);
      }
    } catch (err) {
      if (!clientClosed && !res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: err.message } }));
      }
    }
    return;
  }

  const contentType = upstreamResponse.headers.get('content-type') || 'application/json';

  if (!isStream) {
    const responseBuffer = Buffer.from(await upstreamResponse.arrayBuffer());
    const upstreamResponseJson = responseBuffer.toString('utf8');

    try {
      const parsed = JSON.parse(upstreamResponseJson);
      const usage = parsed.usage || {};
      const updated = updateRequest(record.id, {
        state: upstreamResponse.ok ? 'done' : 'error',
        http_status: upstreamResponse.status,
        ended_at: new Date().toISOString(),
        prompt_tokens: usage.prompt_tokens ?? null,
        completion_tokens: usage.completion_tokens ?? null,
        response_json: upstreamResponseJson,
        error: upstreamResponse.ok ? null : parsed.error?.message || parsed.message || 'Upstream error',
      });
      broadcast('request:updated', updated);
    } catch {
      const updated = updateRequest(record.id, {
        state: upstreamResponse.ok ? 'done' : 'error',
        http_status: upstreamResponse.status,
        ended_at: new Date().toISOString(),
        response_json: upstreamResponseJson,
        error: upstreamResponse.ok ? null : 'Invalid upstream JSON',
      });
      broadcast('request:updated', updated);
    }
    res.end(responseBuffer);
    return;
  }

  const streaming = updateRequest(record.id, { state: 'streaming', http_status: upstreamResponse.status });
  broadcast('request:updated', streaming);

  const assembler = new StreamAssembler();
  const parser = new SSEParser();
  const deltaEmitter = createDeltaEmitter(record.id);
  const rawParts = [];
  let firstTokenAt = null;

  try {
    if (!upstreamResponse.body) {
      throw new Error('Upstream returned empty stream body');
    }

    res.setHeader('Content-Type', contentType.includes('text/event-stream') ? contentType : 'text/event-stream; charset=utf-8');
    if (!res.headersSent) res.writeHead(upstreamResponse.status);

    for await (const chunk of upstreamResponse.body) {
      if (clientClosed) break;

      const bufferChunk = Buffer.from(chunk);
      rawParts.push(bufferChunk);
      res.write(bufferChunk);

      const text = decodeChunk(bufferChunk);
      const events = parser.feed(text);
      for (const event of events) {
        if (event.done) continue;
        if (!firstTokenAt) {
          firstTokenAt = new Date().toISOString();
          updateRequest(record.id, { first_token_at: firstTokenAt });
        }

        const beforeContent = assembler.content;
        const beforeReasoning = assembler.reasoning;
        assembler.applyChunk(event.json);
        const toolCalls = assembler.toolCalls.size ? getToolCallsSnapshot(assembler) : null;
        deltaEmitter.push(
          assembler.content.slice(beforeContent.length),
          assembler.reasoning.slice(beforeReasoning.length),
          toolCalls
        );
      }
    }

    for (const event of parser.flush()) {
      if (!event.done && event.json) {
        assembler.applyChunk(event.json);
      }
    }

    deltaEmitter.stop();

    const responseObject = assembler.toResponseObject();
    const usage = responseObject.usage || {};
    const state = clientClosed ? 'aborted' : upstreamResponse.ok ? 'done' : 'error';

    const updated = updateRequest(record.id, {
      state,
      http_status: upstreamResponse.status,
      ended_at: new Date().toISOString(),
      first_token_at: firstTokenAt,
      prompt_tokens: usage.prompt_tokens ?? null,
      completion_tokens: usage.completion_tokens ?? null,
      response_json: JSON.stringify(responseObject),
      raw_sse: Buffer.concat(rawParts).toString('utf8'),
      error: upstreamResponse.ok ? null : 'Upstream stream error',
    });
    broadcast('request:updated', updated);
  } catch (err) {
    deltaEmitter.stop();
    const state = clientClosed || err.name === 'AbortError' ? 'aborted' : 'error';
    const updated = updateRequest(record.id, {
      state,
      http_status: upstreamResponse?.status ?? 0,
      ended_at: new Date().toISOString(),
      response_json: JSON.stringify(assembler.toResponseObject()),
      raw_sse: rawParts.length ? Buffer.concat(rawParts).toString('utf8') : null,
      error: err.message,
    });
    broadcast('request:updated', updated);
  }
  if (!clientClosed) res.end();
}

async function handlePassthrough(req, res, bodyBuffer, upstreamBaseUrl) {
  const upstreamUrl = buildUpstreamUrl(upstreamBaseUrl, req.url);
  const upstreamHeaders = buildUpstreamHeaders(req.headers);

  const abortController = new AbortController();
  let clientClosed = false;
  req.on('close', () => {
    clientClosed = true;
    abortController.abort();
  });

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: req.method,
      headers: upstreamHeaders,
      body: bodyBuffer.length ? bodyBuffer : undefined,
      signal: abortController.signal,
    });

    applyUpstreamHeaders(upstreamResponse, res);

    if (upstreamResponse.body) {
      for await (const chunk of upstreamResponse.body) {
        if (clientClosed) break;
        res.write(Buffer.from(chunk));
      }
    }
    if (!clientClosed) res.end();
  } catch (err) {
    if (!clientClosed && !res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: err.message } }));
    }
  }
}

async function handleRequest(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': '*',
    });
    res.end();
    return;
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  const upstreamBaseUrl = getUpstreamBaseUrl();
  if (!upstreamBaseUrl) {
    rejectNoUpstream(res);
    return;
  }

  const bodyBuffer = ['POST', 'PUT', 'PATCH'].includes(req.method || '')
    ? await readBody(req)
    : Buffer.alloc(0);

  if (req.url?.startsWith('/v1/chat/completions') && req.method === 'POST') {
    await handleChatCompletion(req, res, bodyBuffer, upstreamBaseUrl);
    return;
  }

  await handlePassthrough(req, res, bodyBuffer, upstreamBaseUrl);
}

export function startProxyServer(port = getProxyPort()) {
  const bindHost = getBindHost();
  return new Promise((resolve, reject) => {
    if (server && currentPort === port && currentBindHost === bindHost) {
      proxyStartError = null;
      resolve({ port: currentPort, bindHost: currentBindHost });
      return;
    }

    stopProxyServer()
      .catch(() => {})
      .finally(() => {
        server = http.createServer((req, res) => {
          handleRequest(req, res).catch((err) => {
            if (!res.headersSent) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: { message: err.message } }));
            }
          });
        });

        server.on('error', (err) => {
          proxyStartError = err.message;
          reject(err);
        });
        server.listen(port, bindHost, () => {
          proxyStartError = null;
          currentPort = port;
          currentBindHost = bindHost;
          resolve({ port, bindHost });
        });
      });
  });
}

export function stopProxyServer() {
  return new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    server.close(() => {
      server = null;
      currentPort = null;
      currentBindHost = null;
      resolve();
    });
  });
}

export function getProxyStatus() {
  const port = currentPort ?? getProxyPort();
  const allowLan = getAllowLan();
  const bindHost = currentBindHost ?? getBindHost();
  return {
    running: Boolean(server),
    port,
    bindHost,
    allowLan,
    inspectEnabled: getInspectEnabled(),
    error: proxyStartError,
    baseUrl: buildBaseUrl(port, allowLan),
    localBaseUrl: `http://127.0.0.1:${port}/v1`,
    upstreamBaseUrl: getUpstreamBaseUrl(),
  };
}

export async function testUpstreamConnection(baseUrl) {
  const url = buildUpstreamUrl(baseUrl, '/v1/models');
  const response = await fetch(url, { method: 'GET' });
  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    body: text.slice(0, 500),
    needsAuth: response.status === 401 || response.status === 403,
  };
}
