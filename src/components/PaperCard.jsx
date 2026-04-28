import { useState, useEffect, useCallback } from 'react'
import { openExternalLink, getStore } from '../services/storageService'
import { getChineseSummary, toggleFavorite, isFavorited, trackPaperClick, parseStructuredSummary } from '../services/recommendationService'
import { useApp } from '../App'

const formatDate = (dateStr) => {
  if (!dateStr) return ''
  const [year, month, day] = dateStr.split('-')
  return `${year}/${month}/${day}`
}

export default function PaperCard({ paper, searchKeyword = '', source = 'search', autoSummary = false, relevance }) {
  const { currentUser } = useApp()
  const [copied, setCopied] = useState(false)
  const [summary, setSummary] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState(false)
  const [faved, setFaved] = useState(false)

  useEffect(() => {
    isFavorited(currentUser, paper.arxivId).then(setFaved)
  }, [currentUser, paper.arxivId])

  const fetchSummary = useCallback(async () => {
    if (summary || summaryLoading) return
    setSummaryLoading(true)
    setSummaryError(false)
    try {
      const users = (await getStore('users')) || {}
      const dsk = users[currentUser]?.deepseekApiKey || ''
      const text = await getChineseSummary(paper, dsk, currentUser)
      setSummary(text || null)
    } catch {
      setSummaryError(true)
    } finally {
      setSummaryLoading(false)
    }
  }, [paper, currentUser, summary, summaryLoading])

  useEffect(() => {
    if (autoSummary) fetchSummary()
  }, [autoSummary, fetchSummary])

  const handleOpen = async () => {
    await openExternalLink(paper.url)
    trackPaperClick(currentUser, paper, source)
  }

  const handleOpenPdf = async () => {
    if (paper.pdfUrl) await openExternalLink(paper.pdfUrl)
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

  const handleFavorite = async (e) => {
    e.stopPropagation()
    const added = await toggleFavorite(currentUser, paper)
    setFaved(added)
  }

  // Parse structured AI summary
  const parsed = summary?.startsWith('**') ? parseStructuredSummary(summary) : null
  const isFallbackTranslation = summary?.startsWith('[摘要翻译]')

  return (
    <div className="paper-card">
      {/* Meta row */}
      <div className="paper-meta">
        {paper.primaryCategory && (
          <span className="category-badge">{paper.primaryCategory}</span>
        )}
        <span className="paper-date">{formatDate(paper.date)}</span>
        {relevance !== undefined && (
          <span className="relevance-badge" title="相关度">
            {Math.round(relevance * 100)}% 匹配
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button
          className={`btn-favorite ${faved ? 'faved' : ''}`}
          onClick={handleFavorite}
          title={faved ? '取消收藏' : '收藏'}
        >
          {faved ? '❤️' : '🤍'}
        </button>
      </div>

      {/* Chinese title translation */}
      {paper.cnTitle && (
        <div className="paper-title-cn">{paper.cnTitle}</div>
      )}

      {/* English title - small label */}
      <div className="paper-line">
        <span className="paper-label">论文：</span>
        <span className="paper-value">{paper.title}</span>
      </div>

      {/* Authors with affiliations for disambiguation */}
      <div className="paper-line">
        <span className="paper-label">作者：</span>
        <span className="paper-value">
          {paper.authorDetails && paper.authorDetails.length > 0
            ? paper.authorDetails.map((a, i) => (
                <span key={i}>
                  {i > 0 && ', '}
                  <span className="author-with-affiliation">
                    {a.name}
                    {a.affiliation && <span className="author-affiliation"> ({a.affiliation})</span>}
                  </span>
                </span>
              ))
            : Array.isArray(paper.authors) ? paper.authors.join(', ') : paper.authors}
        </span>
      </div>

      {/* Summary section */}
      {parsed && parsed.summary && (
        <div className="paper-line">
          <span className="paper-label">总结：</span>
          <span className="paper-value">{parsed.summary}</span>
        </div>
      )}
      {!parsed && isFallbackTranslation && (
        <div className="paper-line">
          <span className="paper-label">总结：</span>
          <span className="paper-value paper-value-fallback">{summary.replace('[摘要翻译] ', '')}</span>
        </div>
      )}
      {!parsed && !isFallbackTranslation && summary && !summary.startsWith('**') && (
        <div className="paper-line">
          <span className="paper-label">总结：</span>
          <span className="paper-value">{summary}</span>
        </div>
      )}
      {summaryLoading && (
        <>
          {paper.cnSummary && (
            <div className="paper-line">
              <span className="paper-label">摘要：</span>
              <span className="paper-value">{paper.cnSummary}</span>
            </div>
          )}
          <div className="summary-loading">
            <span className="summary-spinner" /> 正在生成中文解读...
          </div>
        </>
      )}
      {summaryError && (
        <button className="btn-retry-summary" onClick={fetchSummary}>
          ⚠️ 获取失败，点击重试
        </button>
      )}
      {!summary && !summaryLoading && !summaryError && (
        <>
          {paper.cnSummary && (
            <div className="paper-line">
              <span className="paper-label">摘要：</span>
              <span className="paper-value">{paper.cnSummary}</span>
            </div>
          )}
          <button className="btn-gen-summary" onClick={fetchSummary}>
            ✨ AI 中文解读
          </button>
        </>
      )}

      {/* Structured aspects (key results, significance, etc.) */}
      {parsed && parsed.aspects.map((a, i) => (
        <div key={i} className="paper-line">
          <span className="paper-label">{a.name}：</span>
          <span className="paper-value">{a.content}</span>
        </div>
      ))}

      {/* Keywords / tags */}
      {parsed && parsed.keywords.length > 0 && (
        <div className="paper-tags">
          {parsed.keywords.map((kw, i) => (
            <span key={i} className="paper-tag">#{kw}</span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="paper-actions">
        <button className="btn-open" onClick={handleOpen}>打开论文</button>
        <button className="btn-pdf" onClick={handleOpenPdf}>pdf</button>
        <button className="btn-copy" onClick={handleCopy}>
          {copied ? '✓ 已复制' : '复制链接'}
        </button>
      </div>
    </div>
  )
}
