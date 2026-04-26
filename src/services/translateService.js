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
const youdaoTranslate = async (text) => {
  if (!import.meta.env.VITE_IS_ELECTRON) return null
  const encoded = encodeURIComponent(text)
  const endpoints = [
    `https://fanyi.youdao.com/translate?i=${encoded}&doctype=json&type=AUTO&xmlVersion=5.1&keyfrom=fanyi.web&ue=UTF-8`,
    `https://dict.youdao.com/translate?q=${encoded}&doctype=json&type=AUTO&xmlVersion=5.1&keyfrom=fanyi.web&ue=UTF-8`,
  ]
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: { Referer: 'https://fanyi.youdao.com/' },
      })
      if (!res.ok) continue
      const data = await res.json()
      // Use loose equality: errorCode may be number 0 or string "0"
      if (data.errorCode != 0 || !data.translateResult?.[0]?.[0]?.tgt) continue
      const result = data.translateResult.flat().map(x => x.tgt).join('').trim()
      if (result) return result
    } catch {
      continue
    }
  }
  return null
}

export const translateToEnglish = async (text) => {
  if (!isChinese(text)) return text
  try {
    const result = await googleTranslate(text, 'zh-CN', 'en')
    if (result) return result
    const fallback = await youdaoTranslate(text)
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
  const youdao = await youdaoTranslate(trimmed)
  if (youdao && hasChineseContent(youdao)) return youdao

  return null
}
