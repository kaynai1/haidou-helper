const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlay', {
  onGameState: (cb) => ipcRenderer.on('game:state', (_event, state) => cb(state)),
  onPin: (cb) => ipcRenderer.on('overlay:pin', (_event, pinned) => cb(pinned)),
  togglePin: () => ipcRenderer.send('overlay:toggle-pin'),
  resize: (height) => ipcRenderer.send('overlay:resize', height),
  hide: () => ipcRenderer.send('overlay:hide'),
  quit: () => ipcRenderer.send('overlay:quit'),
  openWeb: () => ipcRenderer.send('overlay:open-web'),
});

// 主窗口用的接口；悬浮窗页面不会调用
contextBridge.exposeInMainWorld('haidouApp', {
  onUpdateFound: (cb) => ipcRenderer.on('app:update-found', (_event, info) => cb(info)),
  openUpdatePage: () => ipcRenderer.send('app:open-update-page'),
});
