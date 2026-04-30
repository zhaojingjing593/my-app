// Translation service — DeepSeek AI + local dictionary fallback
// Results are cached locally to avoid redundant API calls

import { callYuanbao } from './aiProvider'

const isChinese = (text) => /[一-鿿]/.test(text)

const hasChineseContent = (text) =>
  (text.match(/[一-鿿]/g) || []).length >= 3

// ─── Translation config (persisted to localStorage) ─────────────────

const CONFIG_KEY = 'translationConfig'

let translationConfig = {
  provider: 'deepseek',
  apiKey: '',
  yuanbaoApiKey: '',
}

// Auto-load persisted config on module init
try {
  const raw = localStorage.getItem(CONFIG_KEY)
  if (raw) {
    const parsed = JSON.parse(raw)
    translationConfig = { ...translationConfig, ...parsed }
  }
} catch { /* ignore */ }

export const setTranslationConfig = (config) => {
  translationConfig = { ...translationConfig, ...config }
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(translationConfig))
  } catch { /* ignore */ }
}

export const getTranslationConfig = () => ({ ...translationConfig })

// ─── Request throttling (50ms between API calls) ───────────────────

let lastRequestTime = 0

const throttle = async () => {
  const now = Date.now()
  const elapsed = now - lastRequestTime
  if (elapsed < 50) {
    await new Promise(resolve => setTimeout(resolve, 50 - elapsed))
  }
  lastRequestTime = Date.now()
}

// ─── Cache ─────────────────────────────────────────────────────────

const CACHE_KEY = 'translationCache'

const getCache = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

const setCache = (key, value) => {
  try {
    const cache = getCache()
    cache[key] = value
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {}
}

const cacheKey = (text, pair) => {
  let hash = 0
  const s = pair + ':' + text.slice(0, 200).toLowerCase()
  for (let i = 0; i < s.length; i++) {
    const chr = s.charCodeAt(i)
    hash = ((hash << 5) - hash) + chr
    hash |= 0
  }
  return hash.toString(36)
}

// ─── DeepSeek API (user-provided key, AI translation) ─────────────

const deepseekTranslate = async (text, targetLang) => {
  const key = translationConfig.apiKey
  if (!key) return null
  const isToChinese = targetLang === 'ZH'
  const prompt = isToChinese
    ? `请将以下英文论文内容翻译成中文，保持学术准确性，直接返回翻译结果：\n\n${text.slice(0, 2000)}`
    : `请将以下中文翻译成英文，只返回翻译结果：\n\n${text.slice(0, 2000)}`
  const requestBody = {
    model: 'deepseek-chat',
    max_tokens: 1000,
    temperature: 0.3,
    messages: [{ role: 'user', content: prompt }],
  }
  const signal = AbortSignal.timeout(3000)

  // Try DeepSeek first
  try {
    await throttle()
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal,
    })
    if (!res.ok) return null
    const data = await res.json()
    return data?.choices?.[0]?.message?.content?.trim() || null
  } catch {
    // fall through to Yuanbao fallback
  }

  // Retry with Yuanbao when DeepSeek fails
  if (translationConfig.yuanbaoApiKey) {
    try {
      return await callYuanbao(translationConfig.yuanbaoApiKey, requestBody, signal)
    } catch {
      return null
    }
  }

  return null
}

// ─── Local Chinese→English dictionary for common CS terms ─────────

