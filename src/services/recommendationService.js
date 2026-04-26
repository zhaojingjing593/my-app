import { getStore, setStore } from './storageService'
import { searchByCategory, searchArxiv } from './arxivService'
import { translateToChineseFree } from './translateService'

const today = () => new Date().toISOString().split('T')[0]

export const trackPaperClick = async (email, paper, source) => {
  if (!email || !paper?.arxivId) return
  const users = (await getStore('users')) || {}
  const user = users[email] || {}

  const record = {
    arxivId: paper.arxivId,
    title: paper.title,
    category: paper.primaryCategory,
    clickedAt: new Date().toISOString(),
    source,
  }

  const prev = (user.clickedPapers || []).filter(p => p.arxivId !== paper.arxivId)
  users[email] = { ...user, clickedPapers: [record, ...prev].slice(0, 50) }
  await setStore('users', users)
}

const buildTopCategory = (clickedPapers) => {
  const counts = {}
  clickedPapers.forEach(p => {
    if (p.category) counts[p.category] = (counts[p.category] || 0) + 1
  })
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
  return sorted[0]?.[0] || null
}

export const getOrFetchRecommendations = async (email) => {
  const users = (await getStore('users')) || {}
  const user = users[email] || {}

  if (user.recommendations?.date === today() && user.recommendations.papers?.length > 0) {
    return user.recommendations.papers
  }

  const topCat = buildTopCategory(user.clickedPapers || [])
  const lastSearch = (user.searchHistory || [])[0]

  let papers = []
  try {
    if (topCat) {
      papers = await searchByCategory(topCat)
    } else if (lastSearch) {
      papers = await searchArxiv(lastSearch)
    } else {
      papers = await searchByCategory('cs.AI')
    }
  } catch {
    papers = []
  }

  if (papers.length > 0) {
    users[email] = { ...user, recommendations: { date: today(), papers } }
    await setStore('users', users)
  }

  return papers
}

// Returns { cnTitle, summary } — cnTitle is Chinese translation of title, summary is highlights in Chinese
export const getChineseSummary = async (paper, claudeApiKey, email) => {
  const users = (await getStore('users')) || {}
  const user = users[email] || {}
  const cache = user.aiCache || {}

  if (cache[paper.arxivId]) return cache[paper.arxivId]

  let result = { cnTitle: null, summary: null }

  if (claudeApiKey) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': claudeApiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          messages: [{
            role: 'user',
            content: `请分析这篇论文，以JSON格式返回（只返回JSON，不含其他文字）：
{
  "cnTitle": "论文标题的准确中文翻译",
  "summary": "用中文150-200字介绍：①核心问题与方法 ②主要贡献与创新点 ③关键结果或应用价值"
}

标题：${paper.title}
摘要：${paper.summary.slice(0, 1000)}`,
          }],
        }),
        signal: AbortSignal.timeout(30000),
      })
      if (res.ok) {
        const data = await res.json()
        const text = data.content?.[0]?.text?.trim()
        if (text) {
          try {
            const jsonStart = text.indexOf('{')
            const jsonEnd = text.lastIndexOf('}')
            const parsed = JSON.parse(jsonStart >= 0 ? text.slice(jsonStart, jsonEnd + 1) : text)
            if (parsed.cnTitle || parsed.summary) {
              result = { cnTitle: parsed.cnTitle || null, summary: parsed.summary || null }
            }
          } catch {
            result = { cnTitle: null, summary: text }
          }
        }
      }
    } catch (err) {
      console.warn('Claude API failed:', err.message)
    }
  }

  // Fallback for title (null means translation failed, don't show English twice)
  if (!result.cnTitle) {
    try {
      result.cnTitle = await translateToChineseFree(paper.title) || null
    } catch {
      result.cnTitle = null
    }
  }

  // Fallback for summary (limit to 400 chars for reliability)
  if (!result.summary) {
    try {
      const shortAbstract = paper.summary.trim().slice(0, 400)
      const translated = await translateToChineseFree(shortAbstract)
      result.summary = translated
        ? `[机器翻译] ${translated}`
        : '摘要翻译暂时不可用，请在设置中配置 Claude API Key 以获取 AI 解读。'
    } catch {
      result.summary = '摘要翻译暂时不可用，请在设置中配置 Claude API Key 以获取 AI 解读。'
    }
  }

  const freshUsers = (await getStore('users')) || {}
  const freshUser = freshUsers[email] || {}
  freshUsers[email] = {
    ...freshUser,
    aiCache: { ...(freshUser.aiCache || {}), [paper.arxivId]: result },
  }
  await setStore('users', freshUsers)

  return result
}
