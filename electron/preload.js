import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('llmInspector', {
  listRequests: (filters) => ipcRenderer.invoke('requests:list', filters),
  getRequest: (id) => ipcRenderer.invoke('requests:get', id),
  deleteRequest: (id) => ipcRenderer.invoke('requests:delete', id),
  clearRequests: () => ipcRenderer.invoke('requests:clear'),

  getProxyPort: () => ipcRenderer.invoke('settings:getProxyPort'),
  setProxyPort: (port) => ipcRenderer.invoke('settings:setProxyPort', port),
  getSetting: (key) => ipcRenderer.invoke('settings:get', key),

  getUpstreamBaseUrl: () => ipcRenderer.invoke('upstream:getBaseUrl'),
  setUpstreamBaseUrl: (url) => ipcRenderer.invoke('upstream:setBaseUrl', url),
  testUpstream: (baseUrl) => ipcRenderer.invoke('upstream:test', baseUrl),

  getAllowLan: () => ipcRenderer.invoke('proxy:getAllowLan'),
  setAllowLan: (allow) => ipcRenderer.invoke('proxy:setAllowLan', allow),
  getInspectEnabled: () => ipcRenderer.invoke('proxy:getInspectEnabled'),
  setInspectEnabled: (enabled) => ipcRenderer.invoke('proxy:setInspectEnabled', enabled),
  getProxyStatus: () => ipcRenderer.invoke('proxy:status'),

  onRequestCreated: (cb) => subscribe('request:created', cb),
  onRequestUpdated: (cb) => subscribe('request:updated', cb),
  onRequestDelta: (cb) => subscribe('request:delta', cb),
});

function subscribe(channel, cb) {
  const handler = (_event, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}
