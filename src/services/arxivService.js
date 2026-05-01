import { translateToEnglish, translateToChinese } from './translateService'
import { safeFetch } from './apiService'

// ─── arXiv API proxy (for CORS bypass) ────────────────────────────────

const PROXY_STORAGE_KEY = 'arxivProxyUrl'

const getProxyUrl = () => {
  try { return localStorage.getItem(PROXY_STORAGE_KEY) || '' }
  catch { return '' }
}

export const setProxyUrl = (url) => {
  try {
    if (url) localStorage.setItem(PROXY_STORAGE_KEY, url)
    else localStorage.removeItem(PROXY_STORAGE_KEY)
  } catch {}
}

export const getConfiguredProxyUrl = () => getProxyUrl()

const parseArxivXML = (xmlText) => {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, 'application/xml')
  const entries = Array.from(doc.querySelectorAll('entry'))

  return entries.map(entry => {
    const idText = entry.querySelector('id')?.textContent?.trim() || ''
    const arxivId = idText.replace(/^https?:\/\/arxiv\.org\/abs\//, '')

    const title = (entry.querySelector('title')?.textContent || '')
      .trim().replace(/\s+/g, ' ')

    const summary = (entry.querySelector('summary')?.textContent || '')
      .trim().replace(/\s+/g, ' ')

    // Parse authors with affiliation data for disambiguation
    const authorElements = Array.from(entry.querySelectorAll('author'))
    const authorDetails = authorElements.map(a => ({
      name: a.querySelector('name')?.textContent?.trim() || '',
      affiliation: a.querySelector('affiliation')?.textContent?.trim() || '',
    }))
    const authors = authorDetails.map(a => a.name)

    const published = entry.querySelector('published')?.textContent?.trim() || ''
    const date = published ? published.substring(0, 10) : ''

    const categories = Array.from(entry.querySelectorAll('category'))
      .map(c => c.getAttribute('term'))
      .filter(Boolean)

    return {
      arxivId,
      title,
      summary,
      authors,
      authorDetails,
      date,
      primaryCategory: categories[0] || '',
      url: `https://arxiv.org/abs/${arxivId}`,
      pdfUrl: `https://arxiv.org/pdf/${arxivId}`,
    }
  })
}

const ARXIV_API = 'https://export.arxiv.org/api/query'
const IS_ELECTRON = typeof window !== 'undefined' && window.electronAPI?.isElectron === true

const buildArxivUrl = (query, maxResults) =>
  `${ARXIV_API}?${query}&start=0&max_results=${maxResults}&sortBy=submittedDate&sortOrder=descending`

export const fetchArxiv = async (query, maxResults = 10) => {
  const directUrl = buildArxivUrl(query, maxResults)

  // Electron: direct fetch via IPC proxy (no CORS issue)
  if (IS_ELECTRON) {
    const res = await safeFetch(directUrl, { timeout: 20000 })
    if (!res.ok) throw new Error(`arXiv API error: ${res.status}`)
    return parseArxivXML(await res.text())
  }

  // Web: try proxy first, then direct as fallback
  const proxyUrl = getProxyUrl()
  const urls = proxyUrl
    ? [buildArxivUrl(query, maxResults).replace(ARXIV_API, proxyUrl), directUrl]
    : [directUrl]

  for (const url of urls) {
    try {
      const res = await safeFetch(url, { timeout: 20000 })
      if (!res.ok) {
        if (res.status >= 400 && res.status < 500) throw new Error(`arXiv API error: ${res.status}`)
        continue
      }
      return parseArxivXML(await res.text())
    } catch (err) {
      if (err.message?.startsWith('arXiv API error:')) throw err
      // Network error — try next URL
    }
  }

  throw new Error('arXiv API unreachable')
}

// Translate titles and summaries of papers (batched to avoid API rate limiting)
export const translatePapers = async (papers) => {
  const BATCH_SIZE = 4
  for (let i = 0; i < papers.length; i += BATCH_SIZE) {
    const batch = papers.slice(i, i + BATCH_SIZE)
    await Promise.all(batch.map(async (paper) => {
      try {
        paper.cnTitle = (await translateToChinese(paper.title)) || null
      } catch {
        paper.cnTitle = null
      }
    }))
  }
}

