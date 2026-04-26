import { useState, useEffect } from 'react'
import { useApp } from '../App'
import { useNavigate } from 'react-router-dom'
import { getStore, setStore, openExternalLink } from '../services/storageService'

const PRESETS = [
  { color: '#E8D5F5', label: '浅紫' },
  { color: '#FFD6E7', label: '浅粉' },
  { color: '#D5F5E3', label: '薄荷绿' },
  { color: '#D5EEF5', label: '天蓝' },
]

export default function SettingsDrawer({ onClose, onSelectHistory }) {
  const { currentUser, logout, themeColor, updateTheme, searchHistory, removeFromHistory } = useApp()
  const navigate = useNavigate()
  const [apiKey, setApiKey] = useState('')
  const [apiKeySaved, setApiKeySaved] = useState(false)
  const [showKey, setShowKey] = useState(false)

  useEffect(() => {
    const loadKey = async () => {
      const users = (await getStore('users')) || {}
      const saved = users[currentUser]?.claudeApiKey || ''
      setApiKey(saved)
    }
    loadKey()
  }, [currentUser])

  const saveApiKey = async () => {
    const users = (await getStore('users')) || {}
    users[currentUser] = { ...(users[currentUser] || {}), claudeApiKey: apiKey.trim() }
    await setStore('users', users)
    setApiKeySaved(true)
    setTimeout(() => setApiKeySaved(false), 2000)
  }

  const clearApiKey = async () => {
    setApiKey('')
    const users = (await getStore('users')) || {}
    users[currentUser] = { ...(users[currentUser] || {}), claudeApiKey: '' }
    await setStore('users', users)
  }

  const handleLogout = async () => {
    await logout()
    navigate('/', { replace: true })
  }

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-header">
          <h2>设置</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="drawer-body">
          {/* Theme */}
          <div className="drawer-section">
            <h3>主题颜色</h3>
            <div className="theme-presets">
              {PRESETS.map(({ color, label }) => (
                <button
                  key={color}
                  className={`theme-swatch ${themeColor === color ? 'active' : ''}`}
                  style={{ background: color }}
                  title={label}
                  onClick={() => updateTheme(color)}
                />
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
          </div>

          {/* AI Summary API Key */}
          <div className="drawer-section">
            <h3>AI 中文摘要</h3>
            <p className="api-key-desc">
              填入 Claude API Key 可获得 AI 生成的中文摘要（质量更高）。留空则使用免费机器翻译。
              <br />
              <a
                href="#"
                onClick={e => { e.preventDefault(); openExternalLink('https://console.anthropic.com/') }}
                className="api-key-link"
              >
                → 获取 Claude API Key
              </a>
            </p>
            <div className="api-key-input-row">
              <input
                type={showKey ? 'text' : 'password'}
                className="api-key-input"
                placeholder="sk-ant-..."
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
              />
              <button className="btn-toggle-key" onClick={() => setShowKey(!showKey)} title={showKey ? '隐藏' : '显示'}>
                {showKey ? '🙈' : '👁️'}
              </button>
            </div>
            <div className="api-key-actions">
              <button className="btn-save-key" onClick={saveApiKey}>
                {apiKeySaved ? '✓ 已保存' : '保存'}
              </button>
              {apiKey && (
                <button className="btn-clear-key" onClick={clearApiKey}>
                  清除
                </button>
              )}
            </div>
          </div>

          {/* Search history */}
          <div className="drawer-section">
            <h3>搜索历史</h3>
            {searchHistory.length === 0 ? (
              <p className="history-empty">暂无搜索历史</p>
            ) : (
              <div className="history-list">
                {searchHistory.map(kw => (
                  <div key={kw} className="history-item">
                    <span
                      className="history-keyword"
                      onClick={() => onSelectHistory(kw)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => e.key === 'Enter' && onSelectHistory(kw)}
                    >
                      🔍 {kw}
                    </span>
                    <button
                      className="btn-delete-history"
                      onClick={() => removeFromHistory(kw)}
                      title="删除"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Account */}
          <div className="drawer-section">
            <h3>账号</h3>
            <p className="drawer-user">当前登录：{currentUser}</p>
            <button className="btn-logout" onClick={handleLogout}>
              退出登录
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
