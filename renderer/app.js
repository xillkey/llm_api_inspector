import {
  appendLiveDelta,
  clearLiveBuffer,
  clearChildren,
  el,
  findNewestLiveRequestId,
  getState,
  setFilters,
  setLiveFollowEnabled,
  setProxyStatus,
  setRequests,
  setSelectedId,
  upsertRequest,
} from './state.js';
import { renderRequestList, bindListControls } from './views/list.js';
import {
  bindConnectPanel,
  renderConnectPanel,
} from './views/connect.js';
import {
  getDefaultTabForState,
  renderDetail,
  updateLiveOutput,
  stopDetailTypewriter,
} from './views/detail.js';
import {
  bindSettingsModal,
  closeSettingsModal,
  openSettingsModal,
  renderSettings,
} from './views/settings.js';

const api = window.llmInspector;

const ui = {
  list: document.getElementById('request-list'),
  detail: document.getElementById('detail-panel'),
  connect: document.getElementById('connect-panel'),
  proxyStatus: document.getElementById('proxy-status'),
  serverStatus: document.getElementById('server-status'),
  inspectToggle: document.getElementById('inspect-toggle'),
  liveFollowToggle: document.getElementById('live-follow-toggle'),
  settingsContent: document.getElementById('settings-content'),
  activeTab: 'overview',
  selectedDetail: null,
  unsubscribers: [],
};

async function bootstrap() {
  bindListControls({
    onFilterChange: (partial) => {
      setFilters(partial);
      return refreshList();
    },
  });
  bindSettingsModal();
  bindConnectPanel(api, { onChanged: refreshAll });
  bindInspectToggle();
  bindLiveFollowToggle();

  document.getElementById('btn-settings').addEventListener('click', async () => {
    openSettingsModal();
    await renderSettings(ui.settingsContent, api, { onChanged: refreshAll });
  });

  document.getElementById('btn-clear').addEventListener('click', async () => {
    if (!confirm('确定清空所有请求记录吗？')) return;
    await api.clearRequests();
    setSelectedId(null);
    ui.selectedDetail = null;
    await refreshAll();
  });

  ui.unsubscribers.push(
    api.onRequestCreated((request) => {
      upsertRequest(request);
      renderList();
      if (getState().liveFollowEnabled) {
        followLiveRequest();
      } else if (!getState().selectedId) {
        selectRequest(request.id);
      }
    })
  );

  ui.unsubscribers.push(
    api.onRequestUpdated((request) => {
      upsertRequest(request);
      renderList();
      if (getState().liveFollowEnabled) {
        followLiveRequest();
      }
      if (getState().selectedId === request.id) {
        loadDetail(request.id, { preserveTab: true });
      }
    })
  );

  ui.unsubscribers.push(
    api.onRequestDelta((payload) => {
      appendLiveDelta(payload.id, payload);
      if (getState().liveFollowEnabled) {
        followLiveRequest();
      }
      if (getState().selectedId === payload.id) {
        const detail = ui.selectedDetail;
        if (detail) updateLiveOutput({ ...detail, state: detail.state });
      }
    })
  );

  await refreshAll();
}

async function refreshAll() {
  await Promise.all([refreshList(), refreshProxyStatus(), refreshConnect()]);
  const selectedId = getState().selectedId;
  if (selectedId) await loadDetail(selectedId, { preserveTab: true });
  else renderEmptyDetail();
}

async function refreshList() {
  const { filters } = getState();
  const requests = await api.listRequests(filters);
  setRequests(requests);
  renderList();
}

async function refreshProxyStatus() {
  const status = await api.getProxyStatus();
  setProxyStatus(status);
  renderProxyHeader(status);
}

