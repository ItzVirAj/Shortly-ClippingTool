const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('DESKTOP_CONFIG', {
  isElectron: true,
  platform: process.platform,
  apiUrl: process.env.SHORTLY_API_URL || 'http://127.0.0.1:8000',
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openLogFolder: () => ipcRenderer.invoke('open-log-folder'),
  getLogPath: () => ipcRenderer.invoke('get-log-path'),
});
