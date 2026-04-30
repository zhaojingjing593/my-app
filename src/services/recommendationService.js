import { getStore, setStore } from './storageService'
import { fetchArxiv, translatePapers, extractKeywordsFromPapers } from './arxivService'
import { translateToChinese, translateToEnglish } from './translateService'

const today = () => new Date().toISOString().split('T')[0]

// Fisher-Yates shuffle for variety in recommendations
const shuffle = (arr) => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Simple string hash for deterministic rotation
const hashStr = (s) => {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i)
    h |= 0
  }
  return h
}

// ─── Default subscription categories ────────────────────────────────

export const DEFAULT_CATEGORIES = [
  { id: 'cs.AI', label: '人工智能' },
  { id: 'cs.LG', label: '机器学习' },
  { id: 'cs.CL', label: '自然语言处理' },
  { id: 'cs.CV', label: '计算机视觉' },
  { id: 'quant-ph', label: '量子物理' },
  { id: 'gr-qc', label: '引力波/广义相对论' },
  { id: 'astro-ph', label: '天体物理' },
  { id: 'physics', label: '物理' },
  { id: 'stat.ML', label: '统计学习' },
  { id: 'cs.IR', label: '信息检索' },
  { id: 'cs.NE', label: '神经网络' },
  { id: 'math.NA', label: '数值分析/数据处理' },
]

// ─── User preferences ───────────────────────────────────────────────

export const getUserCategories = async (email) => {
  const users = (await getStore('users')) || {}
  const user = users[email] || {}
  return user.categories || DEFAULT_CATEGORIES.map(c => c.id)
}

export const saveUserCategories = async (email, categories) => {
  const users = (await getStore('users')) || {}
  users[email] = { ...(users[email] || {}), categories }
  await setStore('users', users)
}

// ─── Custom categories ──────────────────────────────────────────────

export const POPULAR_CATEGORIES = [
  { id: 'cs.RO', label: '机器人学' },
  { id: 'cs.SI', label: '社交网络' },
  { id: 'cs.CR', label: '密码学/安全' },
  { id: 'cs.DS', label: '数据结构/算法' },
  { id: 'cs.SE', label: '软件工程' },
  { id: 'cs.HC', label: '人机交互' },
  { id: 'cs.DB', label: '数据库' },
  { id: 'cs.DC', label: '分布式计算' },
  { id: 'cs.MM', label: '多媒体' },
  { id: 'cs.GT', label: '博弈论' },
  { id: 'eess.AS', label: '音频/语音处理' },
  { id: 'eess.IV', label: '图像/视频处理' },
  { id: 'stat.TH', label: '统计理论' },
  { id: 'math.OC', label: '优化控制' },
  { id: 'q-bio.QM', label: '定量生物学' },
  { id: 'q-fin.ST', label: '金融统计' },
]

export const getCustomCategories = async (email) => {
  const users = (await getStore('users')) || {}
  const user = users[email] || {}
  return user.customCategories || []
}

export const addCustomCategory = async (email, id, label) => {
  const users = (await getStore('users')) || {}
  const user = users[email] || {}
  const customs = user.customCategories || []
  if (customs.some(c => c.id === id)) return false
  // Add to custom categories list
  const updatedCustoms = [...customs, { id, label }]
  // Also add to active categories
  const activeCats = user.categories || DEFAULT_CATEGORIES.map(c => c.id)
  if (!activeCats.includes(id)) {
    activeCats.push(id)
  }
  users[email] = { ...user, customCategories: updatedCustoms, categories: activeCats }
  await setStore('users', users)
  return true
}

export const removeCustomCategory = async (email, id) => {
  const users = (await getStore('users')) || {}
  const user = users[email] || {}
  const customs = (user.customCategories || []).filter(c => c.id !== id)
  // Also remove from active categories
  const activeCats = (user.categories || DEFAULT_CATEGORIES.map(c => c.id)).filter(c => c !== id)
  users[email] = { ...user, customCategories: customs, categories: activeCats }
  await setStore('users', users)
}

