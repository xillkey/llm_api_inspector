const state = {
  requests: [],
  selectedId: null,
  filters: { search: '', state: 'all' },
  liveBuffers: new Map(),
  proxyStatus: null,
  liveFollowEnabled: false,
};

export function getState() {
  return state;
}

export function setRequests(requests) {
  state.requests = requests;
}

export function upsertRequest(request) {
  const idx = state.requests.findIndex((r) => r.id === request.id);
  if (idx >= 0) state.requests[idx] = request;
  else state.requests.unshift(request);
}

export function setSelectedId(id) {
  state.selectedId = id;
}

export function setFilters(filters) {
  state.filters = { ...state.filters, ...filters };
}

export function setProxyStatus(status) {
  state.proxyStatus = status;
}

export function setLiveFollowEnabled(enabled) {
  state.liveFollowEnabled = Boolean(enabled);
}

export function isLiveState(requestState) {
  return requestState === 'pending' || requestState === 'streaming';
}

export function findNewestLiveRequestId() {
  let newestId = null;
  let newestTime = -Infinity;

  for (const req of state.requests) {
    if (!isLiveState(req.state)) continue;
    const time = parseTimestamp(req.started_at);
    if (!Number.isFinite(time)) continue;
    if (time > newestTime) {
      newestTime = time;
      newestId = req.id;
    }
  }

  return newestId;
}

export function appendLiveDelta(id, { contentDelta = '', reasoningDelta = '', toolCalls = null }) {
  if (!state.liveBuffers.has(id)) {
    state.liveBuffers.set(id, { content: '', reasoning: '', toolCalls: [] });
  }
  const buf = state.liveBuffers.get(id);
  buf.content += contentDelta;
  buf.reasoning += reasoningDelta;
  if (toolCalls) buf.toolCalls = toolCalls;
}

export function getLiveBuffer(id) {
  return state.liveBuffers.get(id) || { content: '', reasoning: '', toolCalls: [] };
}

export function clearLiveBuffer(id) {
  state.liveBuffers.delete(id);
}

/** SQLite datetime('now') is UTC without a Z suffix; parse as UTC for legacy rows. */
function parseTimestamp(value) {
  if (!value) return NaN;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return new Date(value.replace(' ', 'T') + 'Z').getTime();
  }
  return new Date(value).getTime();
}

export function formatDuration(start, end) {
  if (!start) return '-';
  const startMs = parseTimestamp(start);
  const endMs = end ? parseTimestamp(end) : Date.now();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return '-';
  const ms = Math.max(0, endMs - startMs);
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString();
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function clearChildren(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}
