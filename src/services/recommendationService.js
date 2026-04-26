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

// Returns a Chinese summary string (Claude AI highlights or machine translation)
export const getChineseSummary = async (paper, claudeApiKey, email) => {
  const users = (await getStore('users')) || {}
  const user = users[email] || {}
  const cache = user.sCache || {}

  if (cache[paper.arxivId]) return cache[paper.arxivId]

  let summary = null

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
          max_tokens: 400,
          messages: [{
            role: 'user',
            content: `请用中文（120-150字）介绍这篇论文的核心贡献和亮点，涵盖：主要方法、关键结果、研究意义，直接给出内容，不加标题前缀。\n\n标题：${paper.title}\n摘要：${paper.summary.slice(0, 800)}`,
          }],
        }),
        signal: AbortSignal.timeout(25000),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.content?.[0]?.text) {
          summary = data.content[0].text
        }
      }
    } catch (err) {
      console.warn('Claude API failed:', err.message)
    }
  }

  if (!summary) {
    try {
      const translated = await translateToChineseFree(paper.summary.slice(0, 400))
      summary = translated ? `[机器翻译] ${translated}` : null
    } catch {
      summary = null
    }
  }

  const result = summary || '暂时无法获取摘要，请在设置中配置 Claude API Key 以获取 AI 解读。'

  const freshUsers = (await getStore('users')) || {}
  const freshUser = freshUsers[email] || {}
  freshUsers[email] = {
    ...freshUser,
    sCache: { ...(freshUser.sCache || {}), [paper.arxivId]: result },
  }
  await setStore('users', freshUsers)

  return result
}
