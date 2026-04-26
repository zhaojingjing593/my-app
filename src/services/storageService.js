const IS_ELECTRON = typeof window !== 'undefined' && window.electronAPI?.isElectron === true

export const getStore = async (key) => {
  if (IS_ELECTRON) {
    return await window.electronAPI.getStore(key)
  }
  const raw = localStorage.getItem(key)
  return raw ? JSON.parse(raw) : undefined
}

export const setStore = async (key, value) => {
  if (IS_ELECTRON) {
    await window.electronAPI.setStore(key, value)
  } else {
    localStorage.setItem(key, JSON.stringify(value))
  }
}

export const hashPassword = async (password) => {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export const openExternalLink = async (url) => {
  if (IS_ELECTRON) {
    await window.electronAPI.openExternal(url)
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

export const hexToRgb = (hex) => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16),
})

export const applyTheme = (hex) => {
  const { r, g, b } = hexToRgb(hex)
  const darken = (v, amt) => Math.max(0, Math.round(v * (1 - amt)))
  const lighten = (v, amt) => Math.min(255, Math.round(v + (255 - v) * amt))
  const toHex = (r, g, b) => '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')

  const accent = toHex(darken(r, 0.35), darken(g, 0.35), darken(b, 0.35))
  const bg = toHex(lighten(r, 0.72), lighten(g, 0.72), lighten(b, 0.72))
  const border = toHex(darken(r, 0.12), darken(g, 0.12), darken(b, 0.12))

  const root = document.documentElement
  root.style.setProperty('--color-primary', hex)
  root.style.setProperty('--color-accent', accent)
  root.style.setProperty('--color-bg', bg)
  root.style.setProperty('--color-border', border)
}
