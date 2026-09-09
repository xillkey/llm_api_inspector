import {
  clearChildren,
  copyText,
  el,
  formatDuration,
  formatTime,
  getLiveBuffer,
  getState,
} from '../state.js';
import { syncTypewriter, stopTypewriter } from '../live-typewriter.js';
import { createSearchController } from '../search-highlight.js';

const panelSearchState = {
  messages: { query: '', open: false },
  tools: { query: '', open: false },
  response: { query: '', open: false },
};

const TABS = [
  { id: 'overview', label: '概览' },
  { id: 'messages', label: '对话' },
  { id: 'tools', label: '工具' },
  { id: 'response', label: '响应' },
  { id: 'raw', label: '原始' },
];

export function renderDetail(container, detail, { activeTab = 'overview', onTabChange }) {
  clearChildren(container);

  if (!detail) {
    container.appendChild(el('div', 'empty-state'));
    container.querySelector('.empty-state').appendChild(el('h2', '', '选择一个请求'));
    container.querySelector('.empty-state').appendChild(
      el('p', '', '左侧列表展示所有经过代理的 LLM API 请求。')
    );
    return;
  }

  const header = el('div', 'detail-header');
  const left = el('div');
  left.appendChild(el('h2', '', `#${detail.id} ${detail.model || ''}`));
  left.appendChild(
    el(
      'div',
      'detail-subtitle',
      `${detail.upstream_url || detail.path} · ${detail.state.toUpperCase()}`
    )
  );
  header.appendChild(left);

  const actions = el('div', 'topbar-actions');
  const copyBtn = el('button', 'btn btn-ghost', '复制请求 JSON');
  copyBtn.addEventListener('click', () => copyText(detail.request_json || ''));
  actions.appendChild(copyBtn);
  header.appendChild(actions);
  container.appendChild(header);

  const tabs = el('div', 'tabs');
  for (const tab of TABS) {
    const btn = el('button', `tab-btn${activeTab === tab.id ? ' active' : ''}`, tab.label);
    btn.type = 'button';
    btn.addEventListener('click', () => onTabChange(tab.id));
    tabs.appendChild(btn);
  }
  container.appendChild(tabs);

  const panels = {
    overview: renderOverviewPanel(detail),
    messages: renderMessagesPanel(detail),
    tools: renderToolsPanel(detail),
    response: renderResponsePanel(detail),
    raw: renderRawPanel(detail),
  };

  for (const tab of TABS) {
    const panel = panels[tab.id];
    panel.classList.add('tab-panel');
    if (tab.id === activeTab) panel.classList.add('active');
    container.appendChild(panel);
  }
}

function renderOverviewPanel(detail) {
  const panel = el('div');
  const card = el('div', 'panel-card');
  card.appendChild(el('h3', '', '请求概览'));

  const body = parseJson(detail.request_json) || {};
  const grid = el('div', 'kv-grid');

  addKv(grid, '上游', detail.upstream_base_url || detail.provider_name || '-', { fullWidth: true });
  addKv(grid, 'API URL', detail.upstream_url || detail.path || '-', { fullWidth: true });
  addKv(grid, '模型', detail.model || '-');
  addKv(grid, '流式', detail.is_stream ? '是' : '否');
  addKv(grid, '状态', detail.state);
  addKv(grid, 'HTTP', detail.http_status ?? '-');
  addKv(grid, 'Temperature', body.temperature ?? '-');
  addKv(grid, 'Top P', body.top_p ?? '-');
  addKv(grid, 'Max Tokens', body.max_tokens ?? '-');
  addKv(grid, '开始时间', formatTime(detail.started_at));
  addKv(grid, '首 Token', formatTime(detail.first_token_at));
  addKv(grid, '结束时间', formatTime(detail.ended_at));
  addKv(grid, '总耗时', formatDuration(detail.started_at, detail.ended_at));
  addKv(grid, 'TTFT', formatDuration(detail.started_at, detail.first_token_at));
  addKv(grid, 'Prompt Tokens', detail.prompt_tokens ?? '-');
  addKv(grid, 'Completion Tokens', detail.completion_tokens ?? '-');

  card.appendChild(grid);
  panel.appendChild(card);

  if (detail.error) {
    const errCard = el('div', 'panel-card');
    errCard.appendChild(el('h3', '', '错误'));
    errCard.appendChild(el('div', 'message-content', detail.error));
    panel.appendChild(errCard);
  }

  return panel;
}

