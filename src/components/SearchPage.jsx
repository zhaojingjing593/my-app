import { useState, useRef, useEffect } from 'react'
import { useApp } from '../App'
import PaperCard from './PaperCard'
import SettingsPage from './SettingsPage'
import { searchArxiv, fetchCitationCounts, sortPapers, SORT_MODES } from '../services/arxivService'
import { getStore } from '../services/storageService'
import { setTranslationConfig } from '../services/translateService'
import {
  getOrFetchRecommendations, refreshRecommendations,
  getAutoRefreshInterval, getRecommendationsHistory,
  getFavorites, exportFavorites, batchUnfavorite, exportSelectedFavorites,
} from '../services/recommendationService'

const SEARCH_TYPES = [
  { value: 'all', label: '关键词' },
  { value: 'author', label: '作者' },
  { value: 'title', label: '标题' },
]

const todayLabel = () => {
  const d = new Date()
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

export default function SearchPage() {
  const { currentUser, addToHistory } = useApp()
  const [keyword, setKeyword] = useState('')
  const [searchType, setSearchType] = useState('all')
  const [status, setStatus] = useState('idle')
  const [papers, setPapers] = useState([])
  const [searchedKeyword, setSearchedKeyword] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [showFavorites, setShowFavorites] = useState(false)

  // Sort mode for search results
  const [sortMode, setSortMode] = useState('relevance')
  const [sorting, setSorting] = useState(false)

  // Recommendations
  const [recs, setRecs] = useState([])
  const [recsLoading, setRecsLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [recHistory, setRecHistory] = useState([])
  const [selectedRecDate, setSelectedRecDate] = useState(null)

  const searchTokenRef = useRef(0)
  const refreshTimerRef = useRef(null)

  useEffect(() => {
    loadRecs()
    loadAutoRefresh()
  }, [currentUser])

  const loadRecs = async () => {
    setRecsLoading(true)
    try {
      // Ensure translation config is set for recommendation translations
      const users = (await getStore('users')) || {}
      const user = users[currentUser] || {}
      const apiKey = user.deepseekApiKey || ''
      if (apiKey) {
        setTranslationConfig({ provider: 'deepseek', apiKey })
      }
      const data = await getOrFetchRecommendations(currentUser)
      setRecs(data)
      // Load history for date navigation
      const history = await getRecommendationsHistory(currentUser)
      setRecHistory(history)
      const todayStr = new Date().toISOString().split('T')[0] // YYYY-MM-DD
      setSelectedRecDate(history.find(h => h.date === todayStr)?.date || history[0]?.date || todayStr)
    } catch {
      setRecs([])
    } finally {
      setRecsLoading(false)
    }
  }

  const loadAutoRefresh = async () => {
    const hours = await getAutoRefreshInterval(currentUser)
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current)
    if (hours > 0) {
      refreshTimerRef.current = setInterval(() => {
        handleRefresh()
      }, hours * 60 * 60 * 1000)
    }
  }

  const [toastMsg, setToastMsg] = useState('')

  const handleRefresh = async () => {
    setRefreshing(true)
    const oldIds = new Set(recs.map(r => r.arxivId))
    try {
      const result = await Promise.race([
        refreshRecommendations(currentUser),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 90000)),
      ])
      setRecs(result)
      // Reload history for date navigation
      const history = await getRecommendationsHistory(currentUser)
      setRecHistory(history)
      const todayStr = new Date().toISOString().split('T')[0]
      setSelectedRecDate(todayStr)

      // Compare results
      const newIds = result.filter(r => !oldIds.has(r.arxivId))
      if (newIds.length > 0) {
        setToastMsg(`✅ 发现 ${newIds.length} 篇新论文`)
      } else if (result.length > 0) {
        setToastMsg('📋 推荐已更新，暂未发现新论文')
      } else {
        setToastMsg('⚠️ 暂无推荐结果')
      }
    } catch {
      if (recs.length > 0) {
        setToastMsg('⏰ 刷新超时，已显示上次推荐')
      } else {
        setToastMsg('❌ 刷新失败，请检查网络')
      }
    } finally {
      setRefreshing(false)
      setTimeout(() => setToastMsg(''), 4000)
    }
  }

  const handleSortChange = async (mode) => {
    if (mode === sortMode) return
    setSortMode(mode)
    // Fetch citation counts if needed for the selected sort mode
    if ((mode === 'citations' || mode === 'combined') && papers.length > 0) {
      const needsCitations = papers.some(p => p._citationCount === undefined)
      if (needsCitations) {
        setSorting(true)
        try {
          await fetchCitationCounts(papers)
        } catch { /* ignore */ }
        setSorting(false)
      }
    }
  }

  // Available sort modes depend on search type
  const activeSortModes = searchType === 'author'
    ? SORT_MODES.filter(m => m.id === 'date' || m.id === 'citations')
    : searchType === 'title' ? [] : SORT_MODES

  // Apply sort whenever sortMode or papers change (title search uses algorithm order)
  const sortedPapers = (sortMode && searchType !== 'title') ? sortPapers(papers, sortMode) : papers

  const doSearch = async (kw, type = searchType) => {
    const trimmed = kw.trim()
    if (!trimmed) return
    const token = ++searchTokenRef.current
    setStatus('loading')
    setSearchedKeyword(trimmed)
    try {
      // Get DeepSeek API key for search optimization and title/summary translation
      const users = (await getStore('users')) || {}
      const user = users[currentUser] || {}
      const apiKey = user.deepseekApiKey || ''
      if (apiKey) {
        setTranslationConfig({ provider: 'deepseek', apiKey })
      }
      const results = await searchArxiv(trimmed, type, apiKey)
      if (token !== searchTokenRef.current) return
      setPapers(results)
      // Reset sort mode based on search type after search
      if (type === 'title') setSortMode(null)
      else if (type === 'author') setSortMode('date')
      else setSortMode('relevance')
      setStatus('results')
      addToHistory(trimmed)
    } catch (err) {
      if (token !== searchTokenRef.current) return
      if (err.message === 'NO_RESULTS') {
        setStatus('no-results')
      } else if (err.message === 'TRANSLATION_FAILED') {
        setErrorMsg('中文关键词翻译失败，请尝试使用英文关键词搜索')
        setStatus('error')
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

  const getPlaceholder = () => {
    switch (searchType) {
      case 'author': return '输入作者姓名（如：Yann LeCun，可加机构缩小范围）'
      case 'title': return '输入标题（中英文均可）'
      default: return '输入关键词搜索论文'
    }
  }

  return (
    <div className="search-page">
      <header className="search-header">
        <span className="header-title">arXiv 推荐</span>
        <form className="search-form" onSubmit={handleSubmit}>
          <select
            className="search-type-select"
            value={searchType}
            onChange={e => {
              const newType = e.target.value
              setSearchType(newType)
              // Reset sort mode based on search type
              if (newType === 'title') setSortMode(null)
              else if (newType === 'author') setSortMode('date')
              else setSortMode('relevance')
            }}
            disabled={status === 'loading'}
          >
            {SEARCH_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <input
            className="search-input"
            type="text"
            placeholder={getPlaceholder()}
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
        <button className="btn-header-icon" onClick={() => setShowFavorites(true)} title="收藏">
          ♡
        </button>
        <button className="btn-header-icon btn-settings" onClick={() => setShowSettings(true)} title="设置">
          ⚙
        </button>
      </header>

      <main className="search-content">
        {toastMsg && (
          <div className="toast-notification">{toastMsg}</div>
        )}
        {refreshing && (
          <div className="loading-bar">
            <div className="loading-bar-inner" />
          </div>
        )}

        {status === 'idle' && (
          <div className="daily-rec-section">
            <div className="rec-section-header">
              <div className="rec-title-row">
                <span className="rec-title">推荐论文</span>
                <button
                  className="btn-refresh"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  title="刷新推荐"
                >
                  ↻ {refreshing ? '刷新中...' : '刷新'}
                </button>
              </div>
              <div className="rec-date-nav">
                <button
                  className="btn-date-nav"
                  disabled={recHistory.length <= 1}
                  onClick={() => {
                    const idx = recHistory.findIndex(h => h.date === selectedRecDate)
                    if (idx < recHistory.length - 1) {
                      const prev = recHistory[idx + 1]
                      setSelectedRecDate(prev.date)
                      setRecs(prev.papers)
                    }
                  }}
                  title="前一天"
                >
                  ◀
                </button>
                <span className="rec-date">{selectedRecDate ? selectedRecDate.replace(/-/g, '/') : todayLabel()}</span>
                <button
                  className="btn-date-nav"
                  disabled={selectedRecDate === new Date().toISOString().split('T')[0]}
                  onClick={() => {
                    const idx = recHistory.findIndex(h => h.date === selectedRecDate)
                    if (idx > 0) {
                      const next = recHistory[idx - 1]
                      setSelectedRecDate(next.date)
                      setRecs(next.papers)
                    }
                  }}
                  title="后一天"
                >
                  ▶
                </button>
              </div>
            </div>

            <p className="rec-subtitle">
              {recs.length > 0
                ? `共 ${recs.length} 篇论文`
                : recsLoading
                  ? '正在加载推荐...'
                  : '暂无推荐，请先搜索几篇论文'}
            </p>

            {recsLoading && (
              <div className="loading-area" style={{ padding: '20px' }}>
                <div className="spinner" />
              </div>
            )}

            {!recsLoading && recs.length > 0 && (
              <div className="papers-list">
                {recs.map(paper => (
                  <PaperCard
                    key={paper.arxivId}
                    paper={paper}
                    source="recommendation"
                    autoSummary={true}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {status === 'loading' && (
          <div className="loading-area">
            <div className="spinner" />
            <p>正在搜索...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="error-area">
            <p>{errorMsg}</p>
            <button className="chip" style={{ marginTop: 16 }} onClick={() => setStatus('idle')}>
              返回推荐
            </button>
          </div>
        )}

        {status === 'no-results' && (
          <div className="no-results-area">
            <p>未找到与 &quot;{searchedKeyword}&quot; 相关的论文</p>
            <p style={{ marginTop: 8, fontSize: '0.9rem' }}>请尝试其他关键词或检查拼写</p>
            <button className="chip" style={{ marginTop: 16 }} onClick={() => setStatus('idle')}>
              返回推荐
            </button>
          </div>
        )}

        {status === 'results' && (
          <>
            <div className="results-header">
              <h3>
                搜索 &quot;<span className="results-keyword">{searchedKeyword}</span>&quot; 的结果（{papers.length} 篇）
              </h3>
              <button className="btn-back-rec" onClick={() => setStatus('idle')}>
                ← 返回推荐
              </button>
            </div>
            {activeSortModes.length > 0 && (
              <div className="sort-bar">
                <span className="sort-label">排序：</span>
                {activeSortModes.map(m => (
                  <button
                    key={m.id}
                    className={`sort-btn ${sortMode === m.id ? 'active' : ''}`}
                    onClick={() => handleSortChange(m.id)}
                    disabled={sorting}
                  >
                    {m.label}
                    {sorting && sortMode === m.id && ' ↻'}
                  </button>
                ))}
                {sorting && <span className="sort-loading">获取引用数据...</span>}
              </div>
            )}
            <div className="papers-list">
              {sortedPapers.map(paper => (
                <PaperCard
                  key={paper.arxivId}
                  paper={paper}
                  searchKeyword={searchedKeyword}
                  source="search"
                  relevance={paper._relevance}
                  autoSummary={true}
                />
              ))}
            </div>
          </>
        )}
      </main>

      {showSettings && (
        <SettingsPage
          onClose={() => setShowSettings(false)}
          onRefresh={() => loadRecs()}
          onSearchHistoryClick={(kw) => {
            setKeyword(kw)
            doSearch(kw)
          }}
        />
      )}

      {showFavorites && (
        <FavoritesPanel
          currentUser={currentUser}
          onClose={() => setShowFavorites(false)}
        />
      )}
    </div>
  )
}

function FavoritesPanel({ currentUser, onClose }) {
  const [faves, setFaves] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState(new Set())

  useEffect(() => {
    getFavorites(currentUser).then(f => {
      setFaves(f)
      setLoading(false)
    })
  }, [currentUser])

  const toggleSelect = (arxivId) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(arxivId)) next.delete(arxivId)
      else next.add(arxivId)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === faves.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(faves.map(f => f.arxivId)))
    }
  }

  const handleBatchUnfavorite = async () => {
    if (selectedIds.size === 0) return
    await batchUnfavorite(currentUser, [...selectedIds])
    const updated = faves.filter(f => !selectedIds.has(f.arxivId))
    setFaves(updated)
    setSelectedIds(new Set())
  }

  const handleExportSelected = () => {
    if (selectedIds.size === 0) {
      exportFavorites(currentUser)
    } else {
      exportSelectedFavorites(currentUser, [...selectedIds])
    }
  }

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer drawer-wide">
        <div className="drawer-header">
          <h2>我的收藏</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            {faves.length > 0 && (
              <>
                <button className="btn-text" onClick={handleExportSelected}>
                  {selectedIds.size > 0 ? `导出选中 (${selectedIds.size})` : '导出全部'}
                </button>
                {selectedIds.size > 0 && (
                  <button className="btn-text btn-text-danger" onClick={handleBatchUnfavorite}>
                    取消收藏 ({selectedIds.size})
                  </button>
                )}
              </>
            )}
            <button className="btn-close" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="drawer-body">
          {loading && <div className="loading-area"><div className="spinner" /></div>}
          {!loading && faves.length === 0 && (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>
              还没有收藏的论文，在论文卡片上点击 ♡ 即可收藏
            </p>
          )}
          {!loading && faves.length > 0 && (
            <div className="favorites-list">
              {faves.length > 1 && (
                <div className="favorites-select-all">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === faves.length}
                      onChange={toggleSelectAll}
                    />
                    全选 / 取消全选
                  </label>
                </div>
              )}
              {faves.map(f => (
                <div key={f.arxivId} className="favorite-item-row">
                  <div className="favorite-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(f.arxivId)}
                      onChange={() => toggleSelect(f.arxivId)}
                    />
                  </div>
                  <div className="favorite-item-content">
                    <PaperCard key={f.arxivId} paper={f} source="favorite" autoSummary={true} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
