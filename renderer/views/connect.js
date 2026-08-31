import { copyText, el, clearChildren } from '../state.js';

export function bindConnectPanel(api, { onChanged }) {
  const panel = document.getElementById('connect-panel');
  if (!panel) return;

  panel.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const baseUrlInput = panel.querySelector('#connect-base-url');

    if (action === 'copy-base') {
      await copyText(baseUrlInput?.value || '');
    }
  });
}

export async function renderConnectPanel(container, api) {
  if (!container) return;

  const proxyStatus = await api.getProxyStatus();

  clearChildren(container);

  const head = el('div', 'connect-head');
  head.appendChild(el('h3', '', '连接信息'));
  container.appendChild(head);

  const info = el('div', 'connect-info');

  const statusRow = el('div', 'connect-info-row');
  statusRow.appendChild(el('span', 'connect-info-label', '监听IP'));
  const listenIp = proxyStatus.allowLan ? '0.0.0.0' : '127.0.0.1';
  statusRow.appendChild(el('span', 'connect-info-value connect-info-mono', listenIp));
  info.appendChild(statusRow);

  const baseRow = el('div', 'connect-info-row');
  baseRow.appendChild(el('span', 'connect-info-label', '代理 Base URL'));
  const baseWrap = el('div', 'connect-info-value-row');
  const baseInput = el('input');
  baseInput.id = 'connect-base-url';
  baseInput.type = 'text';
  baseInput.readOnly = true;
  baseInput.value = proxyStatus.baseUrl || `http://127.0.0.1:${proxyStatus.port}/v1`;
  baseWrap.appendChild(baseInput);
  const copyBaseBtn = el('button', 'btn btn-small', '复制');
  copyBaseBtn.type = 'button';
  copyBaseBtn.dataset.action = 'copy-base';
  baseWrap.appendChild(copyBaseBtn);
  baseRow.appendChild(baseWrap);
  info.appendChild(baseRow);

  const upstreamRow = el('div', 'connect-info-row');
  upstreamRow.appendChild(el('span', 'connect-info-label', '上游 Base URL'));
  const upstreamValue = el('span', 'connect-info-value connect-info-mono');
  if (proxyStatus.upstreamBaseUrl) {
    upstreamValue.textContent = proxyStatus.upstreamBaseUrl;
  } else {
    upstreamValue.textContent = '未配置';
    upstreamValue.classList.add('connect-status-warn');
  }
  upstreamRow.appendChild(upstreamValue);
  info.appendChild(upstreamRow);

  if (!proxyStatus.upstreamBaseUrl) {
    info.appendChild(
      el('p', 'connect-hint connect-warn', '请在设置中配置上游 Base URL')
    );
  } else {
    info.appendChild(
      el(
        'p',
        'connect-hint',
        '客户端使用真实 model 和 API Key，代理仅做中转与抓包'
      )
    );
  }

  container.appendChild(info);
}