// Get all active categories (defaults + customs)
export const getAllActiveCategoryLabels = async (email) => {
  const users = (await getStore('users')) || {}
  const user = users[email] || {}
  const activeIds = user.categories || DEFAULT_CATEGORIES.map(c => c.id)
  const customs = user.customCategories || []

  const allLabels = []
  for (const id of activeIds) {
    const def = DEFAULT_CATEGORIES.find(c => c.id === id)
    if (def) { allLabels.push(def); continue }
    const cust = customs.find(c => c.id === id)
    if (cust) { allLabels.push(cust); continue }
    allLabels.push({ id, label: id })
  }
  // Also add any custom categories that aren't in the active list (for display in settings)
  for (const c of customs) {
    if (!allLabels.some(l => l.id === c.id)) {
      allLabels.push(c)
    }
  }
  return allLabels
}

// ─── Translation config ─────────────────────────────────────────────

export const getTranslationConfig = async (email) => {
  const users = (await getStore('users')) || {}
  const user = users[email] || {}
  return {
    provider: user.translationProvider || 'auto',
    apiKey: user.translationApiKey || '',
  }
}

export const saveTranslationConfig = async (email, config) => {
  const users = (await getStore('users')) || {}
  users[email] = {
    ...(users[email] || {}),
    translationProvider: config.provider,
    translationApiKey: config.apiKey,
  }
  await setStore('users', users)
}

export const getAutoRefreshInterval = async (email) => {
  const users = (await getStore('users')) || {}
  const user = users[email] || {}
  return user.autoRefreshInterval || 0 // 0 = off
}

export const saveAutoRefreshInterval = async (email, hours) => {
  const users = (await getStore('users')) || {}
  users[email] = { ...(users[email] || {}), autoRefreshInterval: hours }
  await setStore('users', users)
}

export const getRecentDaysFilter = async (email) => {
  const users = (await getStore('users')) || {}
  const user = users[email] || {}
  return user.recentDays || 0 // 0 = all
}

export const saveRecentDaysFilter = async (email, days) => {
  const users = (await getStore('users')) || {}
  users[email] = { ...(users[email] || {}), recentDays: days }
  await setStore('users', users)
}

export const getFontSize = async (email) => {
  if (!email) return 'medium'
  const users = (await getStore('users')) || {}
  const user = users[email] || {}
  return user.fontSize || 'medium'
}

export const saveFontSize = async (email, fontSize) => {
  const users = (await getStore('users')) || {}
  users[email] = { ...(users[email] || {}), fontSize }
  await setStore('users', users)
}

export const getFontFamily = async (email) => {
  if (!email) return 'system'
  const users = (await getStore('users')) || {}
  const user = users[email] || {}
  return user.fontFamily || 'system'
}

export const saveFontFamily = async (email, fontFamily) => {
  const users = (await getStore('users')) || {}
  users[email] = { ...(users[email] || {}), fontFamily }
  await setStore('users', users)
}

// ─── Paper click tracking ───────────────────────────────────────────

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
  users[email] = { ...user, clickedPapers: [record, ...prev].slice(0, 100) }
  await setStore('users', users)
}

// ─── Daily recommendations ──────────────────────────────────────────