function renderMessagesPanel(detail) {
  const panel = el('div', 'panel-card');
  panel.appendChild(el('h3', '', 'Messages'));

  const searchBar = renderPanelSearchBar('messages', '搜索对话内容 (Ctrl+F)');
  panel.appendChild(searchBar);

  const body = parseJson(detail.request_json) || {};
  const messages = body.messages || [];
  const list = el('div', 'message-list');

  if (!messages.length) {
    list.appendChild(el('div', 'message-content', '无 messages'));
  } else {
    for (const msg of messages) {
      list.appendChild(renderMessageBubble(msg));
    }
  }

  panel.appendChild(list);
  bindPanelSearch('messages', searchBar, list, {
    searchableSelector: '.message-content, .tool-name',
  });

  return panel;
}

function renderPanelSearchBar(tabId, placeholder) {
  const bar = el('div', 'conversation-search-bar');
  bar.hidden = true;
  bar.dataset.searchTab = tabId;

  const input = el('input', 'conversation-search-input');
  input.type = 'search';
  input.placeholder = placeholder;
  bar.appendChild(input);

  const count = el('span', 'conversation-search-count', '0/0');
  bar.appendChild(count);

  const prevBtn = el('button', 'btn btn-icon', '↑');
  prevBtn.type = 'button';
  prevBtn.dataset.action = 'prev';
  prevBtn.title = '上一个 (Shift+Enter)';
  bar.appendChild(prevBtn);

  const nextBtn = el('button', 'btn btn-icon', '↓');
  nextBtn.type = 'button';
  nextBtn.dataset.action = 'next';
  nextBtn.title = '下一个 (Enter)';
  bar.appendChild(nextBtn);

  const closeBtn = el('button', 'btn btn-icon', '×');
  closeBtn.type = 'button';
  closeBtn.dataset.action = 'close';
  closeBtn.title = '关闭 (Esc)';
  bar.appendChild(closeBtn);

  return bar;
}

function formatSearchCount({ count, index }) {
  if (!count) return '0/0';
  return `${index + 1}/${count}`;
}

function bindPanelSearch(tabId, searchBar, rootEl, { searchableSelector } = {}) {
  const input = searchBar.querySelector('.conversation-search-input');
  const countEl = searchBar.querySelector('.conversation-search-count');
  const state = panelSearchState[tabId];
  const controller = createSearchController(() => rootEl, { searchableSelector });

  const updateCount = (result) => {
    countEl.textContent = formatSearchCount(result);
  };

  const applySearch = () => {
    state.query = input.value;
    updateCount(controller.apply(state.query));
  };

  const closeSearch = () => {
    state.open = false;
    state.query = '';
    input.value = '';
    searchBar.hidden = true;
    updateCount(controller.clear());
  };

  input.addEventListener('input', applySearch);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      updateCount(e.shiftKey ? controller.prev() : controller.next());
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closeSearch();
    }
  });

  searchBar.querySelector('[data-action="prev"]').addEventListener('click', () => {
    updateCount(controller.prev());
  });

  searchBar.querySelector('[data-action="next"]').addEventListener('click', () => {
    updateCount(controller.next());
  });

  searchBar.querySelector('[data-action="close"]').addEventListener('click', closeSearch);

  if (state.open) {
    searchBar.hidden = false;
    input.value = state.query;
    if (state.query) {
      updateCount(controller.apply(state.query));
    } else {
      updateCount({ count: 0, index: -1 });
    }
  }
}

export function openPanelSearch(container, tabId) {
  const searchBar = container.querySelector(`[data-search-tab="${tabId}"]`);
  const input = searchBar?.querySelector('.conversation-search-input');
  if (!searchBar || !input) return;

  panelSearchState[tabId].open = true;
  searchBar.hidden = false;
  input.focus();
  input.select();
}

function renderMessageBubble(msg) {
  const bubble = el('div', `message-bubble ${msg.role || 'unknown'}`);
  bubble.appendChild(el('div', 'message-role', msg.role || 'unknown'));

  const reasoning = getMessageReasoning(msg);
  if (reasoning) {
    bubble.appendChild(renderReasoningPart(reasoning));
  }

  bubble.appendChild(renderMessageParts(msg));

  const hasImages = Array.isArray(msg.content) && msg.content.some((p) => p?.type === 'image_url');
  const formatted = formatMessageContent(msg);
  if (hasImages && formatted) {
    const actions = el('div', 'message-actions');
    const copyBtn = el('button', 'btn btn-small', '复制');
    copyBtn.addEventListener('click', () => copyText(formatted));
    actions.appendChild(copyBtn);
    bubble.appendChild(actions);
  }

  if (Array.isArray(msg.tool_calls) && msg.tool_calls.length) {
    for (const tc of msg.tool_calls) {
      const toolCard = el('div', 'tool-card');
      toolCard.appendChild(el('div', 'tool-name', tc.function?.name || 'tool'));
      toolCard.appendChild(el('div', 'message-content', tc.function?.arguments || ''));
      bubble.appendChild(toolCard);
    }
  }

  return bubble;
}

