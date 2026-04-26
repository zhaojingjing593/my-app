import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../App'
import { getStore, setStore, hashPassword } from '../services/storageService'

export default function LoginPage() {
  const { login } = useApp()
  const navigate = useNavigate()
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const validate = () => {
    if (!email.includes('@')) return '请输入有效的邮箱地址'
    if (password.length < 6) return '密码至少6位'
    if (isRegister && password !== confirm) return '两次密码不一致'
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
        users[email] = { passwordHash: hash, themeColor: '#E8D5F5', searchHistory: [] }
        await setStore('users', users)
      } else {
        const user = users[email]
        if (!user) { setError('账号不存在，请先注册'); setLoading(false); return }
        if (user.passwordHash !== hash) { setError('密码错误'); setLoading(false); return }
      }

      await login(email)
      navigate('/search', { replace: true })
    } catch (err) {
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
          <p>搜索最新学术论文，支持中英文关键词</p>
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
              <label>确认密码</label>
              <input
                type="password"
                placeholder="再次输入密码"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
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
