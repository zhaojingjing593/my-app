import { useState, useEffect } from 'react'
import { useApp } from '../App'
import { useNavigate } from 'react-router-dom'
import { getStore, setStore, openExternalLink } from '../services/storageService'
import {
  getAutoRefreshInterval, saveAutoRefreshInterval,
  getRecentDaysFilter, saveRecentDaysFilter,
  getUserCategories, saveUserCategories,
  addCustomCategory, removeCustomCategory, getCustomCategories,
  getAllActiveCategoryLabels,
} from '../services/recommendationService'
import { setTranslationConfig } from '../services/translateService'
import { safeFetch } from '../services/apiService'
import { setProxyUrl, getConfiguredProxyUrl } from '../services/arxivService'

const PRESETS = [
  { color: '#E8D5F5', label: '浅紫' },
  { color: '#FFD6E7', label: '浅粉' },
  { color: '#D5F5E3', label: '薄荷绿' },
  { color: '#D5EEF5', label: '天蓝' },
  { color: '#FFF3CD', label: '浅黄' },
  { color: '#E0D5FF', label: '淡紫' },
]

const REFRESH_OPTIONS = [
  { value: 0, label: '关闭' },
  { value: 6, label: '每6小时' },
  { value: 12, label: '每12小时' },
  { value: 24, label: '每24小时' },
]

const DAYS_OPTIONS = [
  { value: 0, label: '全部' },
  { value: 3, label: '最近3天' },
  { value: 7, label: '最近7天' },
  { value: 30, label: '最近30天' },
]

const FONT_SIZE_OPTIONS = [
  { value: 'small', label: '小' },
  { value: 'medium', label: '中' },
  { value: 'large', label: '大' },
  { value: 'xlarge', label: '特大' },
]

