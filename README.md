# 间序 · Spaceflow

会议室管理与预订：楼栋、楼层、会议室三级管理，内部平面布局、单次及周期预订、审批与权限控制。不上传真实照片。

## 启动

Node.js 22+、Docker，以及 `~/jonge/infra` 的 PostgreSQL。

```bash
npm ci
npm run setup:local
npm run deploy:local
```

打开 **http://127.0.0.1:3080**。初始账号密码在 `.local-accounts`，登录后可修改。已有数据和账号不会被初始化命令重置。

本地 HTTPS：`npm run deploy:https`，入口 `https://localhost:3443`，使用项目生成的本地证书。

开发模式：停止占用端口的应用容器后运行 `npm run dev`。构建运行：`npm run build && npm start`。

## 功能

- 楼栋与楼层管理、会议室归属、列表预览、批量编辑、可见和可订权限。
- 日期、容量和设备筛选；宫格/列表切换、布局缩略图、详情弹窗；日/周日程和拖拽改期。
- 单次预订、每天/每周/每月周期、指定星期、冲突预览和明确跳过冲突项。
- 本次或系列后续修改与取消、审批重提、数据库并发防冲突。
- 布局管理支持新增、复制、编辑屏幕和白板、导入导出与版本恢复；会议室使用所选布局的预览图。
- 用户与部门管理、账号停用、密码变更、管理员代订、站内通知和操作记录。
- 可配置 SMTP 邮件通知；当前未提供外发服务器配置，站内通知可直接使用。

## 验证与备份

```bash
npm run typecheck
npm run build
npm test
npm run test:ui
npm run test:prototype
npm run verify:setup
npm run db:backup
npm run db:verify-backup
```

浏览器验收使用本机 Chrome，CI 使用 Chromium。恢复与初始化验证均使用临时数据库，完成后删除临时库。

## 目录

`server/` 业务模块 · `web/` 应用界面 · `migrations/` 数据迁移 · `tests/` 验收 · `deploy/` 部署配置 · `.github/workflows/` CI。早期 `prototype/` 与 `poc/` 保留。

[界面与批量管理调整](docs/09-workspace-refinement.md) · [功能验收](docs/08-completion.md) · [产品方案](docs/01-product-design.md) · [架构原则](docs/03-architecture-decisions.md)