const CN_EN_DICT = [
  ['深度学习', 'deep learning'], ['机器学习', 'machine learning'],
  ['强化学习', 'reinforcement learning'], ['迁移学习', 'transfer learning'],
  ['联邦学习', 'federated learning'], ['元学习', 'meta learning'],
  ['自监督学习', 'self-supervised learning'], ['半监督学习', 'semi-supervised learning'],
  ['多任务学习', 'multi-task learning'], ['度量学习', 'metric learning'],
  ['表征学习', 'representation learning'], ['对比学习', 'contrastive learning'],
  ['主动学习', 'active learning'], ['集成学习', 'ensemble learning'],
  ['在线学习', 'online learning'], ['零样本学习', 'zero-shot learning'],
  ['少样本学习', 'few-shot learning'],
  ['神经网络', 'neural network'], ['卷积神经网络', 'convolutional neural network'],
  ['循环神经网络', 'recurrent neural network'], ['图神经网络', 'graph neural network'],
  ['生成对抗网络', 'generative adversarial network'],
  ['残差网络', 'residual network'], ['注意力机制', 'attention mechanism'],
  ['变分自编码器', 'variational autoencoder'],
  ['长短期记忆网络', 'long short-term memory'],
  ['门控循环单元', 'gated recurrent unit'], ['批归一化', 'batch normalization'],
  ['层归一化', 'layer normalization'], ['激活函数', 'activation function'],
  ['损失函数', 'loss function'], ['正则化', 'regularization'],
  ['过拟合', 'overfitting'], ['欠拟合', 'underfitting'],
  ['梯度下降', 'gradient descent'], ['反向传播', 'backpropagation'],
  ['优化器', 'optimizer'], ['学习率', 'learning rate'],
  ['知识蒸馏', 'knowledge distillation'], ['模型压缩', 'model compression'],
  ['量化', 'quantization'], ['剪枝', 'pruning'],
  ['神经架构搜索', 'neural architecture search'],
  ['超参数优化', 'hyperparameter optimization'],
  ['自然语言处理', 'natural language processing'],
  ['大语言模型', 'large language model'], ['预训练', 'pre-training'],
  ['微调', 'fine-tuning'], ['机器翻译', 'machine translation'],
  ['文本分类', 'text classification'], ['命名实体识别', 'named entity recognition'],
  ['情感分析', 'sentiment analysis'], ['文本生成', 'text generation'],
  ['序列标注', 'sequence labeling'], ['词嵌入', 'word embedding'],
  ['语义理解', 'semantic understanding'], ['关系抽取', 'relation extraction'],
  ['信息抽取', 'information extraction'], ['问答系统', 'question answering'],
  ['摘要生成', 'text summarization'],
  ['计算机视觉', 'computer vision'], ['图像识别', 'image recognition'],
  ['目标检测', 'object detection'], ['语义分割', 'semantic segmentation'],
  ['实例分割', 'instance segmentation'], ['图像分类', 'image classification'],
  ['图像生成', 'image generation'], ['姿态估计', 'pose estimation'],
  ['目标跟踪', 'object tracking'], ['图像分割', 'image segmentation'],
  ['超分辨率', 'super resolution'], ['数据增强', 'data augmentation'],
  ['图像配准', 'image registration'], ['三维重建', '3d reconstruction'],
  ['数据挖掘', 'data mining'], ['特征选择', 'feature selection'],
  ['降维', 'dimensionality reduction'], ['特征提取', 'feature extraction'],
  ['异常检测', 'anomaly detection'], ['时间序列', 'time series'],
  ['聚类', 'clustering'], ['分类', 'classification'],
  ['回归', 'regression'], ['数据可视化', 'data visualization'],
  ['概率图模型', 'probabilistic graphical model'], ['贝叶斯推断', 'bayesian inference'],
  ['推荐系统', 'recommender system'], ['知识图谱', 'knowledge graph'],
  ['因果推断', 'causal inference'], ['差分隐私', 'differential privacy'],
  ['隐私保护', 'privacy preserving'], ['对抗训练', 'adversarial training'],
  ['对抗样本', 'adversarial example'], ['可解释性', 'interpretability'],
  ['AI安全', 'AI safety'], ['公平性', 'fairness'],
  ['多模态', 'multimodal'], ['语音识别', 'speech recognition'],
  ['图嵌入', 'graph embedding'],
  ['协同过滤', 'collaborative filtering'], ['内容感知', 'context aware'],
  ['量子', 'quantum'], ['引力波', 'gravitational wave'],
  ['引力', 'gravity'], ['相对论', 'relativity'],
  ['广义相对论', 'general relativity'], ['量子力学', 'quantum mechanics'],
  ['量子计算', 'quantum computing'], ['量子算法', 'quantum algorithm'],
  ['量子纠缠', 'quantum entanglement'], ['量子场论', 'quantum field theory'],
  ['量子引力', 'quantum gravity'], ['黑洞', 'black hole'],
  ['暗物质', 'dark matter'], ['暗能量', 'dark energy'],
  ['中子星', 'neutron star'], ['脉冲星', 'pulsar'],
  ['超新星', 'supernova'], ['宇宙学', 'cosmology'],
  ['天体物理', 'astrophysics'], ['粒子物理', 'particle physics'],
  ['标准模型', 'standard model'], ['弦论', 'string theory'],
  ['探测', 'detection'], ['传感器', 'sensor'],
  ['干涉仪', 'interferometer'], ['干涉', 'interference'],
  ['天文', 'astronomy'], ['时空', 'spacetime'],
  ['分布外检测', 'out-of-distribution detection'],
  ['持续学习', 'continual learning'], ['课程学习', 'curriculum learning'],
  ['边缘计算', 'edge computing'], ['云计算', 'cloud computing'],
]

