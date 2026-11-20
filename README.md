# 电子木鱼 · 小红书小工具

> 轻敲静心 · 减压祈福 · 积攒今日功德

基于纯离线静态 H5 规范构建的小红书小工具版「电子木鱼」，结合小红书端能力实现了**平台陀螺仪挥锤摇一摇**、**真机短振触感反馈**、**纯 Web Audio 多音色合成**、**深浅色主题切换**与**今日功德签一键分享/发笔记**。

## 功能亮点

- **零延迟敲击与音效**：内置纯 Web Audio API 实时合成器（清脆檀木 / 沉稳古木 / 空灵清磬 3 种音色），无需外部音频文件，支持快速连击叠音不断音。
- **平台陀螺仪摇一摇（客户端 9.50+）**：通过 `window.xhs.miniTool.startGyroscope` / `onGyroscopeChange` 合规实现「拿稳手机上下挥动，像挥木槌一样敲击木鱼」，内置三档灵敏度（灵敏 / 适中 / 稳重）、滞回防抖状态机与实时挥动能量环。
- **真机触感短振（客户端 9.50+）**：调用 `vibrateShort` 按挥动强度触发轻/中/重短振反馈。
- **自动诵敲与后台保护**：支持 3 档自动敲击节奏，监听 `visibilitychange` 切后台自动暂停定时器并即时保存数据。
- **自定义功德飘字**：提供 6 种常用预设与页内 Modal 自定义短语（最多 12 字）。
- **深浅色背景切换**：支持「深色暗金」与「浅色宣纸」双主题，并持久化保存。
- **今日功德签（3:4 竖版卡片）**：离线 Canvas 2D 绘制专属禅意功德签，支持保存至相册、直接带图发小红书笔记、评论区晒功德与站内分享。

## 目录结构

```text
.
├── dist/                   # 小红书小工具可打包静态产物（根目录即 index.html）
│   ├── index.html          # 静态首屏与经典脚本入口
│   ├── style.css           # Chrome 61 基线样式与深浅色主题
│   ├── xhs-bridge.js       # 小红书端能力桥接层（window.WoodenFishBridge）
│   ├── audio-motion.js     # Web Audio 合成器与陀螺仪挥锤检测（window.WoodenFishEngine）
│   ├── share-card.js       # 3:4 功德签 Canvas 绘制（window.WoodenFishShareCard）
│   └── app.js              # 主交互逻辑
├── media/                  # 发布用 1:1 图标与 3:4 封面图
│   ├── icon.png            # 512x512 应用图标
│   └── cover.png           # 900x1200 应用封面
├── LICENSE
└── README.md
```

## 本地打包方式

请务必进入 `dist/` 目录内部打包，确保压缩包根目录直接包含 `index.html`：

```bash
cd dist && zip -r ../wooden-fish-minitool.zip . -x '*.DS_Store'
```

## 开源致谢

本项目参考了开源项目 [jwenjian/wooden-fish](https://github.com/jwenjian/wooden-fish)（MIT License）的交互创意，所有视觉资产、Web Audio 合成器与小红书容器端能力均按离线 H5 规范重新构建。

---

made by 八根草
