# Multimodal Sentiment · 多模态情感分析演示

纯前端的多模态情感分析演示页：文本、图片、音频三路信号本地推理后融合，输出情绪分布、效价/唤醒度与置信度。

## 特性

- **三模态输入**：文本词义/语气线索、图片主色调与画面特征、音频能量与基频变化
- **融合打分**：可调权重（文本/图片/音频）加权融合，输出 8 类情绪分布与雷达图
- **本地推理**：无后端、无接口调用，所有计算在浏览器内完成，数据不上传
- **可选大模型增强**：React 版支持接入 OpenAI 兼容接口（DeepSeek / Qwen / OpenAI…）做语义级情绪判断，API Key 仅存本地
- **深/浅色主题**、键盘快捷键（Ctrl/⌘ + Enter 开始分析）、`?demo` 一键演示

## 目录结构

```
.
├── multimodal-sentiment.html   # 单文件线上版本（零依赖，直接部署 / 双击打开）
└── react-app/                  # React + Vite 工程版（组件化实现，含大模型适配层）
    ├── src/
    │   ├── App.jsx             # 页面与交互
    │   ├── analysis.js         # 文本/图像/音频分析与融合
    │   ├── llm.js              # OpenAI 兼容 / Jev 适配层
    │   └── styles.css
    ├── scripts/llm-selftest.mjs
    └── vite.config.js
```

## 快速开始

单文件版：直接用浏览器打开 `multimodal-sentiment.html`。

React 版：

```bash
cd react-app
pnpm install
pnpm dev      # 开发
pnpm build    # 产出 dist/
```

## 部署

线上演示：<https://ms-demo.techtao.tech>

nginx 静态站点（oracle 服务器）：

```bash
sudo git clone https://github.com/ztlovelsw/multimodal-sentiment.git /opt/ms-demo
```

更新线上版本（服务器已提供封装脚本）：

```bash
sudo ms-demo-deploy     # = git pull + nginx reload
```

```nginx
server {
    listen 80;
    server_name ms-demo.techtao.tech;
    root /opt/ms-demo;
    index multimodal-sentiment.html;
    location / { try_files $uri $uri/ /multimodal-sentiment.html; }
}
```

HTTPS 由 certbot 签发（Let's Encrypt），Cloudflare 代理模式。

## License

MIT
