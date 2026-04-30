// Tencent Yuanbao (Hunyuan) API — OpenAI-compatible fallback for DeepSeek

const YUANBAO_BASE = 'https://api.hunyuan.cloud.tencent.com/v1/chat/completions'
const YUANBAO_MODEL = 'hunyuan-turbos-latest'

/**
 * Call Yuanbao API as a fallback when DeepSeek fails.
 * Accepts the same request body format as DeepSeek (OpenAI-compatible).
 * Returns response text content, or null on failure.
 */
export async function callYuanbao(apiKey, requestBody, signal) {
  if (!apiKey) return null
  try {
    const res = await fetch(YUANBAO_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...requestBody,
        model: YUANBAO_MODEL,
      }),
      signal,
    })
    if (!res.ok) {
      console.warn('Yuanbao API failed:', res.status)
      return null
    }
    const data = await res.json()
    return data?.choices?.[0]?.message?.content?.trim() || null
  } catch (err) {
    console.warn('Yuanbao API error:', err.message)
    return null
  }
}