export const getOrFetchRecommendations = async (email) => {
  const users = (await getStore('users')) || {}
  const user = users[email] || {}

  // Check if today's recommendations already exist in history
  const history = user.recommendationsHistory || []
  const todayEntry = history.find(h => h.date === today())
  if (todayEntry?.papers?.length > 0) {
    return filterRecentPapers(todayEntry.papers, user.recentDays)
  }

  // Build keyword list from search history AND favorites
  const searchHistory = user.searchHistory || []
  const favorites = user.favorites || []
  let keywords = searchHistory.slice(0, 5)

  // Extract distinctive keywords from favorited papers (TF-IDF, like arxiv-sanity-lite)
  if (favorites.length > 0) {
    const favKeywords = extractKeywordsFromPapers(favorites, 8)
    keywords = [...favKeywords.filter(k => !keywords.includes(k)), ...keywords].slice(0, 10)
  }

  let papers = []
  const MAX_RESULTS_PER_KEYWORD = 8
  const MAX_TOTAL_PAPERS = 30

  try {
    if (keywords.length === 0) {
      // No history — rotate through categories for variety
      const cats = ['cs.AI', 'cs.LG', 'cs.CL', 'cs.CV', 'quant-ph', 'gr-qc', 'astro-ph', 'cs.IR', 'cs.NE', 'cs.RO', 'cs.SE', 'cs.CR']
      const catIdx = Math.abs(hashStr(email + today())) % cats.length
      papers = await fetchArxiv(`search_query=cat:${cats[catIdx]}`, 15)
    } else {
      const translatedKwMap = {}
      const chineseKws = keywords.filter(kw => /[一-龥]/.test(kw))
      if (chineseKws.length > 0) {
        const translations = await Promise.allSettled(
          chineseKws.map(kw => translateToEnglish(kw).then(result => ({ kw, result })))
        )
        for (const t of translations) {
          if (t.status === 'fulfilled' && t.value.result && !/[一-龥]/.test(t.value.result)) {
            translatedKwMap[t.value.kw] = t.value.result
          }
        }
      }

      const seen = new Set()
      for (const kw of keywords) {
        const searchTerm = translatedKwMap[kw] || kw
        try {
          const result = await fetchArxiv(`search_query=all:${encodeURIComponent(searchTerm)}`, MAX_RESULTS_PER_KEYWORD)
          for (const p of result) {
            if (!seen.has(p.arxivId)) {
              seen.add(p.arxivId)
              papers.push(p)
            }
          }
        } catch { /* skip */ }
        if (papers.length >= MAX_TOTAL_PAPERS) break
      }

      if (papers.length < 10) {
        const allTerms = keywords
          .flatMap(kw => kw.split(/\s+/))
          .filter(t => t.length > 2)
          .slice(0, 5)
        for (const term of allTerms) {
          if (papers.length >= MAX_TOTAL_PAPERS) break
          const searchTerm = translatedKwMap[term] || term
          try {
            const result = await fetchArxiv(`search_query=all:${encodeURIComponent(searchTerm)}`, 8)
            for (const p of result) {
              if (!seen.has(p.arxivId)) {
                seen.add(p.arxivId)
                papers.push(p)
              }
            }
          } catch { /* skip */ }
        }
      }
    }
  } catch {
    try {
      const cats = ['cs.AI', 'cs.LG', 'cs.CL', 'cs.CV', 'quant-ph', 'gr-qc', 'astro-ph']
      const catIdx = Math.abs(hashStr(email + today())) % cats.length
      papers = await fetchArxiv(`search_query=cat:${cats[catIdx]}`, 15)
    } catch {
      papers = []
    }
  }

  if (papers.length > 0) {
    await translatePapers(papers)
  }

  const seen = new Set()
  papers = papers.filter(p => {
    if (seen.has(p.arxivId)) return false
    seen.add(p.arxivId)
    return true
  }).slice(0, MAX_TOTAL_PAPERS)

  if (papers.length > 0) {
    // Shuffle for variety — different order each time
    papers = shuffle(papers)
    // Append to history instead of overwriting
    const newHistory = [
      { date: today(), papers },
      ...history.filter(h => h.date !== today()),
    ].slice(0, 30) // keep last 30 days
    users[email] = { ...user, recommendationsHistory: newHistory }
    await setStore('users', users)
  }

  return filterRecentPapers(papers, user.recentDays)
}

export const refreshRecommendations = async (email) => {
  // Force clear today's entry and re-fetch
  const users = (await getStore('users')) || {}
  const user = users[email] || {}
  const history = (user.recommendationsHistory || []).filter(h => h.date !== today())
  users[email] = { ...user, recommendationsHistory: history }
  await setStore('users', users)
  return getOrFetchRecommendations(email)
}

