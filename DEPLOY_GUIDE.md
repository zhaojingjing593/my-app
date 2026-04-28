# arXiv 论文推荐 - 部署与使用指南

## 一、桌面版（EXE）使用

### 方式1：直接运行开发版（用于测试）

```bash
cd arxiv-recommender
npm run electron:dev
```

### 方式2：打包成 EXE（分享给朋友）

```bash
npm run electron:build
```

打包完成后，EXE 位于 `dist/electron-build/` 目录：
- `arXiv论文推荐 Setup X.X.X.exe` — 安装包（推荐）
- `arXiv论文推荐-portable.exe` — 免安装版

**分享给朋友**：直接把安装包发给朋友，双击安装即可使用。不需要安装 Node.js 或其他依赖。

### 系统要求
- Windows 10 或更高版本（64位）
- 无需翻墙，国内网络直接使用
- 首次打开需要互联网（加载推荐）

---

## 二、网页版部署到 Netlify（手机+电脑可用）

### 前提条件
1. 注册 GitHub 账号：https://github.com
2. 注册 Netlify 账号：https://app.netlify.com（可用 GitHub 账号直接登录）

### 步骤1：上传代码到 GitHub

1. 打开 https://github.com ，点击右上角 `+` → `New repository`
2. 仓库名称填写 `arxiv-recommender`，选择 `Private`（私有）或 `Public`（公开）
3. 创建后，在本地命令行执行：

```bash
cd C:\Users\lenovo\Desktop\cc test\arxiv-recommender

# 初始化 git（如果尚未）
git init
git add .
git commit -m "初始提交"

# 关联远程仓库（替换 YOUR_USERNAME 为你的 GitHub 用户名）
git remote add origin https://github.com/YOUR_USERNAME/arxiv-recommender.git
git branch -M main
git push -u origin main
```

### 步骤2：在 Netlify 部署

1. 打开 https://app.netlify.com
2. 点击 `Add new site` → `Import an existing project`
3. 选择 `GitHub`，授权 Netlify 访问你的仓库
4. 选择 `arxiv-recommender` 仓库
5. 构建设置保持默认（Netlify 会自动读取 `netlify.toml`）
6. 点击 `Deploy site`
7. 等待 1-2 分钟部署完成

### 步骤3：访问网页版

部署完成后，Netlify 会分配一个网址，如 `https://xxx-xxx-xxx.netlify.app`
- 手机浏览器打开此网址即可使用（卡片式布局自适应）
- 电脑浏览器打开同样可用

### （可选）绑定自定义域名

在 Netlify 项目设置中 → `Domain management` → `Add custom domain`

---

## 三、功能使用说明

### 首次启动
1. 注册/登录（邮箱+密码，数据存本地）
2. 可选：配置 DeepSeek API Key（用于 AI 智能解读）
3. 选择感兴趣的论文领域
4. 进入主界面

### 每日推荐
- 打开软件自动显示今日推荐论文
- 点击 **刷新推荐** 按钮从 arXiv 获取最新论文
- 设置自动刷新间隔（6/12/24小时）
- 设置时间范围过滤（最近3/7/30天）

### 搜索
- 关键词搜索：输入中英文均可（自动翻译后搜索）
- 作者搜索：输入作者姓名
- 标题搜索：输入论文标题

### 翻译
- 标题和摘要自动翻译成中文
- 翻译由 MyMemory + 有道 API 提供，国内直连
- 翻译结果缓存，不重复请求

### AI 解读（可选）
- 需配置 DeepSeek API Key
- 配置路径：设置 → API → 输入 Key → 保存
- 注册获取 Key：https://platform.deepseek.com
- 费用极低：约 0.001-0.002 元/篇

### 收藏
- 点击论文卡片的 🤍 按钮收藏
- 点击顶部 ❤️ 按钮查看收藏列表
- 支持导出收藏为 JSON 文件

### 个性化设置
- 主题颜色（6种预设 + 自定义）
- 订阅领域管理
- 自动刷新间隔
- 翻译缓存管理

---

## 四、项目结构

```
arxiv-recommender/
├── electron/              # Electron 主进程
│   ├── main.js            # 窗口创建、IPC 处理
│   └── preload.js         # 桥接 API
├── netlify/               # Netlify 云函数
│   └── functions/
│       ├── arxiv.js       # arXiv API 代理
│       └── translate.js   # 翻译 API 代理
├── src/                   # 前端代码
│   ├── App.jsx            # 根组件、路由
│   ├── main.jsx           # 入口
│   ├── index.css          # 样式
│   ├── components/
│   │   ├── LoginPage.jsx       # 登录页
│   │   ├── SearchPage.jsx      # 主页（搜索+推荐）
│   │   ├── PaperCard.jsx       # 论文卡片
│   │   ├── SettingsPage.jsx    # 设置页
│   │   └── OnboardingPage.jsx  # 首次引导
│   └── services/
│       ├── arxivService.js         # arXiv API 调用
│       ├── translateService.js     # 翻译服务
│       ├── recommendationService.js # 推荐/收藏/AI总结
│       └── storageService.js       # 本地存储
├── vite.config.js         # Vite 配置
├── package.json           # 依赖和脚本
└── netlify.toml           # Netlify 部署配置
```

## 五、常见问题

### Q: 翻译失败怎么办？
检查网络连接。翻译由云端 API 提供（MyMemory + 有道），国内可直接访问。如果仍失败，结果显示原文。

### Q: 如何更新软件？
在项目目录执行 `git pull` 获取最新代码，然后重新运行 `npm run electron:build` 打包。

### Q: 数据存在哪里？
桌面版：Electron 的 `electron-store`（本地文件）
网页版：浏览器 `localStorage`
两种方式数据都在本地，不会上传到任何服务器。

### Q: 网页版和桌面版数据同步吗？
不同步。桌面版存在本地文件，网页版存在浏览器。后续可考虑导出导入功能。