function renderProxyHeader(status) {
  if (ui.inspectToggle) {
    ui.inspectToggle.checked = Boolean(status.inspectEnabled);
  }

  if (status.running) {
    const scope = status.allowLan ? 'LAN' : 'local';
    ui.proxyStatus.textContent = `Proxy (${scope}): ${status.baseUrl}`;
  } else {
    ui.proxyStatus.textContent = `Proxy stopped (${status.port})`;
  }

  if (!ui.serverStatus) return;
  clearChildren(ui.serverStatus);
  ui.serverStatus.appendChild(el('span', 'server-status-label', 'Server status'));

  const indicator = el('span', 'server-status-indicator');
  const dot = el('span', 'server-status-dot');
  const text = el('span', 'server-status-text');

  if (status.error) {
    dot.classList.add('error');
    text.textContent = `error: ${status.error}`;
  } else if (status.running) {
    dot.classList.add('running');
    text.textContent = 'running';
  } else {
    dot.classList.add('stopped');
    text.textContent = 'stopped';
  }

  indicator.appendChild(dot);
  indicator.appendChild(text);
  ui.serverStatus.appendChild(indicator);
}

function bindLiveFollowToggle() {
  const toggle = ui.liveFollowToggle;
  if (!toggle) return;

  toggle.addEventListener('change', () => {
    setLiveFollowEnabled(toggle.checked);
    if (toggle.checked) followLiveRequest();
  });
}

async function followLiveRequest() {
  const { liveFollowEnabled, selectedId } = getState();
  if (!liveFollowEnabled) return;

  const id = findNewestLiveRequestId();
  if (id == null || id === selectedId) return;

  await selectRequest(id);
}

function handleListSelect(id) {
  if (getState().liveFollowEnabled) {
    followLiveRequest();
    return;
  }
  selectRequest(id);
}

function bindInspectToggle() {
  const toggle = ui.inspectToggle;
  if (!toggle) return;

  toggle.addEventListener('change', async () => {
    toggle.disabled = true;
    try {
      const status = await api.setInspectEnabled(toggle.checked);
      setProxyStatus(status);
      renderProxyHeader(status);
    } finally {
      toggle.disabled = false;
    }
  });
}

async function refreshConnect() {
  await renderConnectPanel(ui.connect, api);
}

function renderList() {
  renderRequestList(ui.list, {
    onSelect: (id) => handleListSelect(id),
  });
}

function renderEmptyDetail() {
  ui.selectedDetail = null;
  renderDetail(ui.detail, null, {
    activeTab: ui.activeTab,
    onTabChange: (tab) => {
      ui.activeTab = tab;
      renderEmptyDetail();
    },
  });
}

async function selectRequest(id) {
  setSelectedId(id);
  renderList();
  await loadDetail(id);
}

async function loadDetail(id, { preserveTab = false } = {}) {
  const detail = await api.getRequest(id);
  ui.selectedDetail = detail;

  if (!preserveTab) {
    ui.activeTab = getDefaultTabForState(detail.state);
  }

  if (detail.state === 'done' || detail.state === 'error' || detail.state === 'aborted') {
    stopDetailTypewriter(id);
    clearLiveBuffer(id);
  }

  renderCurrentDetail();

  if (detail.state === 'pending' || detail.state === 'streaming') {
    updateLiveOutput(detail);
  }
}

function renderCurrentDetail() {
  renderDetail(ui.detail, ui.selectedDetail, {
    activeTab: ui.activeTab,
    onTabChange: (tab) => {
      ui.activeTab = tab;
      renderCurrentDetail();
      const detail = ui.selectedDetail;
      if (
        detail &&
        (detail.state === 'pending' || detail.state === 'streaming')
      ) {
        updateLiveOutput(detail);
      }
    },
  });
}

window.addEventListener('DOMContentLoaded', () => {
  bootstrap().catch((err) => {
    console.error(err);
    ui.proxyStatus.textContent = `Init failed: ${err.message}`;
    if (ui.serverStatus) {
      clearChildren(ui.serverStatus);
      ui.serverStatus.appendChild(el('span', 'server-status-label', 'Server status'));
      const indicator = el('span', 'server-status-indicator');
      const dot = el('span', 'server-status-dot error');
      const text = el('span', 'server-status-text', `error: ${err.message}`);
      indicator.appendChild(dot);
      indicator.appendChild(text);
      ui.serverStatus.appendChild(indicator);
    }
  });
});

window.addEventListener('beforeunload', () => {
  ui.unsubscribers.forEach((off) => off?.());
  closeSettingsModal();
});