// ─── Search by category (for daily recommendations) ─────────────────

export const searchByCategory = async (category, maxResults = 10) => {
  const papers = await fetchArxiv(`search_query=cat:${encodeURIComponent(category)}`, maxResults)
  await translatePapers(papers)
  return papers
}

// ─── Multi-category search ──────────────────────────────────────────

export const searchByCategories = async (categories, maxResults = 5) => {
  if (!categories?.length) return []
  const query = categories.map(c => `cat:${encodeURIComponent(c)}`).join('+OR+')
  const papers = await fetchArxiv(`search_query=${query}`, maxResults * categories.length)
  await translatePapers(papers)
  return papers
}

// ─── DeepSeek keyword optimization ──────────────────────────────────

const optimizeKeywordsWithDeepSeek = async (chineseQuery, apiKey) => {
  let text = ''
  try {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: `用户搜索中文关键词"${chineseQuery}"查找学术论文。请提取3-5个最关键的英文搜索词（空格分隔），只返回英文关键词，不要解释。例如："量子算法 引力波 探测" → "quantum algorithm gravitational wave detection"`,
        }],
      }),
      signal: AbortSignal.timeout(10000),
    })
    if (res.ok) {
      const data = await res.json()
      text = data?.choices?.[0]?.message?.content?.trim() || ''
    }
  } catch { /* fall through */ }

  if (text) {
    return text.replace(/[・•\-–—]/g, ' ').replace(/\s+/g, ' ')
  }
  return null
}

// ─── Relevance scoring ─────────────────────────────────────────────

const computeRelevance = (paper, searchTerms) => {
  const title = (paper.title || '').toLowerCase()
  const summary = (paper.summary || '').toLowerCase()
  let score = 0
  for (const term of searchTerms) {
    const t = term.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!t || t.length < 2) continue
    if (title.includes(t)) score += 3
    if (summary.includes(t)) score += 1
  }
  const maxScore = searchTerms.filter(t => t.length >= 2).length * 3
  return maxScore > 0 ? Math.min(score / maxScore, 1) : 0
}

// ─── Multi-strategy search ─────────────────────────────────────────

const multiStrategySearch = async (terms, maxResults = 10) => {
  if (!terms?.length) return []
  const seen = new Set()
  const results = []

  // Run AND and OR searches in parallel for speed
  const queries = []

  // Strategy 1: AND search (most relevant)
  const andQuery = `search_query=${terms.map(t => `all:${encodeURIComponent(t)}`).join('+AND+')}`
  queries.push(fetchArxiv(andQuery, maxResults).then(papers => ({ papers })))

  // Strategy 2: OR search (broader recall, run in parallel)
  if (terms.length > 1) {
    const orQuery = `search_query=${terms.map(t => `all:${encodeURIComponent(t)}`).join('+OR+')}`
    queries.push(fetchArxiv(orQuery, maxResults).then(papers => ({ papers })))
  }

  const settled = await Promise.allSettled(queries)
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      for (const p of result.value.papers) {
        if (!seen.has(p.arxivId)) {
          seen.add(p.arxivId)
          results.push(p)
        }
      }
    }
  }

  // Strategy 3: If still few results, search individual key terms (sequential, rare case)
  if (results.length < 3) {
    const keyTerms = terms.filter(t => t.length >= 2).slice(0, 5)
    for (const term of keyTerms) {
      if (results.length >= maxResults) break
      try {
        const singlePapers = await fetchArxiv(`search_query=all:${encodeURIComponent(term)}`, 8)
        for (const p of singlePapers) {
          if (!seen.has(p.arxivId)) {
            seen.add(p.arxivId)
            results.push(p)
          }
        }
      } catch { /* continue */ }
    }
  }

  // Sort by relevance
  for (const p of results) {
    p._relevance = computeRelevance(p, terms)
  }
  results.sort((a, b) => b._relevance - a._relevance)

  return results.slice(0, maxResults)
}

// ─── Keyword search (all / author / title) ──────────────────────────

