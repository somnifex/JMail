# JMail

JMail 是一个基于 FastAPI + Vue 的多邮箱 Web 邮件工作台。

它的目标不是做一个只能“收发邮件”的页面，而是提供更接近桌面邮件客户端的统一工作流：把多个邮箱汇总到一个入口里处理，再按邮箱、文件夹、会话、搜索条件快速下钻。

当前版本已经支持统一收件箱、单邮箱视图、会话聚合、跨邮箱搜索、归档/删除流、规则入口、管理员后台和移动端优先界面。

## 适用场景

- 希望把多个 IMAP/SMTP 邮箱集中到一个 Web 界面管理
- 需要类似 Thunderbird / Outlook 的“统一查看 + 单邮箱处理”工作流
- 希望快速接入 Gmail、Outlook、QQ、163 或自定义企业邮箱
- 希望自部署一个轻量、可读、易改的邮件系统

## 当前能力

### 邮件工作台

- 统一收件箱：在一个视图中查看全部邮箱邮件
- 单邮箱下钻：随时切换到某个邮箱的独立视图
- 会话视图：按主题聚合同一线程邮件
- 邮件视图：按单封邮件线性浏览
- 阅读窗格：桌面三栏阅读，移动端全屏阅读
- 归档 / 恢复 / 删除 / 彻底删除
- 批量已读、批量未读、批量归档、批量删除
- 拖拽入口：可把邮件拖到收件箱、归档、已删除或规则入口

### 搜索与筛选

- 跨邮箱统一搜索
- 按主题、发件人、收件人、正文、附件字段搜索
- 按是否包含附件筛选
- 按日期范围筛选
- 最近搜索记录
- 智能文件夹：收件箱、未读、星标、已读、已归档、已删除

### 邮箱接入

- 手动配置 IMAP / SMTP
- 自动识别常见服务商配置
- 支持 Gmail 和 Microsoft OAuth 接入邮箱
- 支持常见邮箱服务商预设：
  - Gmail
  - Outlook / Hotmail
  - iCloud
  - Yahoo
  - AOL
  - Zoho
  - Yandex
  - Mail.ru
  - QQ / Foxmail
  - 163 / 126 / yeah.net
  - 自定义 IMAP / SMTP

### 账户与管理

- 用户注册、登录、找回码重置密码
- JWT 认证
- 管理员用户管理
- 管理员系统设置
- 用户邮箱数量配额
- CSV / JSON 批量导入邮箱账号

### 规则能力

- 规则的创建、编辑、删除、启停
- 可按邮箱范围、匹配字段、匹配方式、动作建立规则
- 前端已提供“规则工作台”和拖拽生成规则草案入口

说明：当前仓库已完成规则管理模型与界面入口，但“规则自动执行引擎”仍在继续完善中。

## 技术栈

### 后端

- FastAPI
- SQLAlchemy 2
- SQLite（默认）
- Uvicorn
- JWT 认证

### 前端

- Vue 3（浏览器直出，无额外构建步骤）
- Element Plus
- 自定义移动优先工作台界面

## 项目结构

```text
.
├── app/                    # 后端应用
│   ├── api/v1/             # API 路由
│   ├── core/               # 配置、数据库、认证等核心模块
│   ├── models/             # 数据模型与 Pydantic schema
│   └── services/           # 业务服务层
├── frontend/               # 前端静态资源
│   ├── index.html
│   └── static/
│       ├── css/
│       ├── js/
│       └── vendor/
├── data/                   # SQLite 与邮件存储目录
├── docker/                 # Docker 配置
├── logo/                   # Logo 资源
├── logs/                   # 日志目录
├── .env.example            # 环境变量示例
├── docker-compose.yml
├── requirements.txt
└── run.py                  # 本地启动入口
```

## 快速开始

### 运行要求

- Python 3.11+
- 建议使用虚拟环境
- 默认数据库为 SQLite，无需额外数据库服务

### 本地运行

1. 创建并激活虚拟环境

```bash
# Windows
python -m venv .venv
.venv\Scripts\activate

# macOS / Linux
python -m venv .venv
source .venv/bin/activate
```

