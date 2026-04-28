import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../App'
import { getStore, setStore, hashPassword } from '../services/storageService'

export default function LoginPage() {
  const { login } = useApp()
  const navigate = useNavigate()
  const [isRegister, setIsRegister] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const validate = () => {
    if (!email.includes('@')) return '请输入有效的邮箱地址'
    if (password.length < 6) return '密码至少6位'
    return null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const msg = validate()
    if (msg) { setError(msg); return }

    setError('')
    setLoading(true)
    try {
      const hash = await hashPassword(password)
      const users = (await getStore('users')) || {}

      if (isRegister) {
        if (users[email]) { setError('该邮箱已注册'); setLoading(false); return }
        const userData = { passwordHash: hash, themeColor: '#E8D5F5', searchHistory: [] }
        if (apiKey.trim()) userData.deepseekApiKey = apiKey.trim()
        users[email] = userData
        await setStore('users', users)
      } else {
        const user = users[email]
        if (!user) { setError('账号不存在，请先注册'); setLoading(false); return }
        if (user.passwordHash !== hash) { setError('密码错误'); setLoading(false); return }
      }

      await login(email)
      navigate('/search', { replace: true })
    } catch {
      setError('操作失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <h1>📄 arXiv 推荐</h1>
        </div>

        {error && <div className="error-msg">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>邮箱</label>
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="form-group">
            <label>密码</label>
            <input
              type="password"
              placeholder="至少6位"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          {isRegister && (
            <div className="form-group">
              <label>DeepSeek API Key（可选）</label>
              <input
                type="password"
                placeholder="粘贴你的 DeepSeek API Key"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
              />
            </div>
          )}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? '处理中...' : isRegister ? '注册并登录' : '登录'}
          </button>
        </form>

        <div className="login-toggle">
          {isRegister ? '已有账号？' : '还没有账号？'}
          <button onClick={() => { setIsRegister(!isRegister); setError('') }}>
            {isRegister ? '去登录' : '立即注册'}
          </button>
        </div>
      </div>
    </div>
  )
}
