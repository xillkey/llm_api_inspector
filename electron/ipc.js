import { ipcMain } from 'electron';
import {
  clearRequests,
  deleteRequest,
  getProxyPort,
  getRequestDetail,
  getSetting,
  listRequests,
  getAllowLan,
  setAllowLan,
  getInspectEnabled,
  setInspectEnabled,
  setProxyPort,
  getUpstreamBaseUrl,
  setUpstreamBaseUrl,
} from './store/repo.js';
import {
  getProxyStatus,
  startProxyServer,
  stopProxyServer,
  testUpstreamConnection,
} from './proxy/server.js';

export function registerIpcHandlers() {
  ipcMain.handle('requests:list', (_e, filters) => listRequests(filters));
  ipcMain.handle('requests:get', (_e, id) => getRequestDetail(id));
  ipcMain.handle('requests:delete', (_e, id) => deleteRequest(id));
  ipcMain.handle('requests:clear', () => clearRequests());

  ipcMain.handle('settings:getProxyPort', () => getProxyPort());
  ipcMain.handle('settings:setProxyPort', async (_e, port) => {
    setProxyPort(port);
    await stopProxyServer();
    try {
      await startProxyServer(port);
    } catch {
      // proxyStartError recorded in server module
    }
    return getProxyStatus();
  });
  ipcMain.handle('settings:get', (_e, key) => getSetting(key));

  ipcMain.handle('upstream:getBaseUrl', () => getUpstreamBaseUrl());
  ipcMain.handle('upstream:setBaseUrl', (_e, url) => setUpstreamBaseUrl(url));
  ipcMain.handle('upstream:test', async (_e, baseUrl) => testUpstreamConnection(baseUrl));

  ipcMain.handle('proxy:getAllowLan', () => getAllowLan());
  ipcMain.handle('proxy:setAllowLan', async (_e, allow) => {
    setAllowLan(allow);
    await stopProxyServer();
    try {
      await startProxyServer();
    } catch {
      // proxyStartError recorded in server module
    }
    return getProxyStatus();
  });
  ipcMain.handle('proxy:getInspectEnabled', () => getInspectEnabled());
  ipcMain.handle('proxy:setInspectEnabled', (_e, enabled) => {
    setInspectEnabled(enabled);
    return getProxyStatus();
  });
  ipcMain.handle('proxy:status', () => getProxyStatus());
}