const translateOrThrow = async (text) => {
  if (!/[一-龥]/.test(text)) return text
  const translated = await translateToEnglish(text)
  if (/[一-龥]/.test(translated)) {
    // Strip remaining Chinese characters instead of throwing — keeps partial translations usable
    const stripped = translated.replace(/[^\x00-\x7F]+/g, ' ').replace(/\s+/g, ' ').trim()
    if (stripped.length < 2) throw new Error('TRANSLATION_FAILED')
    return stripped
  }
  return translated
}

export const searchArxiv = async (keyword, type = 'all', deepseekApiKey = '') => {
  let query = ''

  if (type === 'author') {
    const name = keyword.trim()
    const nameEn = /[一-龥]/.test(name) ? await translateOrThrow(name) : name
    const cleanName = nameEn.replace(/\s+/g, ' ')

    let papers = []

    // Strategy 1: exact author name
    query = `search_query=au:"${cleanName}"`
    papers = await fetchArxiv(query, 10)

    // Strategy 2: try last name only (if exact match returned nothing)
    if (papers.length === 0) {
      const lastName = cleanName.split(' ').filter(Boolean).pop()
      if (lastName && lastName.length > 2) {
        query = `search_query=au:"${lastName}"`
        papers = await fetchArxiv(query, 10)
      }
    }

    // Strategy 3: search last name in all fields
    if (papers.length === 0) {
      const lastName = cleanName.split(' ').filter(Boolean).pop()
      if (lastName && lastName.length > 2) {
        query = `search_query=all:${encodeURIComponent(lastName)}`
        papers = await fetchArxiv(query, 5)
      }
    }

    if (papers.length === 0) throw new Error('NO_RESULTS')

    // Compute relevance for consistent display with keyword search
    const nameTerms = cleanName.split(/\s+/).filter(Boolean)
    for (const p of papers) {
      p._relevance = computeRelevance(p, nameTerms)
    }
    papers.sort((a, b) => b._relevance - a._relevance)

    await translatePapers(papers)
    return papers
  }

  if (type === 'title') {
    let kw = keyword.trim()
    if (/[一-龥]/.test(kw)) kw = await translateOrThrow(kw)

    let papers = []

    // Strategy 1: exact phrase in title field
    query = `search_query=ti:"${kw}"`
    papers = await fetchArxiv(query, 10)

    // Strategy 2: AND-join individual terms in title field
    if (papers.length === 0) {
      const terms = kw.split(/\s+/).filter(Boolean)
      if (terms.length > 1) {
        query = `search_query=${terms.map(t => `ti:${encodeURIComponent(t)}`).join('+AND+')}`
        papers = await fetchArxiv(query, 10)
      }
    }

    // Strategy 3: fall back to all: field (broader match)
    if (papers.length === 0) {
      query = `search_query=all:${encodeURIComponent(kw)}`
      papers = await fetchArxiv(query, 10)
    }

    if (papers.length === 0) throw new Error('NO_RESULTS')

    // Compute relevance for consistent display with keyword search
    const kwTerms = kw.split(/\s+/).filter(Boolean)
    for (const p of papers) {
      p._relevance = computeRelevance(p, kwTerms)
    }
    papers.sort((a, b) => b._relevance - a._relevance)

    await translatePapers(papers)
    return papers
  }

  // ─── Keyword search (all) ─────────────────────────────
  let kw = keyword.trim()
  if (!kw) throw new Error('NO_RESULTS')

  let terms = []

  // If Chinese query and DeepSeek available, use it for keyword optimization
  if (/[一-龥]/.test(kw) && deepseekApiKey) {
    const optimized = await optimizeKeywordsWithDeepSeek(kw, deepseekApiKey)
    if (optimized) {
      terms = optimized.split(/\s+/).filter(Boolean)
    }
  }

  // Fallback: translate Chinese to English
  if (terms.length === 0) {
    if (/[一-龥]/.test(kw)) {
      kw = await translateOrThrow(kw)
    }
    terms = kw.split(/\s+/).filter(Boolean)
  }

  if (terms.length === 0) throw new Error('NO_RESULTS')

  // Multi-strategy search
  let papers = await multiStrategySearch(terms, 10)

  if (papers.length > 0) {
    await translatePapers(papers)
    return papers
  }
  throw new Error('NO_RESULTS')
}