export default function SettingsPage({ onClose, onRefresh, onSearchHistoryClick }) {
  const { currentUser, logout, themeColor, updateTheme, fontSize, updateFontSize, fontFamily, updateFontFamily, searchHistory, removeFromHistory } = useApp()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('recommend')

  // API Key state
  const [apiKey, setApiKey] = useState('')
  const [apiKeySaved, setApiKeySaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState('')

  // Recommendation state
  const [autoRefresh, setAutoRefresh] = useState(0)
  const [recentDays, setRecentDays] = useState(0)

  // Export/Import
  const [importStatus, setImportStatus] = useState('')

  // arXiv Proxy URL
  const [arxivProxy, setArxivProxy] = useState('')

  // Category management
  const [categories, setCategories] = useState([])
  const [customCategories, setCustomCategories] = useState([])
  const [newCategoryName, setNewCategoryName] = useState('')
  const [categoryError, setCategoryError] = useState('')

  useEffect(() => {
    loadSettings()
  }, [currentUser])

  const loadSettings = async () => {
    const users = (await getStore('users')) || {}
    const user = users[currentUser] || {}
    setApiKey(user.deepseekApiKey || '')
    setArxivProxy(getConfiguredProxyUrl())
    try {
      const [interval, days] = await Promise.all([
        getAutoRefreshInterval(currentUser),
        getRecentDaysFilter(currentUser),
      ])
      setAutoRefresh(interval)
      setRecentDays(days)
      // Load categories
      const allLabels = await getAllActiveCategoryLabels(currentUser) || []
      setCategories(allLabels)
      const customs = await getCustomCategories(currentUser) || []
      setCustomCategories(customs)
    } catch {}
  }

  const handleAddCategory = async () => {
    const name = newCategoryName.trim()
    if (!name) return
    setCategoryError('')
    const id = name.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, '-').replace(/^-|-$/g, '')
    if (!id) {
      setCategoryError('请输入有效的分类名称')
      return
    }
    if (categories.some(c => c.id === id)) {
      setCategoryError('该分类已存在')
      return
    }
    await addCustomCategory(currentUser, id, name)
    setNewCategoryName('')
    const allLabels = await getAllActiveCategoryLabels(currentUser) || []
    setCategories(allLabels)
    const customs = await getCustomCategories(currentUser) || []
    setCustomCategories(customs)
  }

  const handleRemoveCategory = async (id) => {
    if (!customCategories.some(c => c.id === id)) return
    await removeCustomCategory(currentUser, id)
    const allLabels = await getAllActiveCategoryLabels(currentUser) || []
    setCategories(allLabels)
    const customs = await getCustomCategories(currentUser) || []
    setCustomCategories(customs)
  }

  // ─── DeepSeek API ──────────────────────────────────────

  const saveApiKey = async () => {
    const users = (await getStore('users')) || {}
    users[currentUser] = { ...(users[currentUser] || {}), deepseekApiKey: apiKey.trim() }
    await setStore('users', users)
    setTranslationConfig({ provider: 'deepseek', apiKey: apiKey.trim() })
    setApiKeySaved(true)
    setTimeout(() => setApiKeySaved(false), 2000)
  }

  const clearApiKey = async () => {
    setApiKey('')
    const users = (await getStore('users')) || {}
    users[currentUser] = { ...(users[currentUser] || {}), deepseekApiKey: '' }
    await setStore('users', users)
    setTranslationConfig({ provider: 'deepseek', apiKey: '' })
  }

  const testApiKey = async () => {
    if (!apiKey.trim()) return
    setTesting(true)
    setTestResult('')
    try {
      const res = await safeFetch('https://api.deepseek.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey.trim()}` },
      })
      if (res.ok) {
        setTestResult('✅ Key 有效！')
      } else if (res.status === 401) {
        setTestResult('❌ Key 无效，请检查')
      } else {
        setTestResult(`❌ 错误: ${res.status}`)
      }
    } catch {
      setTestResult('❌ 网络错误，请检查连接')
    } finally {
      setTesting(false)
    }
  }

  // ─── Export/Import settings ─────────────────────────────

  const handleExportSettings = async () => {
    const users = (await getStore('users')) || {}
    const user = users[currentUser] || {}
    const settings = {
      exportedAt: new Date().toISOString(),
      searchHistory: user.searchHistory || [],
      categories: user.categories || [],
      customCategories: user.customCategories || [],
      themeColor: themeColor,
      autoRefreshInterval: autoRefresh,
      recentDays: recentDays,
    }
    const json = JSON.stringify(settings, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `arxiv-settings-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportSettings = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      setImportStatus('')
      try {
        const text = await file.text()
        const data = JSON.parse(text)
        // Validate
        if (!data.searchHistory && !data.categories && !data.themeColor) {
          setImportStatus('❌ 无效的设置文件')
          return
        }
        const users = (await getStore('users')) || {}
        const user = users[currentUser] || {}
        const merged = { ...user }
        if (Array.isArray(data.searchHistory)) merged.searchHistory = data.searchHistory
        if (Array.isArray(data.categories)) merged.categories = data.categories
        if (Array.isArray(data.customCategories)) merged.customCategories = data.customCategories
        if (data.themeColor) merged.themeColor = data.themeColor
        if (typeof data.autoRefreshInterval === 'number') merged.autoRefreshInterval = data.autoRefreshInterval
        if (typeof data.recentDays === 'number') merged.recentDays = data.recentDays
        users[currentUser] = merged
        await setStore('users', users)
        // Apply theme if imported
        if (data.themeColor) updateTheme(data.themeColor)
        setImportStatus('✅ 设置导入成功')
        setTimeout(() => onRefresh?.(), 500)
      } catch {
        setImportStatus('❌ 导入失败，请检查文件格式')
      }
    }
    input.click()
  }

  // ─── Save settings ──────────────────────────────────────

  const handleLogout = async () => {
    await logout()
    navigate('/', { replace: true })
  }

  const tabs = [
    { id: 'recommend', label: '推荐' },
    { id: 'api', label: 'API' },
    { id: 'interface', label: '界面与账号' },
  ]

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer drawer-settings">
        <div className="drawer-header">
          <h2>⚙️ 设置</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div className="settings-tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="drawer-body">
          {/* ═══ Recommend Tab ═══ */}
          {activeTab === 'recommend' && (
            <div className="drawer-section">
              <h3>搜索关键词历史</h3>
              <p className="section-desc">
                软件根据你经常搜索的关键词推荐文章，你可以删除不需要的关键词。
              </p>

              {searchHistory.length > 0 ? (
                <div className="history-list">
                  {searchHistory.map((kw, i) => (
                    <div key={i} className="history-item">
                      <span
                        className="history-keyword"
                        onClick={() => {
                          onClose?.()
                          onSearchHistoryClick?.(kw)
                        }}
                      >
                        {kw}
                      </span>
                      <button
                        className="btn-delete-history"
                        onClick={async () => {
                          await removeFromHistory(kw)
                        }}
                        title="删除"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="history-empty">暂无搜索历史，快去搜索论文吧</p>
              )}

              <h3 style={{ marginTop: 20 }}>自动刷新</h3>
              <div className="setting-row">
                <span>自动刷新推荐</span>
                <select
                  value={autoRefresh}
                  onChange={e => {
                    const v = Number(e.target.value)
                    setAutoRefresh(v)
                    saveAutoRefreshInterval(currentUser, v)
                  }}
                  className="filter-select"
                >
                  {REFRESH_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <h3 style={{ marginTop: 20 }}>时间范围</h3>
              <div className="setting-row">
                <span>只显示最近</span>
                <select
                  value={recentDays}
                  onChange={e => {
                    const v = Number(e.target.value)
                    setRecentDays(v)
                    saveRecentDaysFilter(currentUser, v)
                  }}
                  className="filter-select"
                >
                  {DAYS_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <h3 style={{ marginTop: 20 }}>兴趣分类</h3>
              <p className="section-desc">添加你感兴趣的论文领域分类，用于推荐论文。</p>
              <div className="category-input-row">
                <input
                  type="text"
                  className="category-input"
                  placeholder="输入分类名称，如：量子计算"
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddCategory() }}
                />
                <button className="btn-primary-sm" onClick={handleAddCategory}>添加</button>
              </div>
              {categoryError && <p className="category-error">{categoryError}</p>}
              {categories.length > 0 && (
                <div className="category-list">
                  {categories.map(cat => (
                    <div key={cat.id} className="category-item">
                      <span className="category-item-label">{cat.label}</span>
                      <span className="category-item-id">{cat.id}</span>
                      {customCategories.some(c => c.id === cat.id) ? (
                        <button
                          className="btn-delete-category"
                          onClick={() => handleRemoveCategory(cat.id)}
                          title="删除分类"
                        >
                          ✕
                        </button>
                      ) : (
                        <span className="category-builtin-tag">默认</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <button className="btn-secondary" style={{ marginTop: 16 }} onClick={() => { onRefresh?.(); onClose?.() }}>
                🔄 刷新推荐
              </button>
            </div>
          )}

          {/* ═══ API Tab ═══ */}
          {activeTab === 'api' && (
            <div className="drawer-section">
              <h3>DeepSeek API Key</h3>
              <div className="api-key-input-row">
                <input
                  type="password"
                  className="api-key-input"
                  placeholder="输入 DeepSeek API Key"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                />
              </div>
              <div className="api-key-actions">
                <button className="btn-primary-sm" onClick={saveApiKey}>
                  {apiKeySaved ? '✓ 已保存' : '保存'}
                </button>
                {apiKey && (
                  <button className="btn-secondary-sm" onClick={clearApiKey}>清除</button>
                )}
                <button className="btn-secondary-sm" onClick={testApiKey} disabled={testing}>
                  {testing ? '测试中...' : '测试连接'}
                </button>
              </div>
              {testResult && (
                <p className="test-result">{testResult}</p>
              )}
              <p className="api-key-link" style={{ marginTop: 12 }}>
                <a href="#" onClick={e => { e.preventDefault(); openExternalLink('https://platform.deepseek.com') }}>
                  → 去 DeepSeek 官网注册获取 Key
                </a>
              </p>

              <h3 style={{ marginTop: 24 }}>arXiv API 代理</h3>
              <p className="section-desc">
                国内直接访问 arXiv API 可能被 CORS 拦截。部署一个{' '}
                <a href="#" onClick={e => { e.preventDefault(); openExternalLink('https://workers.cloudflare.com') }}>
                  Cloudflare Worker
                </a>{' '}
                作为代理即可解决（免费，每月10万次）。代码在项目的 proxy 文件夹。
              </p>
              <div className="api-key-input-row" style={{ marginTop: 8 }}>
                <input
                  type="text"
                  className="api-key-input"
                  placeholder="输入 arXiv 代理 URL（如：https://arxiv.xxx.workers.dev）"
                  value={arxivProxy}
                  onChange={e => setArxivProxy(e.target.value)}
                />
              </div>
              <div className="api-key-actions">
                <button className="btn-primary-sm" onClick={() => { setProxyUrl(arxivProxy.trim()); }}>
                  保存代理
                </button>
                {arxivProxy && (
                  <button className="btn-secondary-sm" onClick={() => { setArxivProxy(''); setProxyUrl(''); }}>清除</button>
                )}
              </div>

            </div>
          )}

          {/* ═══ Interface + Account Tab ═══ */}
          {activeTab === 'interface' && (
            <div className="drawer-section">
              <h3>字体大小</h3>
              <div className="font-size-options">
                {FONT_SIZE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    className={`font-size-btn ${fontSize === opt.value ? 'active' : ''}`}
                    onClick={() => updateFontSize(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <h3 style={{ marginTop: 20 }}>字体样式</h3>
              <div className="setting-row">
                <span>正文字体</span>
                <select
                  value={fontFamily}
                  onChange={e => updateFontFamily(e.target.value)}
                  className="filter-select"
                >
                  <option value="system">系统默认</option>
                  <option value="kai">楷体</option>
                  <option value="msyh">微软雅黑</option>
                </select>
              </div>

              <h3 style={{ marginTop: 24 }}>主题颜色</h3>
              <div className="theme-presets">
                {PRESETS.map(({ color, label }) => (
                  <button
                    key={color}
                    className={`theme-swatch ${themeColor === color ? 'active' : ''}`}
                    style={{ background: color }}
                    title={label}
                    onClick={() => updateTheme(color)}
                  >
                    {themeColor === color && <span className="swatch-check">✓</span>}
                  </button>
                ))}
              </div>
              <div className="theme-custom">
                <input
                  type="color"
                  value={themeColor}
                  onChange={e => updateTheme(e.target.value)}
                  title="自定义颜色"
                />
                <span>自定义颜色</span>
              </div>

              <h3 style={{ marginTop: 24 }}>账号</h3>
              <p className="drawer-user">当前用户：{currentUser}</p>
              <button className="btn-logout" onClick={handleLogout}>
                退出登录
              </button>

              <h3 style={{ marginTop: 24 }}>数据管理</h3>
              <div className="export-import-row">
                <button className="btn-secondary-sm" onClick={handleExportSettings}>
                  导出设置
                </button>
                <button className="btn-secondary-sm" onClick={handleImportSettings}>
                  导入设置
                </button>
              </div>
              {importStatus && <p className="import-status">{importStatus}</p>}
              <p className="section-desc" style={{ marginTop: 8 }}>
                导出的设置包含搜索历史、兴趣分类、主题颜色等
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