// ─── Get recommendation history for browsing ────────────────────────

export const getRecommendationsHistory = async (email) => {
  const users = (await getStore('users')) || {}
  const user = users[email] || {}
  return (user.recommendationsHistory || []).slice(0, 30)
}

// ─── Recent days filter ─────────────────────────────────────────────

const filterRecentPapers = (papers, days) => {
  if (!days || days <= 0) return papers
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  return papers.filter(p => {
    if (!p.date) return true
    const d = new Date(p.date)
    return d >= cutoff
  })
}

// ─── Favorites ──────────────────────────────────────────────────────

export const getFavorites = async (email) => {
  if (!email) return []
  const users = (await getStore('users')) || {}
  const user = users[email] || {}
  return user.favorites || []
}

export const toggleFavorite = async (email, paper) => {
  if (!email || !paper?.arxivId) return false
  const users = (await getStore('users')) || {}
  const user = users[email] || {}
  let favorites = user.favorites || []

  const idx = favorites.findIndex(f => f.arxivId === paper.arxivId)
  if (idx >= 0) {
    favorites.splice(idx, 1)
  } else {
    favorites = [{ ...paper, favoritedAt: new Date().toISOString() }, ...favorites]
  }

  users[email] = { ...user, favorites }
  await setStore('users', users)
  return idx < 0 // true = added, false = removed
}

export const isFavorited = async (email, arxivId) => {
  if (!email || !arxivId) return false
  const faves = await getFavorites(email)
  return faves.some(f => f.arxivId === arxivId)
}

export const exportFavorites = async (email) => {
  const faves = await getFavorites(email)
  const json = JSON.stringify(faves, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `arxiv-favorites-${today()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Batch favorite operations ──────────────────────────────────────

export const batchUnfavorite = async (email, arxivIds) => {
  if (!email || !arxivIds?.length) return
  const users = (await getStore('users')) || {}
  const user = users[email] || {}
  const favorites = (user.favorites || []).filter(f => !arxivIds.includes(f.arxivId))
  users[email] = { ...user, favorites }
  await setStore('users', users)
}

export const exportSelectedFavorites = async (email, arxivIds) => {
  const faves = await getFavorites(email)
  const selected = faves.filter(f => arxivIds.includes(f.arxivId))
  if (selected.length === 0) return
  const json = JSON.stringify(selected, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `arxiv-favorites-selected-${today()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Chinese summary via DeepSeek AI ────────────────────────────────

// Mutex to prevent concurrent DeepSeek API calls for the same paper
const pendingSummaries = new Set()

export const getChineseSummary = async (paper, deepseekApiKey, email) => {
  if (!deepseekApiKey) {
    pendingSummaries.delete(paper.arxivId)
    return await fallbackTranslation(paper, email)
  }

  // Check both caches directly — no migration needed
  const users = (await getStore('users')) || {}
  const user = users[email] || {}
  const summaryCache = user.summaryCache || {}
  if (summaryCache[paper.arxivId]) return summaryCache[paper.arxivId]
  const fallbackCache = user.fallbackCache || {}
  if (fallbackCache[paper.arxivId]) return fallbackCache[paper.arxivId]

  // Prevent concurrent API calls for the same paper
  if (pendingSummaries.has(paper.arxivId)) {
    await new Promise(resolve => setTimeout(resolve, 1500))
    const fresh = (await getStore('users')) || {}
    const fu = fresh[email] || {}
    if (fu.summaryCache?.[paper.arxivId]) return fu.summaryCache[paper.arxivId]
    if (fu.fallbackCache?.[paper.arxivId]) return fu.fallbackCache[paper.arxivId]
    return null
  }

  pendingSummaries.add(paper.arxivId)

  let summary = null
  try {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${deepseekApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: `分析以下论文，严格按照指定格式输出中文结果。从"关键结果、研究意义、实验方法、主要启发、亮点创新、热点预测、态势感知"中选择与该论文最相关的2项输出。

标题：${paper.title}
摘要：${paper.summary?.slice(0, 1000) || ''}

输出格式（严格按照以下格式）：
**总结：**
（100-150字简要总结核心内容）

**X：**
（选择的第1个方面内容，X从列表中选）

**Y：**
（选择的第2个方面内容，Y从列表中选）

**关键词：**
keyword1, keyword2, keyword3, keyword4, keyword5`,
        }],
      }),
      signal: AbortSignal.timeout(25000),
    })
    if (res.ok) {
      const data = await res.json()
      summary = data?.choices?.[0]?.message?.content?.trim() || null
    } else if (res.status === 401) {
      pendingSummaries.delete(paper.arxivId)
      return 'API Key 无效，请在设置中检查 DeepSeek Key'
    }
  } catch (err) {
    console.warn('DeepSeek API failed:', err.message)
  }

  if (!summary) {
    pendingSummaries.delete(paper.arxivId)
    return await fallbackTranslation(paper, email)
  }

  // Cache AI summary
  const fresh = (await getStore('users')) || {}
  const freshUser = fresh[email] || {}
  fresh[email] = {
    ...freshUser,
    summaryCache: { ...(freshUser.summaryCache || {}), [paper.arxivId]: summary },
  }
  await setStore('users', fresh)

  pendingSummaries.delete(paper.arxivId)
  return summary
}

