const isChinese = (text) => /[一-龥]/.test(text)

const TRANSLATE_BASE = import.meta.env.VITE_IS_ELECTRON
  ? 'https://api.mymemory.translated.net/get'
  : '/.netlify/functions/translate'

export const translateToEnglish = async (text) => {
  if (!isChinese(text)) return text
  try {
    const url = `${TRANSLATE_BASE}?q=${encodeURIComponent(text)}&langpair=zh|en`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    const data = await res.json()
    if (data.responseStatus === 200 && data.responseData?.translatedText) {
      return data.responseData.translatedText
    }
    return text
  } catch {
    return text
  }
}

export const translateToChineseFree = async (text) => {
  const snippet = text.slice(0, 400)
  try {
    const url = `${TRANSLATE_BASE}?q=${encodeURIComponent(snippet)}&langpair=en|zh`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    const data = await res.json()
    if (data.responseStatus === 200 && data.responseData?.translatedText) {
      return data.responseData.translatedText
    }
    return null
  } catch {
    return null
  }
}
