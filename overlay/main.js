const { app, BrowserWindow, globalShortcut, screen, shell, ipcMain } = require('electron');
const path = require('path');
const https = require('https');

const WEB_INDEX = app.isPackaged
  ? path.join(process.resourcesPath, 'app.asar.unpacked', 'web', 'index.html')
  : path.join(__dirname, '..', 'web', 'index.html');
const WIDTH = 384;
const HEIGHT = 440;

let win = null;
let pinned = false;
let pollTimer = null;

function sendPinState() {
  if (win && !win.isDestroyed()) win.webContents.send('overlay:pin', pinned);
}

function setPinned(next) {
  pinned = next;
  if (!win || win.isDestroyed()) return;
  win.setIgnoreMouseEvents(pinned, { forward: true });
  sendPinState();
}

function createWindow() {
  const display = screen.getPrimaryDisplay();
  const area = display.workArea;
  const x = Math.max(area.x + 12, area.x + area.width - WIDTH - 18);
  const y = Math.max(area.y + 12, area.y + Math.round(area.height * 0.12));

  win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    x,
    y,
    transparent: true,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    show: false,
    title: '海斗速查',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  try {
    win.setBackgroundMaterial('acrylic');
  } catch {
    /* Windows 10 或旧版本没有 acrylic，退回半透明底色 */
  }

  win.loadFile(path.join(__dirname, 'overlay.html'));
  win.once('ready-to-show', () => win.showInactive());

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('closed', () => {
    win = null;
    stopPolling();
  });
}

function getLiveData() {
  return new Promise((resolve, reject) => {
    const req = https.get(
      {
        host: '127.0.0.1',
        port: 2999,
        path: '/liveclientdata/allgamedata',
        rejectUnauthorized: false,
        timeout: 1600,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`status ${res.statusCode}`));
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
          if (body.length > 4 * 1024 * 1024) req.destroy(new Error('payload too large'));
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

function detectChampion(data) {
  const me = data && data.activePlayer;
  const players = data && Array.isArray(data.allPlayers) ? data.allPlayers : [];
  if (!me || !players.length) return null;
  let found = null;
  if (me.summonerName) found = players.find((p) => p.summonerName === me.summonerName);
  if (!found && me.riotIdGameName) {
    found = players.find((p) => p.riotIdGameName === me.riotIdGameName && p.riotIdTagLine === me.riotIdTagLine);
  }
  if (!found && me.riotId) found = players.find((p) => p.riotId === me.riotId);
  if (!found) found = players.find((p) => p.summonerName === me.summonerName || p.riotIdGameName === me.riotIdGameName);
  return found ? { championName: found.championName || '', team: found.team || '' } : null;
}

function pushState(payload) {
  if (win && !win.isDestroyed()) win.webContents.send('game:state', payload);
}

async function pollGame() {
  try {
    const data = await getLiveData();
    const champ = detectChampion(data);
    const gameData = data.gameData || {};
    pushState({
      status: champ ? 'live' : 'lobby',
      championName: champ ? champ.championName : null,
      gameMode: gameData.gameMode || 'UNKNOWN',
      gameTime: Number(gameData.gameTime) || 0,
      mapName: gameData.mapName || '',
    });
  } catch {
    pushState({ status: 'offline' });
  } finally {
    pollTimer = setTimeout(pollGame, 5000);
  }
}

function stopPolling() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
}

function registerShortcuts() {
  const bind = (accel, fn) => {
    try {
      if (!globalShortcut.register(accel, fn)) console.warn('shortcut busy:', accel);
    } catch (err) {
      console.warn('shortcut failed:', accel, err.message);
    }
  };

  bind('CommandOrControl+Shift+H', () => {
    if (!win) return;
    win.isVisible() ? win.hide() : win.showInactive();
  });

  bind('CommandOrControl+Shift+L', () => setPinned(!pinned));

  bind('CommandOrControl+Shift+R', () => {
    if (!win) return;
    const area = screen.getPrimaryDisplay().workArea;
    win.setPosition(area.x + area.width - WIDTH - 18, area.y + Math.round(area.height * 0.12));
    win.showInactive();
  });

  bind('CommandOrControl+Shift+O', () => {
    shell.openPath(WEB_INDEX).catch(() => {});
  });

  bind('CommandOrControl+Shift+Q', () => app.quit());
}

ipcMain.on('overlay:toggle-pin', () => setPinned(!pinned));
ipcMain.on('overlay:resize', (_event, height) => {
  if (!win || win.isDestroyed()) return;
  const h = Math.max(380, Math.min(640, Math.round(Number(height) || HEIGHT)));
  const [w, current] = win.getContentSize();
  if (current !== h) win.setContentSize(w, h);
});
ipcMain.on('overlay:hide', () => win && win.hide());
ipcMain.on('overlay:quit', () => app.quit());
ipcMain.on('overlay:open-web', () => shell.openPath(WEB_INDEX).catch(() => {}));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win || win.isDestroyed()) return;
    win.showInactive();
    win.setAlwaysOnTop(true, 'screen-saver');
  });

  app.whenReady().then(() => {
    createWindow();
    registerShortcuts();
    pollGame();
    sendPinState();
  });

  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    stopPolling();
  });
}