// ─── Semantic Scholar citation count fetching ────────────────────────

export const fetchCitationCounts = async (papers) => {
  if (!papers?.length) return
  const ids = papers.map(p => `ArXiv:${p.arxivId}`)
  try {
    const res = await fetch('https://api.semanticscholar.org/graph/v1/paper/batch?fields=citationCount', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
      signal: AbortSignal.timeout(10000),
    })
    if (res.ok) {
      const data = await res.json()
      if (data?.data) {
        papers.forEach((paper, i) => {
          const result = data.data[i]
          paper._citationCount = result?.citationCount ?? 0
        })
      }
    }
  } catch {
    // Silently fail — citation data is optional
  }
}

// ─── Sort modes for search results ───────────────────────────────────

export const SORT_MODES = [
  { id: 'relevance', label: '相关性' },
  { id: 'date', label: '时间排序' },
  { id: 'citations', label: '被引用数' },
  { id: 'combined', label: '综合排序' },
]

const RELEVANCE_THRESHOLD = 0.3

const dateToScore = (dateStr) => {
  if (!dateStr) return 0
  const d = new Date(dateStr).getTime()
  if (!d) return 0
  const now = Date.now()
  const age = now - d
  const maxAge = 365 * 24 * 60 * 60 * 1000 // 1 year
  return Math.max(0, 1 - age / maxAge)
}

const citationToScore = (count) => Math.min((count || 0) / 100, 1)

export const sortPapers = (papers, mode) => {
  const sorted = [...papers]
  switch (mode) {
    case 'relevance':
      sorted.sort((a, b) => (b._relevance || 0) - (a._relevance || 0))
      break
    case 'date':
      sorted.sort((a, b) => {
        const aRel = (a._relevance || 0) >= RELEVANCE_THRESHOLD
        const bRel = (b._relevance || 0) >= RELEVANCE_THRESHOLD
        if (aRel !== bRel) return bRel - aRel
        return (b.date || '').localeCompare(a.date || '')
      })
      break
    case 'citations':
      sorted.sort((a, b) => {
        const aRel = (a._relevance || 0) >= RELEVANCE_THRESHOLD
        const bRel = (b._relevance || 0) >= RELEVANCE_THRESHOLD
        if (aRel !== bRel) return bRel - aRel
        return (b._citationCount || 0) - (a._citationCount || 0)
      })
      break
    case 'combined': {
      // Normalize date scores within the current set
      const dateScores = {}
      const citScores = {}
      for (const p of sorted) {
        dateScores[p.arxivId] = dateToScore(p.date)
        citScores[p.arxivId] = citationToScore(p._citationCount)
      }
      sorted.sort((a, b) => {
        const aRel = (a._relevance || 0) >= RELEVANCE_THRESHOLD
        const bRel = (b._relevance || 0) >= RELEVANCE_THRESHOLD
        if (aRel !== bRel) return bRel - aRel
        const aScore = (a._relevance || 0) * 0.5 + dateScores[a.arxivId] * 0.25 + citScores[a.arxivId] * 0.25
        const bScore = (b._relevance || 0) * 0.5 + dateScores[b.arxivId] * 0.25 + citScores[b.arxivId] * 0.25
        return bScore - aScore
      })
      break
    }
  }
  return sorted
}

// ─── TF-IDF keyword extraction from favorites ────────────────────────
// Inspired by arxiv-sanity-lite (Karpathy): extract distinctive terms
// from favorited paper abstracts to use as recommendation queries.

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'in', 'to', 'for', 'and', 'or', 'is', 'are',
  'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
  'did', 'will', 'would', 'could', 'should', 'may', 'might', 'shall',
  'can', 'need', 'dare', 'ought', 'used', 'this', 'that', 'these', 'those',
  'it', 'its', 'they', 'them', 'their', 'we', 'our', 'you', 'your', 'he',
  'she', 'his', 'her', 'him', 'i', 'me', 'my', 'mine', 'with', 'about',
  'against', 'between', 'into', 'through', 'during', 'before', 'after',
  'above', 'below', 'from', 'up', 'down', 'on', 'off', 'over', 'under',
  'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where',
  'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
  'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same',
  'so', 'than', 'too', 'very', 'just', 'because', 'as', 'until', 'while',
  'but', 'by', 'at', 'also', 'based', 'using', 'proposed', 'method',
  'results', 'show', 'shows', 'shown', 'approach', 'new', 'novel',
  'experimental', 'experiments', 'paper', 'study', 'work', 'performance',
  'make', 'made', 'well', 'one', 'two', 'three', 'first', 'second',
  'however', 'due', 'large', 'different', 'significant', 'via',
])