function getMessageReasoning(msg) {
  const reasoning = msg.reasoning_content ?? msg.reasoning;
  return typeof reasoning === 'string' && reasoning.trim() ? reasoning : '';
}

function renderReasoningPart(text) {
  const section = el('div', 'message-reasoning');
  section.appendChild(el('div', 'live-label', '思考过程'));
  section.appendChild(renderTextPart(text));
  return section;
}

function renderMessageParts(msg) {
  const partsContainer = el('div', 'message-parts');
  const content = msg.content;

  if (typeof content === 'string') {
    partsContainer.appendChild(renderTextPart(content));
    return partsContainer;
  }

  if (Array.isArray(content)) {
    for (const part of content) {
      if (typeof part === 'string') {
        partsContainer.appendChild(renderTextPart(part));
      } else if (part.type === 'text') {
        partsContainer.appendChild(renderTextPart(part.text || ''));
      } else if (part.type === 'image_url') {
        const url = getImageUrlFromPart(part);
        if (url) {
          partsContainer.appendChild(renderImagePart(url));
        } else {
          partsContainer.appendChild(renderTextPart(JSON.stringify(part, null, 2)));
        }
      } else {
        partsContainer.appendChild(renderTextPart(JSON.stringify(part, null, 2)));
      }
    }
    return partsContainer;
  }

  if (content != null) {
    partsContainer.appendChild(renderTextPart(JSON.stringify(content, null, 2)));
  }
  return partsContainer;
}

function renderTextPart(text) {
  const node = el('div', 'message-content');
  node.textContent = text;

  if (text.length <= 600) return node;

  node.classList.add('collapsed');
  const wrapper = el('div', 'message-text-part');
  wrapper.appendChild(node);

  const actions = el('div', 'message-actions');
  const expandBtn = el('button', 'btn btn-small', '展开');
  expandBtn.dataset.role = 'expand-toggle';
  expandBtn.addEventListener('click', () => {
    node.classList.toggle('collapsed');
    expandBtn.textContent = node.classList.contains('collapsed') ? '展开' : '收起';
  });
  const copyBtn = el('button', 'btn btn-small', '复制');
  copyBtn.addEventListener('click', () => copyText(text));
  actions.appendChild(expandBtn);
  actions.appendChild(copyBtn);
  wrapper.appendChild(actions);
  return wrapper;
}

function renderImagePart(url) {
  const normalizedUrl = normalizeImageUrl(url);
  const wrap = el('div', 'message-image-wrap');
  const img = document.createElement('img');
  img.className = 'message-image';
  img.alt = 'image';
  img.loading = 'lazy';
  img.src = normalizedUrl;
  img.addEventListener('error', () => {
    img.remove();
    const summary = formatImageUrlSummary(url).replace(/^\[image: /, '').replace(/\]$/, '');
    wrap.appendChild(el('div', 'message-image-error', `图片加载失败: ${summary}`));
  });
  wrap.appendChild(img);
  return wrap;
}

function normalizeImageUrl(url) {
  if (!url.startsWith('data:')) return url;
  const commaIndex = url.indexOf(',');
  if (commaIndex === -1) return url;
  const header = url.slice(0, commaIndex + 1);
  const data = url.slice(commaIndex + 1).replace(/\s/g, '');
  return header + data;
}

function getImageUrlFromPart(part) {
  if (part?.type !== 'image_url') return null;
  const url = part.image_url?.url;
  return typeof url === 'string' && url.trim() ? url.trim() : null;
}

function formatImageUrlSummary(url) {
  if (url.startsWith('data:')) {
    const preview = url.length > 40 ? `${url.slice(0, 40)}...` : url;
    return `[image: ${preview}]`;
  }
  return `[image: ${url}]`;
}

function renderToolsPanel(detail) {
  const panel = el('div', 'panel-card');
  panel.appendChild(el('h3', '', 'Tools 注册'));

  const searchBar = renderPanelSearchBar('tools', '搜索工具 (Ctrl+F)');
  panel.appendChild(searchBar);

  const body = parseJson(detail.request_json) || {};
  const tools = body.tools || [];
  const toolList = el('div', 'tool-list');

  if (!tools.length) {
    toolList.appendChild(el('div', 'message-content', '此请求未注册 tools'));
  } else {
    for (const tool of tools) {
      toolList.appendChild(renderRegisteredToolItem(tool));
    }
  }

  panel.appendChild(toolList);
  bindPanelSearch('tools', searchBar, toolList, {
    searchableSelector: '.tool-name, .tool-desc, .schema-tree',
  });

  return panel;
}

