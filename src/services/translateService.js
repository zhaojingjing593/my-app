const isChinese = (text) => /[一-鿿]/.test(text)

// Result must contain at least 3 Chinese characters to count as a real translation
const hasChineseContent = (text) =>
  (text.match(/[一-鿿]/g) || []).length >= 3

const GOOGLE_BASE = import.meta.env.VITE_IS_ELECTRON
  ? 'https://translate.googleapis.com/translate_a/single'
  : '/.netlify/functions/translate'

const googleTranslate = async (text, from, to) => {
  try {
    const url = `${GOOGLE_BASE}?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data) || !Array.isArray(data[0])) return null
    return data[0].filter(x => x && x[0]).map(x => x[0]).join('').trim() || null
  } catch {
    return null
  }
}

// Youdao unofficial — works in mainland China, Electron only (no CORS restriction)
const youdaoTranslate = async (text, from, to) => {
  if (!import.meta.env.VITE_IS_ELECTRON) return null
  try {
    const type = (from === 'zh-CN' ? 'ZH_CN2' : `${from.toUpperCase()}2`) + (to === 'zh-CN' ? 'ZH_CN' : to.toUpperCase())
    const url = `https://dict.youdao.com/translate?q=${encodeURIComponent(text)}&doctype=json&type=${type}&xmlVersion=5.1&keyfrom=fanyi.web&ue=UTF-8`
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { Referer: 'https://www.youdao.com/' },
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data.errorCode !== 0 || !data.translateResult?.[0]?.[0]?.tgt) return null
    return data.translateResult.flat().map(x => x.tgt).join('').trim() || null
  } catch {
    return null
  }
}

export const translateToEnglish = async (text) => {
  if (!isChinese(text)) return text
  try {
    const result = await googleTranslate(text, 'zh-CN', 'en')
    if (result) return result
    const fallback = await youdaoTranslate(text, 'zh-CN', 'en')
    return fallback || text
  } catch {
    return text
  }
}

export const translateToChineseFree = async (text) => {
  if (!text?.trim()) return null
  if (isChinese(text)) return text.trim()
  const trimmed = text.trim().slice(0, 800)

  // Try Google Translate first
  const google = await googleTranslate(trimmed, 'en', 'zh-CN')
  if (google && hasChineseContent(google)) return google

  // Fallback: Youdao (works in China)
  const youdao = await youdaoTranslate(trimmed, 'en', 'zh-CN')
  if (youdao && hasChineseContent(youdao)) return youdao

  return null
}
