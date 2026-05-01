const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('path')
const Store = require('electron-store')

const store = new Store({ name: 'arxiv-recommender-data' })
const isDev = process.env.NODE_ENV === 'development'

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
    show: false,
    title: 'arXiv 论文推荐',
  })

  win.once('ready-to-show', () => {
    win.maximize()
    win.show()
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../dist/renderer/index.html'))
  }
}

// IPC: fetch proxy — allows renderer to make HTTP requests without CORS restrictions
ipcMain.handle('fetch-proxy', async (_e, url, options = {}) => {
  const { method = 'GET', headers = {}, body = null, timeout = 30000 } = options
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    const fetchOptions = { method, headers, signal: ctrl.signal }
    if (body) fetchOptions.body = body
    const res = await fetch(url, fetchOptions)
    return { ok: res.ok, status: res.status, body: await res.text() }
  } catch (err) {
    return { ok: false, status: 0, body: err.message || 'Fetch failed' }
  } finally {
    clearTimeout(timer)
  }
})

app.whenReady().then(() => {
  ipcMain.handle('store:get', (_e, key) => store.get(key))
  ipcMain.handle('store:set', (_e, key, value) => store.set(key, value))
  ipcMain.handle('open-external', (_e, url) => shell.openExternal(url))
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