function renderRegisteredToolItem(tool) {
  const item = el('div', 'tool-item');
  const fn = tool.function || {};
  const name = fn.name || tool.type || 'tool';

  const header = el('div', 'tool-item-header');
  header.appendChild(el('div', 'tool-name', name));

  const expandBtn = el('button', 'btn btn-small', '展开');
  expandBtn.type = 'button';
  expandBtn.dataset.role = 'tool-expand-toggle';
  header.appendChild(expandBtn);
  item.appendChild(header);

  const body = el('div', 'tool-item-body');
  body.hidden = true;
  if (fn.description) body.appendChild(el('div', 'tool-desc', fn.description));
  const schema = el('div', 'schema-tree');
  schema.textContent = JSON.stringify(fn.parameters || tool, null, 2);
  body.appendChild(schema);
  item.appendChild(body);

  expandBtn.addEventListener('click', () => {
    body.hidden = !body.hidden;
    expandBtn.textContent = body.hidden ? '展开' : '收起';
  });

  return item;
}

function renderResponsePanel(detail) {
  const panel = el('div');
  const isLive = detail.state === 'pending' || detail.state === 'streaming';
  const live = getLiveBuffer(detail.id);
  const response = parseJson(detail.response_json);
  const message = response?.choices?.[0]?.message || {};

  let responseSearchBar = null;
  if (!isLive) {
    responseSearchBar = renderPanelSearchBar('response', '搜索响应内容 (Ctrl+F)');
    panel.appendChild(responseSearchBar);
  }

  const reasoning = isLive ? live.reasoning : message.reasoning_content || message.reasoning || live.reasoning;
  const content = isLive ? live.content : message.content || live.content || '';

  if (reasoning || isLive) {
    const section = el('div', 'live-section panel-card');
    section.appendChild(el('div', 'live-label', isLive ? '思考过程 · LIVE' : '思考过程'));
    const out = el('div', 'live-output');
    out.dataset.liveReasoning = '1';
    out.dataset.requestId = String(detail.id);
    if (!isLive) {
      out.textContent = reasoning || '(无)';
    } else if (!reasoning) {
      out.textContent = '等待模型输出...';
    }
    section.appendChild(out);
    panel.appendChild(section);
  }

  const answer = el('div', 'panel-card');
  answer.appendChild(el('div', 'live-label', isLive ? '回答 · LIVE' : '回答'));
  const out = el('div', 'live-output');
  out.dataset.liveContent = '1';
  out.dataset.requestId = String(detail.id);
  if (!isLive) {
    out.textContent = content || '(无)';
  } else if (!content) {
    out.textContent = '等待模型输出...';
  }
  answer.appendChild(out);
  panel.appendChild(answer);

  const liveToolCalls = isLive ? live.toolCalls : message.tool_calls;
  const toolCallsForDisplay = isLive
    ? liveToolCalls
    : (message.tool_calls || []).map((tc, index) => ({
        index,
        name: tc.function?.name || 'tool',
        arguments: tc.function?.arguments || '',
      }));

  if (isLive || toolCallsForDisplay?.length) {
    const toolsCard = el('div', 'panel-card');
    toolsCard.appendChild(el('h3', '', isLive ? 'Tool Calls · LIVE' : 'Tool Calls'));
    const toolsContainer = el('div', 'live-toolcalls');
    toolsContainer.dataset.liveToolcalls = '1';
    toolsContainer.dataset.requestId = String(detail.id);

    if (!isLive && toolCallsForDisplay.length) {
      for (const tc of toolCallsForDisplay) {
        toolsContainer.appendChild(renderToolCallItem(tc.name, tc.arguments));
      }
    } else if (isLive && !toolCallsForDisplay?.length) {
      toolsContainer.appendChild(el('div', 'message-content', '等待工具调用...'));
    }

    toolsCard.appendChild(toolsContainer);
    panel.appendChild(toolsCard);
  }

  if (responseSearchBar) {
    bindPanelSearch('response', responseSearchBar, panel, {
      searchableSelector: '.live-output, .message-content, .tool-name',
    });
  }

  return panel;
}

