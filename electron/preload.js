const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  getStore: (key) => ipcRenderer.invoke('store:get', key),
  setStore: (key, value) => ipcRenderer.invoke('store:set', key, value),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  fetchProxy: (url, options) => ipcRenderer.invoke('fetch-proxy', url, options),
  isElectron: true,
})