2. 安装依赖

```bash
pip install -r requirements.txt
```

3. 配置环境变量

```bash
cp .env.example .env
```

4. 启动服务

```bash
python run.py
```

5. 打开浏览器

- 应用首页: [http://localhost:8000](http://localhost:8000)
- 健康检查: [http://localhost:8000/health](http://localhost:8000/health)
- OpenAPI 文档: [http://localhost:8000/docs](http://localhost:8000/docs)

### Docker 运行

```bash
docker-compose up -d --build
```

查看日志：

```bash
docker-compose logs -f
```

服务默认监听：

- [http://localhost:8000](http://localhost:8000)

## 默认管理员账号

首次启动时会自动创建管理员账号：

- 邮箱：`admin@example.com`
- 密码：`admin123`

发布或部署前务必修改：

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `SECRET_KEY`

## 常用环境变量

完整示例见 `.env.example`。下面是最常需要修改的配置：

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `HOST` | 服务监听地址 | `0.0.0.0` |
| `PORT` | 服务端口 | `8000` |
| `DEBUG` | 是否开启调试 / 自动重载 | `false` |
| `SECRET_KEY` | JWT 签名密钥 | `change-this-to-a-random-secret-key-in-production` |
| `DATABASE_URL` | 数据库连接串 | `sqlite+aiosqlite:///./data/app.db` |
| `DATA_DIR` | 数据目录 | `./data` |
| `EMAIL_STORAGE_PATH` | 邮件原文存储目录 | `./data/emails` |
| `ADMIN_EMAIL` | 初始管理员邮箱 | `admin@example.com` |
| `ADMIN_PASSWORD` | 初始管理员密码 | `admin123` |
| `ALLOW_REGISTRATION` | 是否允许公开注册 | `true` |
| `DEFAULT_MAX_MAILBOXES_PER_USER` | 用户默认可接入邮箱数量 | `5` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | Gmail OAuth 配置 | 空 |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` / `MICROSOFT_REDIRECT_URI` | Outlook OAuth 配置 | 空 |

## API 概览

当前 API 主要分为以下模块：

- `/api/v1/auth`：登录、注册、重置密码、当前用户
- `/api/v1/users`：用户资料和管理员用户管理
- `/api/v1/mailboxes`：邮箱接入、服务商识别、同步、统计
- `/api/v1/emails`：邮件列表、详情、会话、归档、删除、标记
- `/api/v1/rules`：规则管理
- `/api/v1/admin`：系统后台
- `/api/v1/system`：系统信息与统计
- `/api/v1/batch-import`：CSV / JSON 批量导入

## 当前状态

这个仓库已经可以作为一个可运行、可自部署、可继续扩展的多邮箱邮件系统使用，但它仍然处于持续演进阶段。

已经完成：

- 多邮箱统一工作流
- 移动端优先前端重构
- 会话视图与归档流
- 增强搜索
- 规则管理入口
- 管理员后台

仍在继续完善：

- 规则自动执行引擎
- 更完整的文件夹体系
- 更强的桌面端高级工作流
- 更系统化的测试覆盖

## 开发说明

### 前端

前端是直接挂载在 `frontend/` 下的静态资源，不依赖 Vite / Webpack 打包流程。主要入口：

- `frontend/index.html`
- `frontend/static/js/app.js`
- `frontend/static/js/store.js`

### 后端

后端按服务层拆分，便于继续扩展：

- 路由：`app/api/v1/`
- 模型：`app/models/`
- 服务：`app/services/`

### 测试

仓库已包含测试依赖，但当前测试覆盖仍不完整。如果你准备继续演进这个项目，建议优先补：

- 邮箱接入流程测试
- 邮件列表 / 会话 API 测试
- 规则相关 API 测试
- 关键前端交互验证

## 贡献

欢迎提交 Issue 和 Pull Request。

如果你准备提交较大的改动，建议先说明：

- 改动目标
- 影响范围
- 是否涉及数据结构或 API 变化
- 是否需要迁移说明

## 许可证

本项目采用 GPLv3 许可证发布。

## 致谢

- FastAPI
- Vue 3
- Element Plus


