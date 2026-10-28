const { app, BrowserWindow, Tray, Menu, nativeImage, globalShortcut, screen, shell, ipcMain } = require('electron');
const path = require('path');
const https = require('https');

const WEB_INDEX = app.isPackaged
  ? path.join(process.resourcesPath, 'app.asar.unpacked', 'web', 'index.html')
  : path.join(__dirname, '..', 'web', 'index.html');
const ICON_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'icon.png')
  : path.join(__dirname, '..', 'build', 'icon.png');
const WIDTH = 384;
const HEIGHT = 440;

let win = null;
let mainWindow = null;
let tray = null;
let pinned = false;
let pollTimer = null;
let gameLive = false;

function sendPinState() {
  if (win && !win.isDestroyed()) win.webContents.send('overlay:pin', pinned);
}

function setPinned(next) {
  pinned = !!next;
  if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(pinned, { forward: true });
  updateTrayMenu();
  sendPinState();
}

function toggleOverlay(force) {
  if (!win || win.isDestroyed()) return;
  const next = typeof force === 'boolean' ? force : !win.isVisible();
  if (next) win.showInactive();
  else win.hide();
  updateTrayMenu();
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  const area = screen.getPrimaryDisplay().workArea;
  const width = Math.max(960, Math.min(1360, area.width - 80));
  const height = Math.max(640, Math.min(900, area.height - 80));

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 960,
    minHeight: 640,
    center: true,
    backgroundColor: '#07090F',
    autoHideMenuBar: true,
    show: false,
    title: '海斗速查',
    icon: ICON_PATH,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile(WEB_INDEX);
  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createOverlay() {
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
  win.on('show', updateTrayMenu);
  win.on('hide', updateTrayMenu);

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('closed', () => {
    win = null;
    stopPolling();
  });
}

function updateTrayMenu() {
  if (!tray) return;
  const overlayVisible = !!(win && !win.isDestroyed() && win.isVisible());
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开主窗口', click: createMainWindow },
      {
        label: overlayVisible ? '隐藏悬浮窗' : '显示悬浮窗',
        click: () => toggleOverlay(),
      },
      { label: pinned ? '取消点击穿透' : '点击穿透', click: () => setPinned(!pinned) },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() },
    ])
  );
}

function createTray() {
  if (tray) return;
  const image = nativeImage.createFromPath(ICON_PATH);
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image.resize({ width: 32, height: 32 }));
  tray.setToolTip('海斗速查 · 点击打开主窗口');
  updateTrayMenu();
  tray.on('click', createMainWindow);
  tray.on('double-click', createMainWindow);
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
    if (champ && !gameLive && win && !win.isDestroyed()) win.showInactive();
    gameLive = !!champ;
    pushState({
      status: champ ? 'live' : 'lobby',
      championName: champ ? champ.championName : null,
      gameMode: gameData.gameMode || 'UNKNOWN',
      gameTime: Number(gameData.gameTime) || 0,
      mapName: gameData.mapName || '',
    });
  } catch {
    gameLive = false;
    pushState({ status: 'offline' });
  } finally {
    pollTimer = setTimeout(pollGame, 5000);
  }
}

function stopPolling() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
}

function resetOverlayPosition() {
  if (!win || win.isDestroyed()) return;
  const area = screen.getPrimaryDisplay().workArea;
  win.setPosition(area.x + area.width - WIDTH - 18, area.y + Math.round(area.height * 0.12));
  win.showInactive();
  updateTrayMenu();
}

function registerShortcuts() {
  const bind = (accel, fn) => {
    try {
      if (!globalShortcut.register(accel, fn)) console.warn('shortcut busy:', accel);
    } catch (err) {
      console.warn('shortcut failed:', accel, err.message);
    }
  };

  bind('CommandOrControl+Shift+H', () => toggleOverlay());
  bind('CommandOrControl+Shift+L', () => {
    setPinned(!pinned);
    if (win && !win.isDestroyed() && !win.isVisible()) win.showInactive();
    updateTrayMenu();
  });
  bind('CommandOrControl+Shift+R', resetOverlayPosition);
  bind('CommandOrControl+Shift+O', createMainWindow);
  bind('CommandOrControl+Shift+Q', () => app.quit());
}

ipcMain.on('overlay:toggle-pin', () => setPinned(!pinned));
ipcMain.on('overlay:resize', (_event, height) => {
  if (!win || win.isDestroyed()) return;
  const h = Math.max(380, Math.min(640, Math.round(Number(height) || HEIGHT)));
  const [w, current] = win.getContentSize();
  if (current !== h) win.setContentSize(w, h);
});
ipcMain.on('overlay:hide', () => toggleOverlay(false));
ipcMain.on('overlay:quit', () => app.quit());
ipcMain.on('overlay:open-web', createMainWindow);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    createMainWindow();
    if (win && !win.isDestroyed()) win.setAlwaysOnTop(true, 'screen-saver');
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createMainWindow();
    createOverlay();
    createTray();
    registerShortcuts();
    pollGame();
  });

  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    stopPolling();
  });
}
