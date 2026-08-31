import {
  clearChildren,
  el,
  formatDuration,
  formatTime,
  getState,
} from '../state.js';

function formatRequestTitle(req) {
  const model = req.model || '(unknown model)';
  const upstream = req.provider_name || '透传';
  return `${model} - ${upstream}`;
}

export function renderRequestList(container, { onSelect }) {
  clearChildren(container);
  const { requests, selectedId } = getState();

  if (!requests.length) {
    container.appendChild(el('div', 'empty-state', '暂无请求。将客户端指向代理地址后，这里会出现记录。'));
    return;
  }

  for (const req of requests) {
    const card = el('div', `request-card${selectedId === req.id ? ' active' : ''}`);
    card.dataset.id = String(req.id);

    const head = el('div', 'request-card-head');
    const title = el('div', 'request-card-title');
    title.appendChild(el('span', `status-dot ${req.state}`));
    title.appendChild(el('strong', '', formatRequestTitle(req)));
    if (req.state === 'streaming' || req.state === 'pending') {
      title.appendChild(el('span', 'live-badge', 'LIVE'));
    }
    head.appendChild(title);
    head.appendChild(el('span', 'request-meta', formatTime(req.started_at)));
    card.appendChild(head);

    card.appendChild(el('div', 'request-preview', req.message_preview || '(empty)'));

    const meta = el('div', 'request-meta');
    meta.appendChild(el('span', '', req.is_stream ? 'stream' : 'json'));
    meta.appendChild(el('span', '', formatDuration(req.started_at, req.ended_at)));
    if (req.prompt_tokens != null || req.completion_tokens != null) {
      meta.appendChild(el('span', '', `${req.prompt_tokens ?? 0}/${req.completion_tokens ?? 0} tok`));
    }
    card.appendChild(meta);

    card.addEventListener('click', () => onSelect(req.id));
    container.appendChild(card);
  }
}

export function bindListControls({ onFilterChange }) {
  const searchInput = document.getElementById('search-input');
  const stateFilter = document.getElementById('state-filter');

  let searchTimer = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      onFilterChange({ search: searchInput.value.trim() });
    }, 200);
  });

  stateFilter.addEventListener('change', () => {
    onFilterChange({ state: stateFilter.value });
  });
}
