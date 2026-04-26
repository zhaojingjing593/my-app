import { useState, useEffect } from 'react'
import { openExternalLink, getStore } from '../services/storageService'
import { trackPaperClick, getChineseSummary } from '../services/recommendationService'
import { useApp } from '../App'

const formatAuthors = (authors) => {
  if (authors.length === 0) return '未知作者'
  if (authors.length <= 3) return authors.join(', ')
  return authors.slice(0, 3).join(', ') + ' et al.'
}

const formatDate = (dateStr) => {
  if (!dateStr) return ''
  const [year, month, day] = dateStr.split('-')
  return `${year}/${month}/${day}`
}

export default function PaperCard({ paper, searchKeyword = '', source = 'search', autoSummary = true }) {
  const { currentUser } = useApp()
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [summary, setSummary] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState(false)

  const fetchSummary = async () => {
    if (summary || summaryLoading) return
    setSummaryLoading(true)
    setSummaryError(false)
    try {
      const users = (await getStore('users')) || {}
      const claudeApiKey = users[currentUser]?.claudeApiKey || null
      const text = await getChineseSummary(paper, claudeApiKey, currentUser)
      setSummary(text || '暂时无法获取摘要，请稍后重试。')
    } catch {
      setSummaryError(true)
    } finally {
      setSummaryLoading(false)
    }
  }

  useEffect(() => {
    if (autoSummary) fetchSummary()
  }, [autoSummary])

  const handleOpen = async () => {
    await openExternalLink(paper.url)
    trackPaperClick(currentUser, paper, source)
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(paper.url)
    } catch {
      const el = document.createElement('textarea')
      el.value = paper.url
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isMachineTranslation = summary?.startsWith('[机器翻译]')

  return (
    <div className="paper-card">
      <div className="paper-meta">
        {paper.primaryCategory && (
          <span className="category-badge">{paper.primaryCategory}</span>
        )}
        <span className="paper-date">{formatDate(paper.date)}</span>
      </div>

      <div
        className="paper-title"
        onClick={handleOpen}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && handleOpen()}
      >
        {paper.cnTitle && (
          <span className="title-cn">{paper.cnTitle}</span>
        )}
        <span className="title-en">{paper.title}</span>
      </div>

      <div className="paper-authors">{formatAuthors(paper.authors)}</div>

      {paper.summary && (
        <div className="paper-abstract">
          <p className={`abstract-text ${expanded ? '' : 'collapsed'}`}>
            {paper.summary}
          </p>
          <button className="btn-expand" onClick={() => setExpanded(!expanded)}>
            {expanded ? '收起英文摘要 ▲' : '展开英文摘要 ▼'}
          </button>
        </div>
      )}

      <div className="chinese-summary-section">
        {autoSummary && !summary && !summaryLoading && !summaryError && (
          <button className="btn-chinese-summary" onClick={fetchSummary}>
            ✨ 查看中文解读
          </button>
        )}
        {summaryLoading && (
          <div className="summary-loading">
            <span className="summary-spinner" /> 正在生成中文解读...
          </div>
        )}
        {summaryError && (
          <button className="btn-chinese-summary btn-retry" onClick={fetchSummary}>
            ⚠️ 获取失败，点击重试
          </button>
        )}
        {summary && (
          <div className={`chinese-summary-content ${isMachineTranslation ? 'machine-translated' : ''}`}>
            <span className="summary-label">
              {isMachineTranslation ? '📝 摘要翻译' : '✨ AI 亮点解读'}
            </span>
            <p className="summary-text">
              {isMachineTranslation ? summary.replace('[机器翻译] ', '') : summary}
            </p>
          </div>
        )}
      </div>

      <div className="paper-actions">
        <button className="btn-open" onClick={handleOpen}>
          打开论文 →
        </button>
        <button className="btn-copy" onClick={handleCopy}>
          {copied ? '✓ 已复制' : '复制链接'}
        </button>
      </div>
    </div>
  )
}
