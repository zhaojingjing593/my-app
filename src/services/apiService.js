const IS_ELECTRON = typeof window !== 'undefined' && window.electronAPI?.isElectron === true

export const safeFetch = async (url, options = {}) => {
  if (IS_ELECTRON) {
    const result = await window.electronAPI.fetchProxy(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body || null,
      timeout: options.timeout || 30000,
    })
    return {
      ok: result.ok,
      status: result.status,
      json: async () => JSON.parse(result.body),
      text: async () => result.body,
    }
  }
  // Web mode: convert timeout to AbortSignal (fetch() doesn't support timeout natively)
  const fetchOptions = { ...options }
  const timeoutMs = fetchOptions.timeout
  delete fetchOptions.timeout
  if (timeoutMs && !fetchOptions.signal) {
    fetchOptions.signal = AbortSignal.timeout(timeoutMs)
  }
  return fetch(url, fetchOptions)
}
