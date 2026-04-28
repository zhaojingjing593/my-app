import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../App'
import { setStore, getStore, openExternalLink } from '../services/storageService'
import { setOnboardingDone } from '../services/recommendationService'

const STEPS = ['welcome', 'api', 'done']

export default function OnboardingPage() {
  const { currentUser } = useApp()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [apiKey, setApiKey] = useState('')
  const [completing, setCompleting] = useState(false)

  const handleComplete = async () => {
    setCompleting(true)
    try {
      // Save API key if provided
      if (apiKey.trim()) {
        const users = (await getStore('users')) || {}
        users[currentUser] = { ...(users[currentUser] || {}), deepseekApiKey: apiKey.trim() }
        await setStore('users', users)
      }

      await setOnboardingDone(currentUser)
      navigate('/search', { replace: true })
    } catch {
      setCompleting(false)
    }
  }

  return (
    <div className="onboarding-page">
      {/* Progress */}
      <div className="onboarding-progress">
        {STEPS.map((s, i) => (
          <div key={s} className={`progress-dot ${i <= step ? 'active' : ''} ${i < step ? 'done' : ''}`} />
        ))}
      </div>

      <div className="onboarding-card">
        {/* Step 0: Welcome */}
        {step === 0 && (
          <div className="onboarding-step">
            <div className="onboarding-icon">📄</div>
            <h1>欢迎使用 arXiv 论文推荐</h1>
            <p>每日推荐你感兴趣的领域的最新论文，支持中英文搜索、自动翻译、AI 解读。</p>
            <ul className="feature-list">
              <li>✅ 无需翻墙，国内直连</li>
              <li>✅ 无需配置翻译 Key</li>
              <li>✅ 每日自动推荐最新论文</li>
              <li>✅ 可选 AI 智能解读（需配置 DeepSeek）</li>
            </ul>
            <button className="btn-primary" onClick={() => setStep(1)}>
              开始使用 →
            </button>
          </div>
        )}

        {/* Step 1: API Key (optional) */}
        {step === 1 && (
          <div className="onboarding-step">
            <div className="onboarding-icon">🔑</div>
            <h2>配置 DeepSeek API（可选）</h2>
            <p>配置后可以获得 AI 生成的中文论文解读。不配置也能正常使用所有功能。</p>
            <div className="onboarding-api-row">
              <input
                type="password"
                className="api-key-input"
                placeholder="粘贴你的 DeepSeek API Key"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
              />
            </div>
            <p className="api-key-link">
              <a href="#" onClick={e => { e.preventDefault(); openExternalLink('https://platform.deepseek.com') }}>
                → 还没有 Key？去 DeepSeek 官网注册
              </a>
            </p>
            <p className="api-key-cost">成本极低：每篇约 0.001-0.002 元，一年不到 20 元</p>
            <div className="onboarding-nav">
              <button className="btn-secondary" onClick={() => setStep(0)}>← 上一步</button>
              <button className="btn-primary" onClick={() => setStep(2)}>
                {apiKey.trim() ? '保存并继续 →' : '跳过 →'}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Done */}
        {step === 2 && (
          <div className="onboarding-step">
            <div className="onboarding-icon">🎉</div>
            <h2>准备就绪！</h2>
            <p>你的个性化 arXiv 论文推荐已经设置完成。</p>
            <div className="summary-box">
              <p><strong>AI 翻译/解读：</strong>{apiKey.trim() ? '已配置' : '未配置（可在设置中配置）'}</p>
              <p><strong>兴趣分类：</strong>可在设置页面自定义</p>
            </div>
            <button
              className="btn-primary"
              onClick={handleComplete}
              disabled={completing}
            >
              {completing ? '加载中...' : '进入主界面 →'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
