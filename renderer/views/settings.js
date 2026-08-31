import { clearChildren, copyText, el } from '../state.js';

export function openSettingsModal() {
  const modal = document.getElementById('settings-modal');
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

export function closeSettingsModal() {
  const modal = document.getElementById('settings-modal');
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

export function bindSettingsModal() {
  document.querySelectorAll('[data-close-modal]').forEach((node) => {
    node.addEventListener('click', closeSettingsModal);
  });
}

export async function renderSettings(container, api, { onChanged }) {
  clearChildren(container);

  const [proxyStatus, upstreamBaseUrl] = await Promise.all([
    api.getProxyStatus(),
    api.getUpstreamBaseUrl(),
  ]);

  const proxyCard = el('div', 'panel-card');
  proxyCard.appendChild(el('h3', '', '代理接入'));
  const proxyForm = el('div', 'form-grid');

  const lanRow = el('div', 'connect-check-row');
  const lanLabel = el('label', 'connect-checkbox');
  const lanCheckbox = el('input');
  lanCheckbox.type = 'checkbox';
  lanCheckbox.id = 'settings-allow-lan';
  lanCheckbox.checked = Boolean(proxyStatus.allowLan);
  lanLabel.appendChild(lanCheckbox);
  lanLabel.appendChild(document.createTextNode('允许局域网连接'));
  lanRow.appendChild(lanLabel);
  proxyForm.appendChild(lanRow);

  if (proxyStatus.allowLan) {
    proxyForm.appendChild(
      el(
        'p',
        'connect-hint',
        `监听所有网卡 (0.0.0.0)，局域网设备可使用 ${proxyStatus.baseUrl}`
      )
    );
  } else {
    proxyForm.appendChild(el('p', 'connect-hint', '仅本机可访问 (127.0.0.1)'));
  }

  lanCheckbox.addEventListener('change', async () => {
    await api.setAllowLan(lanCheckbox.checked);
    onChanged?.();
    await renderSettings(container, api, { onChanged });
  });

  const portLabel = el('label');
  portLabel.appendChild(el('span', '', '监听端口'));
  const portInput = el('input');
  portInput.type = 'number';
  portInput.min = '1024';
  portInput.max = '65535';
  portInput.value = String(proxyStatus.port || 8317);
  portLabel.appendChild(portInput);
  proxyForm.appendChild(portLabel);

  const proxyActions = el('div', 'topbar-actions');
  const savePortBtn = el('button', 'btn btn-primary', '保存并重启代理');
  savePortBtn.type = 'button';
  savePortBtn.addEventListener('click', async () => {
    await api.setProxyPort(Number(portInput.value));
    onChanged?.();
    await renderSettings(container, api, { onChanged });
  });
  proxyActions.appendChild(savePortBtn);
  proxyForm.appendChild(proxyActions);

  const envHint = el('div', 'hint-box');
  const baseUrl = proxyStatus.baseUrl || `http://127.0.0.1:${portInput.value}/v1`;
  envHint.textContent = `export OPENAI_BASE_URL=${baseUrl}\nexport OPENAI_API_KEY=你的上游 API Key`;
  proxyForm.appendChild(envHint);

  const copyEnvBtn = el('button', 'btn btn-small', '复制环境变量');
  copyEnvBtn.type = 'button';
  copyEnvBtn.addEventListener('click', () => copyText(envHint.textContent));
  proxyForm.appendChild(copyEnvBtn);

  proxyCard.appendChild(proxyForm);
  container.appendChild(proxyCard);

  const upstreamCard = el('div', 'panel-card');
  upstreamCard.appendChild(el('h3', '', '上游地址'));
  const upstreamForm = el('div', 'form-grid');

  const urlLabel = el('label');
  urlLabel.appendChild(el('span', '', 'Base URL'));
  const urlInput = el('input');
  urlInput.type = 'text';
  urlInput.placeholder = 'https://api.openai.com/v1';
  urlInput.value = upstreamBaseUrl || '';
  urlLabel.appendChild(urlInput);
  upstreamForm.appendChild(urlLabel);

  upstreamForm.appendChild(
    el(
      'p',
      'connect-hint',
      '代理将请求原样转发到此地址，客户端 Authorization 等头会透传'
    )
  );

  const testResult = el('div', 'test-result');
  upstreamForm.appendChild(testResult);

  const upstreamActions = el('div', 'topbar-actions');
  const testBtn = el('button', 'btn', '连接测试');
  testBtn.type = 'button';
  testBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) {
      testResult.textContent = '请先填写 Base URL';
      return;
    }
    testResult.textContent = '测试中...';
    try {
      const result = await api.testUpstream(url);
      if (result.ok) {
        testResult.textContent = `连接成功 (${result.status})`;
      } else if (result.needsAuth) {
        testResult.textContent = `可达 (${result.status})，需客户端携带 API Key 鉴权`;
      } else {
        testResult.textContent = `连接失败 (${result.status})\n${result.body}`;
      }
    } catch (err) {
      testResult.textContent = `连接失败: ${err.message}`;
    }
  });

  const saveBtn = el('button', 'btn btn-primary', '保存上游地址');
  saveBtn.type = 'button';
  saveBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) {
      alert('请填写上游 Base URL');
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中...';
    try {
      await api.setUpstreamBaseUrl(url);
      onChanged?.();
      await renderSettings(container, api, { onChanged });
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = '保存上游地址';
    }
  });

  upstreamActions.appendChild(testBtn);
  upstreamActions.appendChild(saveBtn);
  upstreamForm.appendChild(upstreamActions);
  upstreamCard.appendChild(upstreamForm);
  container.appendChild(upstreamCard);
}