const lookUpLocalDict = (text) => {
  const sorted = [...CN_EN_DICT].sort((a, b) => b[0].length - a[0].length)
  let result = text
  let matched = false
  for (const [cn, en] of sorted) {
    if (result.includes(cn)) {
      result = result.replace(cn, en)
      matched = true
    }
  }
  return matched ? result : null
}

// ─── Google Translate (public, no key needed) ─────────────────────

const googleTranslate = async (text, from, to) => {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text.slice(0, 1000))}`
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return null
    const data = await res.json()
    const result = data?.[0]?.map(x => x?.[0]).filter(Boolean).join('')
    return result?.trim() || null
  } catch {
    return null
  }
}

// ─── Youdao Translate (public, no key needed, works in China) ────────

const youdaoTranslate = async (text, type = 'AUTO') => {
  try {
    const url = `https://fanyi.youdao.com/translate?i=${encodeURIComponent(text.slice(0, 500))}&doctype=json&type=${type}`
    const res = await fetch(url, {
      signal: AbortSignal.timeout(3000),
      headers: { Referer: 'https://fanyi.youdao.com/' },
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data.errorCode != 0 || !data.translateResult?.[0]?.[0]?.tgt) return null
    return data.translateResult.flat().map(x => x.tgt).join('').trim() || null
  } catch { return null }
}

// ─── CN → EN (for arXiv search) ─────────────────────────────────────

export const translateToEnglish = async (text) => {
  if (!text?.trim()) return ''
  if (!isChinese(text)) return text.trim()

  const key = cacheKey(text, 'zh2en')
  const cached = getCache()[key]
  if (cached) return cached

  // Step 1: DeepSeek (if API key configured)
  if (translationConfig.apiKey) {
    const result = await deepseekTranslate(text, 'EN')
    if (result && !isChinese(result)) {
      setCache(key, result); return result
    }
  }

  // Step 2: Youdao Translate (China-friendly, no VPN needed)
  const youdaoResult = await youdaoTranslate(text, 'ZH_CN2EN')
  if (youdaoResult && !isChinese(youdaoResult)) {
    setCache(key, youdaoResult); return youdaoResult
  }

  // Step 3: Google Translate (free fallback)
  const googleResult = await googleTranslate(text, 'zh-CN', 'en')
  if (googleResult && !isChinese(googleResult)) {
    setCache(key, googleResult); return googleResult
  }

  // Step 4: Local dictionary fallback
  const dictResult = lookUpLocalDict(text)
  if (dictResult) {
    setCache(key, dictResult); return dictResult
  }

  // Step 5: Strip Chinese characters and return whatever is left
  const stripped = text.replace(/[一-鿿]+/g, '').trim()
  if (stripped) {
    setCache(key, stripped); return stripped
  }

  return text.trim()
}

// ─── EN → CN (for titles / abstracts) ───────────────────────────────

export const translateToChinese = async (text) => {
  if (!text?.trim()) return null
  if (isChinese(text)) return text.trim()

  const key = cacheKey(text, 'en2zh')
  const cached = getCache()[key]
  if (cached) return cached

  // Step 1: DeepSeek (if API key configured)
  if (translationConfig.apiKey) {
    const result = await deepseekTranslate(text, 'ZH')
    if (result && hasChineseContent(result)) {
      setCache(key, result); return result
    }
  }

  // Step 2: Youdao Translate (China-friendly, no VPN needed)
  const youdaoResult = await youdaoTranslate(text, 'EN2ZH_CN')
  if (youdaoResult && hasChineseContent(youdaoResult)) {
    setCache(key, youdaoResult); return youdaoResult
  }

  // Step 3: Google Translate (free fallback)
  const googleResult = await googleTranslate(text, 'en', 'zh-CN')
  if (googleResult && hasChineseContent(googleResult)) {
    setCache(key, googleResult); return googleResult
  }

  return null
}

// Shortcut for backward compatibility
export const translateToChineseFree = translateToChinese

// ─── Clear cache ─────────────────────────────────────────────────────

export const clearTranslationCache = () => {
  localStorage.removeItem(CACHE_KEY)
}

// ─── Get cache stats ─────────────────────────────────────────────────

export const getTranslationCacheStats = () => {
  const cache = getCache()
  const count = Object.keys(cache).length
  const size = new Blob([JSON.stringify(cache)]).size
  return { count, size }
}