function renderToolCallItem(name, args) {
  const item = el('div', 'tool-item');
  const nameEl = el('div', 'tool-name');
  nameEl.dataset.toolName = '1';
  nameEl.textContent = name || '';
  item.appendChild(nameEl);
  const argsEl = el('div', 'message-content live-tool-args');
  argsEl.dataset.toolArgs = '1';
  argsEl.textContent = args || '';
  item.appendChild(argsEl);
  return item;
}

function renderRawPanel(detail) {
  const panel = el('div');

  panel.appendChild(createRawSection('请求 JSON', detail.request_json));
  panel.appendChild(createRawSection('响应 JSON', detail.response_json || ''));
  panel.appendChild(createRawSection('原始 SSE', detail.raw_sse || ''));

  return panel;
}

function createRawSection(title, raw) {
  const card = el('div', 'panel-card');
  const head = el('div', 'detail-header');
  head.appendChild(el('h3', '', title));
  const copyBtn = el('button', 'btn btn-small', '复制');
  copyBtn.addEventListener('click', () => copyText(formatRaw(raw)));
  head.appendChild(copyBtn);
  card.appendChild(head);

  const block = el('div', 'raw-block');
  block.textContent = formatRaw(raw);
  card.appendChild(block);
  return card;
}

function addKv(container, key, value, { fullWidth = false } = {}) {
  const item = el('div', `kv-item${fullWidth ? ' kv-item-full' : ''}`);
  item.appendChild(el('span', '', key));
  item.appendChild(el('strong', '', String(value)));
  container.appendChild(item);
}

function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function formatRaw(raw) {
  if (!raw) return '';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function formatMessageContent(msg) {
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part.type === 'text') return part.text || '';
        if (part.type === 'image_url') {
          const url = getImageUrlFromPart(part);
          return url ? formatImageUrlSummary(url) : JSON.stringify(part, null, 2);
        }
        return JSON.stringify(part, null, 2);
      })
      .join('\n\n');
  }
  if (msg.content != null) return JSON.stringify(msg.content, null, 2);
  return '';
}

export function updateLiveOutput(detail) {
  if (!detail) return;
  const isLive = detail.state === 'pending' || detail.state === 'streaming';
  if (!isLive) {
    stopTypewriter(detail.id);
    return;
  }

  const live = getLiveBuffer(detail.id);
  syncTypewriter(detail.id, live, (displayed, animating) => paintLiveOutput(detail.id, displayed, animating));
}

export function stopDetailTypewriter(requestId) {
  stopTypewriter(requestId);
}

function paintLiveOutput(requestId, displayed, animating) {
  const target = getLiveBuffer(requestId);
  const reasoningEl = document.querySelector(`[data-live-reasoning][data-request-id="${requestId}"]`);
  const contentEl = document.querySelector(`[data-live-content][data-request-id="${requestId}"]`);
  const toolsContainer = document.querySelector(`[data-live-toolcalls][data-request-id="${requestId}"]`);

  if (reasoningEl) {
    const hasTarget = Boolean(target.reasoning);
    reasoningEl.textContent = displayed.reasoning || (!hasTarget && !animating ? '等待模型输出...' : '');
    reasoningEl.classList.toggle('typewriting', animating && displayed.reasoning.length < target.reasoning.length);
    reasoningEl.scrollTop = reasoningEl.scrollHeight;
  }

  if (contentEl) {
    const hasTarget = Boolean(target.content);
    contentEl.textContent = displayed.content || (!hasTarget && !animating ? '等待模型输出...' : '');
    contentEl.classList.toggle('typewriting', animating && displayed.content.length < target.content.length);
    contentEl.scrollTop = contentEl.scrollHeight;
  }

  if (toolsContainer) {
    clearChildren(toolsContainer);
    const toolCalls = displayed.toolCalls || [];
    const targetTools = target.toolCalls || [];
    if (!toolCalls.length && !targetTools.length) {
      toolsContainer.appendChild(el('div', 'message-content', '等待工具调用...'));
    } else {
      for (let i = 0; i < toolCalls.length; i++) {
        const tc = toolCalls[i];
        const targetTc = targetTools[i] || { name: '', arguments: '' };
        const item = renderToolCallItem(tc.name, tc.arguments);
        const nameEl = item.querySelector('[data-tool-name]');
        const argsEl = item.querySelector('[data-tool-args]');
        if (nameEl && animating && tc.name.length < targetTc.name.length) {
          nameEl.classList.add('typewriting');
        }
        if (argsEl && animating && tc.arguments.length < targetTc.arguments.length) {
          argsEl.classList.add('typewriting');
        }
        toolsContainer.appendChild(item);
      }
    }
  }
}

export function getDefaultTabForState(state) {
  if (state === 'pending' || state === 'streaming') return 'response';
  return 'overview';
}
