import { translateToEnglish } from './translateService'

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

    const authors = Array.from(entry.querySelectorAll('author name'))
      .map(a => a.textContent.trim())

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
      date,
      primaryCategory: categories[0] || '',
      url: `https://arxiv.org/abs/${arxivId}`,
    }
  })
}

const ARXIV_BASE = import.meta.env.VITE_IS_ELECTRON
  ? 'https://export.arxiv.org/api/query'
  : '/.netlify/functions/arxiv'

export const searchByCategory = async (category) => {
  const url =
    `${ARXIV_BASE}` +
    `?search_query=cat:${encodeURIComponent(category)}` +
    `&start=0&max_results=5` +
    `&sortBy=submittedDate&sortOrder=descending`

  const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`arXiv API 返回错误: ${res.status}`)

  const text = await res.text()
  return parseArxivXML(text)
}

export const searchArxiv = async (keyword) => {
  const englishKeyword = await translateToEnglish(keyword.trim())
  const terms = englishKeyword.trim().split(/\s+/).filter(Boolean)
  const query = terms.map(t => encodeURIComponent(t)).join('+AND+')

  const url =
    `${ARXIV_BASE}` +
    `?search_query=all:${query}` +
    `&start=0&max_results=5` +
    `&sortBy=submittedDate&sortOrder=descending`

  const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`arXiv API 返回错误: ${res.status}`)

  const text = await res.text()
  const papers = parseArxivXML(text)
  if (papers.length === 0) throw new Error('NO_RESULTS')
  return papers
}
