# Resume Autofill (Flash)

这是一个基于 MV3 的 Chrome 扩展骨架，目标是在本地环境中完成以下流程：扫描表单字段、将语义匹配交给 Gemini Flash、在 Popup 中预览填充计划，并支持一键执行与撤销。扩展只读取 `data/*.json` 中的简历数据，不会上传或解析其他内容。

## 目录概览

- `manifest.json` — MV3 清单文件，负责声明后台 Service Worker、内容脚本以及 Popup/Options。
- `src/background/serviceWorker.ts` — 负责 Prompt 编排、调用 Gemini Flash、JSON 校验与站点记忆（当前为 TODO 桩）。
- `src/content/*` — DOM 扫描（`detector.ts`）、机械填充与回滚（`autofill.ts`）、消息分发（`contentMain.ts`）。
- `src/ui/*` — 基于 React 的 Popup 与 Options 页面，覆盖扫描→计划→执行/撤销与配置界面。
- `src/lib/*` — 共享类型定义、Gemini Flash 封装、存储工具与日志工具。
- `data/profile.default.json` — 示例 Profile，可替换为真实数据文件。
- `public/*` — 构建时直接复制的静态 HTML/CSS/Icon 资源。

## 快速上手

1. **安装依赖**
   ```bash
   npm install
   ```
2. **启动开发模式**
   ```bash
   npm run dev
   ```
   Vite 会持续输出构建产物到 `dist/`，保持终端进程运行即可实时刷新。
3. **在 Chrome 中加载扩展**
   - 打开 `chrome://extensions/`
   - 开启 **开发者模式**
   - 点击 **加载已解压的扩展程序**，选择 `dist/` 目录
   - 每次构建后刷新扩展，或在终端使用 Vite 的 “r” 快捷键触发重建

## 配置 Gemini Flash

1. 将你的 Profile JSON 放入 `data/` 目录，结构需符合 `src/lib/schema.ts` 中的 `ProfileData`。
2. 执行一次 `npm run build`，确保最新 JSON 被复制到 `dist/data/`。
3. 打开扩展 **Options** 页面：
   - 填入 Gemini API Key
   - 设置模型名称（默认 `gemini-1.5-flash-latest`）
   - 指定当前使用的 Profile 文件名（例如 `profile.myname.json`）
   - 调整置信度阈值、摘要长度、电话格式与站点记忆开关
4. Popup 会通过 `chrome.storage` 读取这些配置，并在后续操作中生效。

## 开发提示

- 背景页、内容脚本与 UI 目前留有 TODO 标记，后续可补充 Prompt 生成、JSON 修复和 DOM 自动化的具体逻辑。
- `src/lib/schema.ts` 定义了 `FieldCandidates`、`FillPlan`、`SiteMemory` 等核心契约，请确保所有消息与之对齐。
- 建议在既有方法签名内补充实现，而不是整体替换，以维持消息路由与存储工具的一致性。
- 调试 DOM 扫描时，保持 `npm run dev` 运行并刷新目标页面即可验证最新内容脚本。

## 构建与发布

执行生产构建：

```bash
npm run build
```

确认 `dist/manifest.json` 及生成资源无误后，可直接压缩 `dist/` 目录，用于本地或其他浏览器加载。

## 后续工作

- 在 `serviceWorker.ts` 中完成 Profile 读取、Prompt 组装、Gemini 调用与 JSON 修复流程。
- 在 `detector.ts` 中实现 DOM 扫描逻辑，输出满足契约的 `FieldCandidates`。
- 在 `autofill.ts` 中实现聚焦、填值、触发事件与回滚的机械化流程。
- 将 Popup 的扫描/计划/执行动作与后台编排打通，形成完整闭环。
