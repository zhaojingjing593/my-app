import { useState, useRef, useEffect } from 'react'
import { useApp } from '../App'
import PaperCard from './PaperCard'
import SettingsDrawer from './SettingsDrawer'
import { searchArxiv } from '../services/arxivService'
import { getOrFetchRecommendations } from '../services/recommendationService'

const SUGGESTIONS = ['machine learning', 'quantum computing', 'large language model', 'computer vision', 'diffusion model']

const todayLabel = () => {
  const d = new Date()
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

export default function SearchPage() {
  const { currentUser, searchHistory, addToHistory } = useApp()
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('idle')
  const [papers, setPapers] = useState([])
  const [searchedKeyword, setSearchedKeyword] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [recs, setRecs] = useState([])
  const [recsLoading, setRecsLoading] = useState(true)
  const inputRef = useRef(null)

  useEffect(() => {
    getOrFetchRecommendations(currentUser)
      .then(setRecs)
      .catch(() => setRecs([]))
      .finally(() => setRecsLoading(false))
  }, [currentUser])

  const doSearch = async (kw) => {
    const trimmed = kw.trim()
    if (!trimmed) return
    setStatus('loading')
    setSearchedKeyword(trimmed)
    try {
      const results = await searchArxiv(trimmed)
      setPapers(results)
      setStatus('results')
      addToHistory(trimmed)
    } catch (err) {
      if (err.message === 'NO_RESULTS') {
        setStatus('no-results')
      } else {
        setErrorMsg(err.message || '搜索失败，请检查网络后重试')
        setStatus('error')
      }
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    doSearch(keyword)
  }

  const handleSuggestion = (kw) => {
    setKeyword(kw)
    doSearch(kw)
  }

  return (
    <div className="search-page">
      <header className="search-header">
        <span className="header-title">📄 arXiv 推荐</span>
        <form className="search-form" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            className="search-input"
            type="text"
            placeholder="输入关键词搜索论文（支持中英文）"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            disabled={status === 'loading'}
          />
          <button
            className="btn-search"
            type="submit"
            disabled={status === 'loading' || !keyword.trim()}
          >
            搜索
          </button>
        </form>
        <button className="btn-settings" onClick={() => setShowSettings(true)} title="设置">
          ⚙️
        </button>
      </header>

      <main className="search-content">
        {status === 'idle' && (
          <>
            {/* Daily recommendations */}
            <div className="daily-rec-section">
              <div className="rec-section-header">
                <span className="rec-title">📅 今日推荐</span>
                <span className="rec-date">{todayLabel()}</span>
              </div>
              <p className="rec-subtitle">
                {recs.length > 0
                  ? '根据您的阅读偏好精选，点击论文标题可在浏览器打开原文'
                  : recsLoading
                    ? '正在加载个性化推荐...'
                    : '暂无推荐，请先搜索几篇论文以建立偏好档案'}
              </p>

              {recsLoading && (
                <div className="loading-area" style={{ padding: '30px' }}>
                  <div className="spinner" />
                </div>
              )}

              {!recsLoading && recs.length > 0 && (
                <div className="papers-list">
                  {recs.map(paper => (
                    <PaperCard
                      key={paper.arxivId}
                      paper={paper}
                      searchKeyword="recommendation"
                      source="recommendation"
                      autoSummary={true}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Search suggestions */}
            <div className="welcome-suggestions">
              <p className="suggestion-label">— 快速搜索 —</p>
              <div className="suggestion-chips">
                {SUGGESTIONS.map(s => (
                  <button key={s} className="chip" onClick={() => handleSuggestion(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {status === 'loading' && (
          <div className="loading-area">
            <div className="spinner" />
            <p>正在搜索并翻译关键词...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="error-area">
            <p>⚠️ {errorMsg}</p>
            <button className="chip" style={{ marginTop: 16 }} onClick={() => setStatus('idle')}>
              返回
            </button>
          </div>
        )}

        {status === 'no-results' && (
          <div className="no-results-area">
            <p>😕 未找到与 "<strong>{searchedKeyword}</strong>" 相关的论文</p>
            <p style={{ marginTop: 8, fontSize: '0.9rem' }}>请尝试其他关键词，或检查拼写</p>
            <button className="chip" style={{ marginTop: 16 }} onClick={() => setStatus('idle')}>
              返回推荐
            </button>
          </div>
        )}

        {status === 'results' && (
          <>
            <div className="results-header">
              <h3>
                关键词 <span className="results-keyword">"{searchedKeyword}"</span> 的最新 {papers.length} 篇论文
              </h3>
              <button className="btn-back-rec" onClick={() => setStatus('idle')}>
                ← 返回今日推荐
              </button>
            </div>
            <div className="papers-list">
              {papers.map(paper => (
                <PaperCard
                  key={paper.arxivId}
                  paper={paper}
                  searchKeyword={searchedKeyword}
                  source="search"
                  autoSummary={false}
                />
              ))}
            </div>
          </>
        )}
      </main>

      {showSettings && (
        <SettingsDrawer
          onClose={() => setShowSettings(false)}
          onSelectHistory={(kw) => {
            setKeyword(kw)
            setShowSettings(false)
            doSearch(kw)
          }}
        />
      )}
    </div>
  )
}
