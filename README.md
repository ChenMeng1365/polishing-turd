
# OPAD — 一人敏捷工作台

单页敏捷看板应用，适用于独立开发者 / 一人公司进行 Sprint 迭代管理。

数据持久化使用 SQLite（better-sqlite3），后端基于 Node.js 原生 `http` 模块，零 Web 框架依赖。

## 功能一览

| 模块 | 说明 |
|------|------|
| 仪表盘 | Sprint 进度概览、燃尽图、近期站会记录 |
| Backlog | 用户故事管理（User Story），优先级 / 故事点 / 验收标准 |
| Sprint 看板 | 四列看板（待办 / 进行中 / 审查 / 完成），支持拖拽改状态 |
| 站会 | 每日站会三问记录（昨天 / 今天 / 阻碍），含心情打分 |
| 帽子工坊 | 六顶思考帽法辅助思考与决策记录 |
| 回顾 | Sprint 回顾（做得好 / 待改进 / 行动项 / 心情） |
| 激励中心 | 成就解锁系统 + 连续迭代统计 |
| 设置 | 项目配置、Sprint 归档 / 取消归档 / 删除管理 |

## 快速开始

### 前置条件

- Node.js ≥ 16

### 安装

```bash
npm install
```

### 启动

```bash
npm start
```

或直接双击 `start.bat`（Windows）。

启动后浏览器访问 **http://localhost:3001**。

首次运行会在 `data/` 目录下自动创建 SQLite 数据库（`opad.db`）并写入种子数据。

### 配置

通过环境变量可覆盖默认配置：

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `PORT` | `3001` | 服务监听端口 |
| `HOST` | `0.0.0.0` | 绑定地址 |
| `OPAD_DATA_DIR` | `<项目根>/data` | 数据库文件存放目录 |

示例：

```bash
# 自定义端口和数据目录
PORT=3001 OPAD_DATA_DIR=/var/lib/opad npm start
```

Windows PowerShell：

```powershell
$env:PORT=3001; $env:OPAD_DATA_DIR="D:\opad-data"; npm start
```

## 技术栈

- **后端**：Node.js 原生 `http` 模块（无 Express / Koa 等框架）
- **数据库**：better-sqlite3（WAL 模式）
- **前端**：原生 HTML + CSS + JavaScript 单页应用，无构建步骤
- **成就系统**：服务端检测，在故事增删改、拖拽、站会保存、Sprint 完成等操作后自动触发

## REST API

所有接口前缀 `/api/`，返回 JSON。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/state` | 获取全量状态（包含所有数据） |
| GET / POST | `/api/stories` | 获取全部故事 / 创建故事 |
| PUT / DELETE | `/api/stories/:id` | 更新 / 删除故事 |
| GET / POST | `/api/sprints` | 获取全部 Sprint / 创建 Sprint |
| PUT / DELETE | `/api/sprints/:num` | 更新 / 删除 Sprint（删除活跃 Sprint 会被拒绝） |
| GET / POST | `/api/standup` | 获取 / 保存站会记录 |
| GET / PUT | `/api/hats/:name` | 获取 / 保存帽子工坊数据 |
| GET / PUT | `/api/settings` | 获取 / 更新设置 |
| GET / PUT | `/api/vision` | 获取 / 更新愿景 |
| GET | `/api/achievements` | 获取所有成就 |
| GET / PUT | `/api/motivation` | 获取 / 更新激励统计 |
| PUT | `/api/onboarding` | 标记引导完成 |
| POST | `/api/import` | 导入状态数据 |
| POST | `/api/reset` | 重置所有数据为默认 |

## 项目结构

```
polishing-turd/
├── server.js          # HTTP 服务 + REST API
├── db.js              # SQLite 数据访问层
├── achievements.js    # 成就解锁检查逻辑
├── package.json
├── start.bat          # Windows 启动脚本
├── manifest.json      # 应用元信息
├── public/
│   ├── index.html     # 单页应用（HTML + CSS）
│   └── app.js         # 前端逻辑
├── data/              # SQLite 数据库（自动创建，gitignore）
└── docs/              # 原始设计文档
```
