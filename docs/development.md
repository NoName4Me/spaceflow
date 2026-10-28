# 运行与开发

## 初始化与容器运行

需要 Node.js 22.12+、npm、Docker，以及 `~/jonge/infra` 的 PostgreSQL 和 `local-infra` 网络。基础环境路径可用 `INFRA_DIR` 覆盖。

```bash
npm ci
npm run setup:local
npm run deploy:local
```

入口为 `http://127.0.0.1:3080`。初始化创建独立的 `spaceflow` 数据库、迁移和运行账号，执行迁移并补齐缺失的初始数据。初始登录密码写入 `.local-accounts`，重复执行不会重置已有密码或业务数据。

`deploy:local` 生成 `.env.container`、执行迁移、构建并启动应用容器，等待健康检查通过。容器以非 root 用户、只读文件系统运行，重启策略为 `unless-stopped`。

```bash
npm run deploy:https
docker compose --env-file .env.container ps
docker compose --env-file .env.container logs --tail=100 app
```

HTTPS 入口为 `https://localhost:3443`，使用 `.tls/` 下生成的本地证书，不修改系统信任设置。对外部署需提供实际域名的可信证书，并将 `APP_ORIGIN` 设为正式 HTTPS 地址。

## 本机开发

容器与本机开发默认共用 3080 端口，切换前停止应用容器：

```bash
docker compose --env-file .env.container stop app https
npm run dev
```

`npm run dev` 同时启动后端（3080）与 Vite（5173）。开发访问 `http://127.0.0.1:5173`，API 通过代理转发，前端修改自动热更新、后端修改自动重启。开发脚本会添加本地 Vite 来源；退出时同时关闭两个进程。

构建后也可直接运行：

```bash
npm run build
npm start
```

以上停止命令不关闭共享基础服务。开发完成后运行 `npm run deploy:local` 或 `npm run deploy:https` 恢复容器模式。

## 界面主题

`client/src/theme.css` 是当前应用的颜色入口，在 `styles.css` 之前加载，采用基础色 → 用途变量 → 组件变量三层组织。

- 通常只需修改开头的 `--palette-accent`（主色）、`--palette-ink`（墨色）、`--palette-canvas`（页面底色）、`--palette-paper`（面板底色）。悬停、选中背景、边框、阴影和布局图的灰阶通过 `color-mix()` 派生。
- `--palette-success` 和 `--palette-warning` 独立表达可用、提示等状态，换品牌色时可保持不变。
- 页面样式使用用途变量；侧栏、主按钮和 React SVG 组件使用相应组件变量。布局 JSON 不保存颜色值，缩略图、详情和编辑器共享主题。
- 换色后检查实际页面、键盘焦点和文字对比度，执行 `npm run test:ui`。派生颜色不能保证任意基础色组合都可读；浅色主按钮需要同时调整 `--button-primary-text`。

## 配置

以根目录 `.env.example` 为配置参考。

| 变量 | 用途 |
| --- | --- |
| `DATABASE_URL` | 应用运行账号的连接地址 |
| `MIGRATION_DATABASE_URL` | 迁移账号的连接地址 |
| `PORT`、`APP_ORIGIN` | 本机端口与允许的主站来源 |
| `SMTP_URL` | 本机后端的 SMTP 地址 |
| `CONTAINER_SMTP_URL` | 应用容器能访问的 SMTP 地址 |
| `MAIL_FROM` | 邮件发件地址 |
| `AI_BASE_URL` | 兼容 OpenAI 的接口根地址，包含服务商要求的 `/v1` 等路径，默认 `https://api.openai.com/v1` |
| `AI_API_KEY`、`AI_MODEL` | 模型密钥和模型名；两项均配置后启用语义理解 |

未配置 SMTP 时只使用站内通知。配置后重新启动或部署，并在账号设置中维护通知邮箱。容器内 `localhost` 指向容器本身，连接地址须从容器可达。

`.env`、`.env.container`、`.local-accounts`、`.tls/`、`backups/` 不进入版本控制。

模型服务配置写入本地 `.env`，重新启动或部署后生效；部署脚本会传入应用容器。服务需支持 `/chat/completions` 和 `response_format: {"type":"json_object"}`（[接口格式](https://developers.openai.com/api/docs/guides/structured-outputs)）。密钥仅在服务端使用。

## 迁移、备份与恢复验证

```bash
npm run db:migrate
npm run db:backup
npm run db:verify-backup
npm run verify:setup
```

- 备份写入 `backups/`，权限限制为当前用户读取。
- 恢复验证将备份还原到独立临时数据库，检查迁移、会议室、布局关联、预订约束与通知触发器，完成后删除临时库。
- 初始化验证从空数据库执行全部迁移和初始化，确认楼层与共享布局归属；使用独立账号输出文件，不覆盖当前 `.local-accounts`。
- 编译后的迁移入口为 `node --env-file=.env dist/migrate.js`。

恢复到正在使用的数据库应单独制定操作步骤；上述验证命令不会覆盖当前业务库。

## 项目目录

| 路径 | 内容 |
| --- | --- |
| `server/` | 业务服务 |
| `client/` | React、TypeScript 界面与主题 |
| `migrations/` | 数据库迁移 |
| `tests/` | 接口与浏览器测试 |
| `deploy/`、`compose.yaml`、`Dockerfile` | 容器与 HTTPS 配置 |
| `.github/workflows/ci.yml` | CI 检查 |
| `prototype/`、`poc/` | 保留的原型和实验代码，不作为当前应用入口 |

## 提交规范

本仓库使用 `NoName4Me <anich.evas@gmail.com>` 提交，作者与提交者保持一致。身份在本仓库配置，不依赖其他项目的全局身份。

提交格式为 `类型: 中文说明`，必要时可加作用域：

```text
feat: 新增会议室批量编辑
fix: 修复详情弹窗关闭后的焦点恢复
docs: 整理产品与运行文档
test: 补充共享布局预览测试
refactor: 合并重复的权限判断
chore: 调整容器构建配置
```

功能修改完成后执行相应检查，再提交。应用验证命令见[验收与测试](acceptance.md)。
