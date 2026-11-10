# ⏱ dsh-workflow-timeline · 工作流时间线

ZCode 风格的 DeepSeek Harness 工作流时间线面板：把 workflow 的阶段推进、子代理派生与完成状态画成一条实时时间线。

<img width="2118" height="885" alt="image" src="https://github.com/user-attachments/assets/bd79ea3a-4191-4771-aa70-47454a3e5508" />


## ✨ 功能

- **阶段站点时间线**：横向站点推进（宽）/纵向列表（窄 <640px）响应式切换；站点间连接线随进度从虚变实、`march` 行进动画
- **表情状态机小脸**：间歇眨眼、扫视、跳动的 ZCode 同款小脸，按运行状态切换表情
- **药丸交互**：子代理药丸点击直达其会话（右栏 subagentchat，主会话兜底）；完成态自动折叠、点击展开
- **三入口**：侧边栏图标 + 中心面板 + 右栏页签（guide 菜单条目）
- **阶段级配置**：每阶段 ⚙ 可配模型与并发（继承宿主模型目录）
- **🗑 清空全部（v1.1.0）**：面板头部一键批量删除全部运行记录——确认后立即落盘，重启/断电都不会复活；单条 ✕ 删除保留
- **历史持久化**：运行记录落盘，重启不丢，随时回看（含嵌套 workflow 的运行——会话卡片看不到的那种）

## 📦 安装

### 插件市场 / npm

```sh
dsh plugin --profile <你的profile> add dsh-workflow-timeline
```

或「插件 → 添加插件」搜索 `dsh-workflow-timeline`。安装后**重启一次 DSH**，侧边栏出现时间线图标即成功。

### 环境要求

- DeepSeek Harness **>= 0.2.1-rc.2**（实测 0.2.1-rc.5 与 0.2.2-rc.1，Windows Desktop）
- 纯 JS 双文件插件，零依赖、无构建步骤

## 🧭 工作原理

host 半订阅宿主 `workflow/*` 引擎事件（`workflow/start`、`workflow/phase`、`workflow/agent-start`、
`workflow/agent-end`、`workflow/end`），在内存中聚合运行状态并防抖持久化到 `~/.dsh/workflow-timeline-runs.json`；
删除类操作（单条/清空全部）绕过防抖立即落盘，保证秒重启也不复活；
client 半从 `/api/workflow-timeline/runs` 快照渲染时间线。

**能看到嵌套 workflow**：会话内嵌套发起的 workflow（PTC/工具链深处）不会出现在会话顶层卡片上，
但引擎事件同样会到达本面板——这是它与官方卡片的关键差异。

## 🩺 故障排除

- **启动失败弹窗**：只点「Exit」，把 `%APPDATA%\@deepseek-ai\dsh-desktop\logs\crash-*.log` 提交 issue
- **改过 client.js 后时间线没变化**：需要重启一次 DSH（之后可随意刷新）
- **时间线空白**：确认有 workflow 运行记录（跑一个 workflow 再看）

## 📄 License

[MIT](./LICENSE)

## 🗒 更新记录

每个版本的详细修改说明见 [CHANGELOG.md](./CHANGELOG.md)。

- **v1.1.0**（2026-11-10）：头部新增「🗑 清空全部」批量删除，删除操作立即落盘（不走防抖）；修复兜底扫描的周期性空写盘
- **v1.0.0**（2026-11-09）：首次公开发布