const tokenize = (text) => {
  return (text || '').toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t))
}

export const extractKeywordsFromPapers = (papers, topN = 10) => {
  if (!papers?.length) return []

  // Per-paper term frequency and document frequency across all papers
  const df = {} // document frequency (how many papers contain the term)
  const termsByPaper = {} // { arxivId: { term: count } }
  const totalTerms = {} // total terms per paper

  for (const p of papers) {
    const terms = tokenize(p.title + ' ' + (p.summary || '').slice(0, 300))
    const seen = new Set()
    const localCounts = {}

    for (const t of terms) {
      localCounts[t] = (localCounts[t] || 0) + 1
      if (!seen.has(t)) {
        seen.add(t)
        df[t] = (df[t] || 0) + 1
      }
    }
    totalTerms[p.arxivId] = terms.length
    termsByPaper[p.arxivId] = localCounts
  }

  // Aggregate normalized TF-IDF scores: per-paper TF then IDF
  const N = papers.length
  const aggregated = {}
  for (const [arxivId, localCounts] of Object.entries(termsByPaper)) {
    const total = totalTerms[arxivId] || 1
    for (const [term, count] of Object.entries(localCounts)) {
      const tf = count / total // per-paper term frequency normalization
      const idf = Math.log((N + 1) / ((df[term] || 0) + 1)) + 1
      aggregated[term] = (aggregated[term] || 0) + tf * idf
    }
  }

  const scored = Object.entries(aggregated).map(([term, score]) => ({ term, score }))
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topN).map(s => s.term)
}

// ─── Citation export ─────────────────────────────────────────────────

export const generateCitation = (paper, format = 'bibtex') => {
  const year = paper.date ? paper.date.substring(0, 4) : '????'
  const authors = paper.authors || []
  const arxivId = paper.arxivId || ''
  const title = paper.title || ''
  const url = paper.url || `https://arxiv.org/abs/${arxivId}`

  if (format === 'bibtex') {
    const firstAuthorLastName =
      (authors[0] || '').split(' ').pop().replace(/[^a-zA-Z]/g, '') || 'Unknown'
    const key = `${firstAuthorLastName}${year}_${arxivId.replace(/\//g, '_')}`
    const authorStr = authors
      .map(a => {
        const parts = a.trim().split(/\s+/)
        return parts.length < 2 ? a : `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(' ')}`
      })
      .join(' and ')
    return (
      `@article{${key},\n` +
      `  title={${title}},\n` +
      `  author={${authorStr}},\n` +
      `  journal={arXiv preprint arXiv:${arxivId}},\n` +
      `  year={${year}},\n` +
      `  url={${url}}\n}`
    )
  }

  if (format === 'apa') {
    const fmtAPA = (name) => {
      const parts = name.trim().split(/\s+/)
      if (parts.length < 2) return name
      const last = parts[parts.length - 1]
      const initials = parts.slice(0, -1).map(p => p[0] + '.').join(' ')
      return `${last}, ${initials}`
    }
    let authorStr = ''
    if (authors.length === 1) authorStr = fmtAPA(authors[0]) + '.'
    else if (authors.length > 1)
      authorStr = authors.slice(0, -1).map(fmtAPA).join(', ') + ', & ' + fmtAPA(authors[authors.length - 1]) + '.'
    return `${authorStr} (${year}). ${title}. arXiv preprint arXiv:${arxivId}. ${url}`
  }

  // plain text
  const plainAuthors = authors.length === 0 ? '' :
    authors.slice(0, 3).join(', ') + (authors.length > 3 ? ' et al.' : '') + '.'
  return `${plainAuthors} (${year}). "${title}". arXiv:${arxivId}. ${url}`
}

