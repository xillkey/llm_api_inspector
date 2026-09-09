import { getDb } from './db.js';
import { decryptApiKey, encryptApiKey, maskApiKey } from './secret.js';

function rowToProvider(row) {
  if (!row) return null;
  const apiKey = decryptApiKey(row.api_key_enc);
  return {
    id: row.id,
    name: row.name,
    base_url: row.base_url,
    apiKey,
    apiKeyMasked: maskApiKey(apiKey),
    extra_headers: JSON.parse(row.extra_headers || '{}'),
    models: parseModelsJson(row.models),
    created_at: row.created_at,
  };
}

function parseModelsJson(raw) {
  try {
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr.map((m) => String(m).trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function normalizeModels(models) {
  if (!Array.isArray(models)) return [];
  return [...new Set(models.map((m) => String(m).trim()).filter(Boolean))];
}

export function parseModelsText(text) {
  return normalizeModels(String(text || '').split(/\r?\n/));
}

export function formatModelsText(models) {
  return normalizeModels(models).join('\n');
}

export function listProviders() {
  const rows = getDb().prepare('SELECT * FROM providers ORDER BY id ASC').all();
  return rows.map(rowToProvider);
}

export function getProvider(id) {
  const row = getDb().prepare('SELECT * FROM providers WHERE id = ?').get(id);
  return rowToProvider(row);
}

export function createProvider({ name, base_url, apiKey, extra_headers = {}, models = [] }) {
  const normalizedModels = normalizeModels(models);
  const result = getDb()
    .prepare(
      'INSERT INTO providers (name, base_url, api_key_enc, extra_headers, models) VALUES (?, ?, ?, ?, ?)'
    )
    .run(
      name,
      base_url.trim().replace(/\/+$/, ''),
      encryptApiKey(apiKey),
      JSON.stringify(extra_headers),
      JSON.stringify(normalizedModels)
    );

  const provider = getProvider(result.lastInsertRowid);
  if (!getSetting('router_provider_id')) {
    setSetting('router_provider_id', String(provider.id));
    if (normalizedModels.length) {
      setRouterTargetModel(normalizedModels[0]);
    }
  }
  return provider;
}

export function updateProvider(id, { name, base_url, apiKey, extra_headers, models }) {
  const existing = getProvider(id);
  if (!existing) throw new Error('Provider not found');

  const normalizedModels = models !== undefined ? normalizeModels(models) : existing.models;

  getDb()
    .prepare(
      'UPDATE providers SET name = ?, base_url = ?, api_key_enc = ?, extra_headers = ?, models = ? WHERE id = ?'
    )
    .run(
      name ?? existing.name,
      (base_url ?? existing.base_url).trim().replace(/\/+$/, ''),
      apiKey !== undefined ? encryptApiKey(apiKey) : encryptApiKey(existing.apiKey),
      JSON.stringify(extra_headers ?? existing.extra_headers),
      JSON.stringify(normalizedModels),
      id
    );

  return getProvider(id);
}

export function deleteProvider(id) {
  getDb().prepare('DELETE FROM providers WHERE id = ?').run(id);
  const routerId = getSetting('router_provider_id');
  if (routerId === String(id)) {
    deleteSetting('router_provider_id');
    deleteSetting(ROUTER_TARGET_MODEL_SETTING);
  }
}

export function getRouterProvider() {
  migrateRouterFromLegacyActiveProvider();
  const routerId = getSetting('router_provider_id');
  if (!routerId) return null;
  return getProvider(Number(routerId));
}

function migrateRouterFromLegacyActiveProvider() {
  if (!getSetting('router_provider_id') && getSetting('active_provider_id')) {
    setSetting('router_provider_id', getSetting('active_provider_id'));
  }
}

const ROUTER_PROVIDER_SETTING = 'router_provider_id';
const ROUTER_TARGET_MODEL_SETTING = 'router_target_model';

export function getRouterTargetModel() {
  return getSetting(ROUTER_TARGET_MODEL_SETTING, '');
}

export function setRouterTargetModel(model) {
  const trimmed = (model || '').trim();
  if (!trimmed) {
    deleteSetting(ROUTER_TARGET_MODEL_SETTING);
    return '';
  }
  setSetting(ROUTER_TARGET_MODEL_SETTING, trimmed);
  return trimmed;
}

export function getRouterProviderId() {
  migrateRouterFromLegacyActiveProvider();
  const id = getSetting(ROUTER_PROVIDER_SETTING, '');
  return id ? Number(id) : null;
}

export function setRouterProviderId(providerId) {
  if (!providerId) {
    deleteSetting(ROUTER_PROVIDER_SETTING);
    return null;
  }
  setSetting(ROUTER_PROVIDER_SETTING, String(providerId));
  return Number(providerId);
}

export function getRouterConfig() {
  const provider = getRouterProvider();
  const targetModel = getRouterTargetModel();
  return {
    providerId: provider?.id ?? null,
    providerName: provider?.name ?? null,
    targetModel,
  };
}

export function setRouterConfig({ providerId, targetModel }) {
  if (!providerId) {
    deleteSetting(ROUTER_PROVIDER_SETTING);
    deleteSetting(ROUTER_TARGET_MODEL_SETTING);
    return getRouterConfig();
  }

  const provider = getProvider(providerId);
  if (!provider) throw new Error('Provider not found');

  const model = (targetModel || '').trim();
  if (!model) throw new Error('Target model is required');

  if (provider.models.length && !provider.models.includes(model)) {
    throw new Error(`Model "${model}" is not in provider model list`);
  }

  setRouterProviderId(providerId);
  setRouterTargetModel(model);
  return getRouterConfig();
}

export function getSetting(key, fallback = null) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  getDb()
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value);
}

export function deleteSetting(key) {
  getDb().prepare('DELETE FROM settings WHERE key = ?').run(key);
}

export function getProxyPort() {
  return Number(getSetting('proxy_port', '8317'));
}

export function setProxyPort(port) {
  setSetting('proxy_port', String(port));
}

export function getAllowLan() {
  return getSetting('allow_lan', '0') === '1';
}

export function setAllowLan(allow) {
  setSetting('allow_lan', allow ? '1' : '0');
  return getAllowLan();
}

export function getInspectEnabled() {
  return getSetting('inspect_enabled', '1') === '1';
}

export function setInspectEnabled(enabled) {
  setSetting('inspect_enabled', enabled ? '1' : '0');
  return getInspectEnabled();
}

const PROXY_API_KEY_SETTING = 'proxy_api_key_enc';

export function getProxyApiKey() {
  const encoded = getSetting(PROXY_API_KEY_SETTING, '');
  if (!encoded) return '';
  return decryptApiKey(Buffer.from(encoded, 'base64'));
}

export function setProxyApiKey(apiKey) {
  if (!apiKey) {
    deleteSetting(PROXY_API_KEY_SETTING);
    return '';
  }
  const encoded = encryptApiKey(apiKey).toString('base64');
  setSetting(PROXY_API_KEY_SETTING, encoded);
  return getProxyApiKey();
}

export function getProxyApiKeyMasked() {
  return maskApiKey(getProxyApiKey());
}

export function isProxyAuthRequired() {
  return Boolean(getProxyApiKey());
}

const UPSTREAM_BASE_URL_SETTING = 'upstream_base_url';

export function getUpstreamBaseUrl() {
  migrateUpstreamFromLegacyProvider();
  return getSetting(UPSTREAM_BASE_URL_SETTING, '');
}

export function setUpstreamBaseUrl(url) {
  const trimmed = (url || '').trim().replace(/\/+$/, '');
  if (!trimmed) {
    deleteSetting(UPSTREAM_BASE_URL_SETTING);
    return '';
  }
  setSetting(UPSTREAM_BASE_URL_SETTING, trimmed);
  return trimmed;
}

function migrateUpstreamFromLegacyProvider() {
  if (getSetting(UPSTREAM_BASE_URL_SETTING)) return;
  const routerId = getSetting('router_provider_id');
  if (!routerId) return;
  const provider = getProvider(Number(routerId));
  if (provider?.base_url) {
    setSetting(UPSTREAM_BASE_URL_SETTING, provider.base_url);
  }
}

export function extractModelFromRequestJson(requestJson) {
  try {
    const body = JSON.parse(requestJson);
    return typeof body.model === 'string' ? body.model : null;
  } catch {
    return null;
  }
}

function extractMessagePreview(requestJson) {
  try {
    const body = JSON.parse(requestJson);
    const messages = body.messages || [];
    const userMsg = messages.find((m) => m.role === 'user') || messages[messages.length - 1];
    if (!userMsg) return '(no messages)';
    const content = typeof userMsg.content === 'string'
      ? userMsg.content
      : JSON.stringify(userMsg.content);
    return content.slice(0, 120);
  } catch {
    return '(invalid request)';
  }
}

function rowToRequestSummary(row) {
  return {
    id: row.id,
    provider_id: row.provider_id,
    provider_name: row.upstream_base_url || row.provider_name || '透传',
    upstream_base_url: row.upstream_base_url || null,
    upstream_url: row.upstream_url || null,
    model: row.model,
    path: row.path,
    is_stream: Boolean(row.is_stream),
    state: row.state,
    http_status: row.http_status,
    started_at: row.started_at,
    first_token_at: row.first_token_at,
    ended_at: row.ended_at,
    prompt_tokens: row.prompt_tokens,
    completion_tokens: row.completion_tokens,
    error: row.error,
    upstream_model: row.upstream_model,
    message_preview: row.request_json ? extractMessagePreview(row.request_json) : '',
  };
}

export function createRequest({
  model,
  path,
  is_stream,
  request_json,
  upstream_base_url = null,
  upstream_url = null,
}) {
  const startedAt = new Date().toISOString();
  const result = getDb()
    .prepare(
      'INSERT INTO requests (provider_id, model, path, is_stream, state, upstream_model, upstream_base_url, upstream_url, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      null,
      model ?? null,
      path,
      is_stream ? 1 : 0,
      'pending',
      null,
      upstream_base_url,
      upstream_url,
      startedAt
    );

  const id = result.lastInsertRowid;
  getDb()
    .prepare('INSERT INTO request_payloads (request_id, request_json) VALUES (?, ?)')
    .run(id, request_json);

  return getRequestSummary(id);
}

export function updateRequest(id, fields) {
  const allowed = [
    'state',
    'http_status',
    'first_token_at',
    'ended_at',
    'prompt_tokens',
    'completion_tokens',
    'error',
    'model',
    'upstream_model',
  ];
  const updates = [];
  const values = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      updates.push(`${key} = ?`);
      values.push(fields[key]);
    }
  }
  if (updates.length) {
    values.push(id);
    getDb().prepare(`UPDATE requests SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  if (fields.response_json !== undefined || fields.raw_sse !== undefined) {
    const payloadUpdates = [];
    const payloadValues = [];
    if (fields.response_json !== undefined) {
      payloadUpdates.push('response_json = ?');
      payloadValues.push(fields.response_json);
    }
    if (fields.raw_sse !== undefined) {
      payloadUpdates.push('raw_sse = ?');
      payloadValues.push(fields.raw_sse);
    }
    payloadValues.push(id);
    getDb()
      .prepare(`UPDATE request_payloads SET ${payloadUpdates.join(', ')} WHERE request_id = ?`)
      .run(...payloadValues);
  }

  return getRequestSummary(id);
}

export function listRequests({ search = '', state = 'all', limit = 200 } = {}) {
  let sql = `
    SELECT r.*, p.name AS provider_name, rp.request_json
    FROM requests r
    LEFT JOIN providers p ON p.id = r.provider_id
    LEFT JOIN request_payloads rp ON rp.request_id = r.id
    WHERE 1=1
  `;
  const params = [];

  if (state !== 'all') {
    if (state === 'active') {
      sql += " AND r.state IN ('pending', 'streaming')";
    } else {
      sql += ' AND r.state = ?';
      params.push(state);
    }
  }

  if (search) {
    sql += ' AND (r.model LIKE ? OR rp.request_json LIKE ? OR p.name LIKE ?)';
    const q = `%${search}%`;
    params.push(q, q, q);
  }

  sql += ' ORDER BY r.started_at DESC LIMIT ?';
  params.push(limit);

  return getDb().prepare(sql).all(...params).map(rowToRequestSummary);
}

export function getRequestSummary(id) {
  const row = getDb()
    .prepare(
      `
      SELECT r.*, p.name AS provider_name, rp.request_json
      FROM requests r
      LEFT JOIN providers p ON p.id = r.provider_id
      LEFT JOIN request_payloads rp ON rp.request_id = r.id
      WHERE r.id = ?
    `
    )
    .get(id);
  return row ? rowToRequestSummary(row) : null;
}

export function getRequestDetail(id) {
  const row = getDb()
    .prepare(
      `
      SELECT r.*, p.name AS provider_name, rp.request_json, rp.response_json, rp.raw_sse
      FROM requests r
      LEFT JOIN providers p ON p.id = r.provider_id
      LEFT JOIN request_payloads rp ON rp.request_id = r.id
      WHERE r.id = ?
    `
    )
    .get(id);

  if (!row) return null;

  return {
    ...rowToRequestSummary(row),
    request_json: row.request_json,
    response_json: row.response_json,
    raw_sse: row.raw_sse,
  };
}

export function deleteRequest(id) {
  getDb().prepare('DELETE FROM requests WHERE id = ?').run(id);
}

export function clearRequests() {
  getDb().prepare('DELETE FROM requests').run();
}