const fallbackTranslation = async (paper, email) => {
  const users = (await getStore('users')) || {}
  const user = users[email] || {}
  // Separate cache for fallback translations — won't block AI summary retries
  const cache = user.fallbackCache || {}
  if (cache[paper.arxivId]) return cache[paper.arxivId]

  try {
    const translated = await translateToChinese(paper.summary?.slice(0, 600))
    if (translated) {
      const result = `[摘要翻译] ${translated}`
      const fresh = (await getStore('users')) || {}
      const freshUser = fresh[email] || {}
      fresh[email] = {
        ...freshUser,
        fallbackCache: { ...(freshUser.fallbackCache || {}), [paper.arxivId]: result },
      }
      await setStore('users', fresh)
      return result
    }
  } catch {}
  return null
}

// ─── Onboarding check ───────────────────────────────────────────────

export const isOnboardingDone = async (email) => {
  const users = (await getStore('users')) || {}
  const user = users[email] || {}
  return user.onboardingDone === true
}

export const setOnboardingDone = async (email) => {
  const users = (await getStore('users')) || {}
  users[email] = { ...(users[email] || {}), onboardingDone: true }
  await setStore('users', users)
}

// ─── Structured AI summary parser ───────────────────────────────────

export function parseStructuredSummary(text) {
  const result = { summary: '', aspects: [], keywords: [] }
  if (!text) return result

  const lines = text.split('\n')
  let currentKey = ''
  let currentValue = ''

  const saveSection = (res, key, value) => {
    const trimmed = value.trim()
    if (!trimmed) return
    if (key === '总结') {
      res.summary = trimmed
    } else if (key === '关键词') {
      res.keywords = trimmed.split(/[,，、\s]+/).filter(k => k.trim())
    } else {
      res.aspects.push({ name: key, content: trimmed })
    }
  }

  for (const line of lines) {
    const headerMatch = line.match(/^\*\*([^*]+?)：\*\*(.*)/)
    if (headerMatch) {
      if (currentKey && currentValue.trim()) {
        saveSection(result, currentKey, currentValue.trim())
      }
      currentKey = headerMatch[1].trim()
      currentValue = headerMatch[2] ? headerMatch[2].trim() : ''
    } else if (currentKey) {
      currentValue += (currentValue ? '\n' : '') + line
    }
  }
  if (currentKey && currentValue.trim()) {
    saveSection(result, currentKey, currentValue.trim())
  }

  return result
}
