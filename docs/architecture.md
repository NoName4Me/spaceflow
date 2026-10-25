# 架构与数据模型

## 技术与模块

采用模块化单体，用户端和管理端共享 API。

| 层次 | 实现 |
| --- | --- |
| 前端 | React 19、TypeScript、Vite；CSS 主题与 SVG 布局预览和编辑 |
| 后端 | Node.js 22、TypeScript、Express 5、Zod |
| 数据 | PostgreSQL；复用本地基础环境，独立数据库与账号 |
| 部署 | 多阶段 Docker 镜像、Compose、可选 Nginx HTTPS |
| 验证 | Node 测试、Playwright、axe、GitHub Actions |

`server/app.ts` 负责会话、状态读取和路由装配。其余模块按业务划分：

- `locations.ts`：楼栋、楼层及位置统一维护。
- `management.ts`、`bulk-rooms.ts`：账号、部门、会议室及批量修改。
- `access.ts`：可见、可订和个人拒绝规则。
- `reservations.ts`、`booking-edits.ts`、`recurrence.ts`：创建、周期展开、修改和状态处理。
- `layouts.ts`、`template-choice.ts`：共享布局、版本和房间布局选择。
- `calendar.ts`、`room-bookings.ts`：资源日程、会议室预订记录的日期筛选与分页。
- `booking-view.ts`：各预订接口共用的隐私过滤。
- `mail.ts`：邮件队列消费与重试。
- `db.ts`、`auth.ts`：连接池、事务、密码和会话令牌工具。

前端源码位于 `client/src/`，由 React 管理页面、表单、弹窗和 SVG 图形的生命周期：

- `App.tsx`：登录入口、导航、页面装配和弹窗入口。
- `pages/`：发现、日程、预订、会议室、布局和账号管理。
- `components/`：表单字段、焦点管理、批量选择和声明式 SVG 组件。
- `api.ts`、`types.ts`：请求处理、错误类型和业务数据接口。
- `workspace.tsx`：会话、服务端快照、通知及跨页筛选；页面请求通过 AbortController 取消过期结果。布局草稿、选择、撤销、表单和列表选择保存在对应组件内。
- `theme.css`：基础色、用途及组件变量；页面与 SVG 共用，颜色不进入业务数据。

布局导入与服务端保存共用 `server/layout-schema.ts` 的纯 Zod 校验，不把数据库或路由模块引入浏览器。页面通过 React 状态切换，沿用当前单入口交互；请求使用原生 fetch，未引入额外状态库。

Vite 将前端构建到 `dist/client/`，Express 在生产和浏览器测试中提供该静态目录。前后端部署为同一服务，API 路径保持 `/api/*`。开发时 Vite 运行在 5173，代理 API 到 3080，并提供前端热更新。


## 数据关系

```text
buildings 1—N floors 1—N rooms
layout_templates 1—N rooms
layout_templates 1—N layout_template_versions
rooms 1—N bookings
reservation_series 1—N bookings
reservation_series 1—N reservation_exceptions
departments 1—N users 1—N sessions
users 1—N bookings
bookings 1—N notifications 1—1 email_outbox
操作 → audit
```

`rooms.floor_id` 表示位置，`rooms.layout_template_id` 表示共享布局；容量、设施、规则及权限保存在 `rooms.data`。楼栋和楼层改名时同步位置展示字段。

`layout_templates` 保存名称、分类、结构化图形与版本；`layout_template_versions` 保存历史快照。旧 `rooms.layout` 和 `layout_versions` 保留兼容历史数据，当前用户预览以共享布局为准。

`reservation_series.rule` 保存周期规则、时区及变更记录。每个实际时段存为一条 `bookings`；单次取消、跳过与修改保留系列例外。

## 事务与一致性

- 使用 `btree_gist` 和 `tstzrange` 排除约束，阻止同一房间有效预订重叠。最终冲突由数据库判定，响应为 409。
- 周期创建、系列修改和批量房间修改均为单个事务，失败整批回滚。
- 预订修改先在事务内释放受影响占位，再写入最终时段，避免系列内部与自身冲突；不向外发布中间状态。
- 预订、共享布局和历史房间布局使用版本号校验，阻止覆盖过期修改。
- 通知通过延迟约束触发器在提交时生成，邮件入队与通知同事务。
- 邮件消费者以 `FOR UPDATE SKIP LOCKED` 领取任务，退避重试并使用固定邮件标识。投递按至少一次处理，不承诺网络故障下绝对不重发。

## 身份与数据返回

密码使用带随机盐的 scrypt 哈希；会话令牌只在数据库保存摘要，浏览器使用 HttpOnly、SameSite Cookie。服务端校验写请求来源；隐藏字段在序列化前移除。

管理员可管理全部会议室。员工只获取可见会议室及其必要布局；权限变化后仍保留本人预订历史。账号停用或角色、密码变化撤销相应会话。

运行账号 `spaceflow_app` 与迁移账号 `spaceflow_migrator` 分离。迁移由显式命令执行，不在应用启动时自动使用高权限账号。

## 布局格式

坐标系固定为 600×390，格式版本为 1。旋转字段为 `r`，尺寸字段为 `w`、`h`。

```json
{
  "schemaVersion": 1,
  "coordinateSystem": {"width": 600, "height": 390},
  "elements": [
    {"id": "screen-1", "type": "screen", "x": 250, "y": 50, "r": 0},
    {"id": "board-1", "type": "board", "x": 80, "y": 130, "r": 90, "w": 100, "h": 14}
  ]
}
```

导入限制为 256 KB、最多 300 个元素；组件类型、元素标识唯一性、数值范围及版本均需校验。图形只由白名单组件生成，不渲染输入中的任意 HTML 或 SVG。

## 主要接口

| 模块 | 接口 |
| --- | --- |
| 身份 | `/api/login`、`/api/logout`、`/api/me`、`/api/account/*` |
| 状态与日程 | `/api/state`、`/api/calendar` |
| 空间 | `/api/buildings`、`/api/floors`、`/api/rooms`、`/api/rooms/bulk` |
| 布局 | `/api/layout-templates` 及其版本接口 |
| 会议室预订记录 | `/api/rooms/:id/bookings?from=日期&to=日期&page=页码` |
| 预订 | `/api/bookings/preview`、`/api/bookings`、`/api/bookings/:id` |
| 状态与系列 | `/api/bookings/:id/:action`、`/api/series/:id/:action` |
| 通知与审计 | `/api/notifications`、`/api/audit` |
| 健康 | `/health` |

数据库结构以 `migrations/` 中的顺序迁移为准，当前共 9 个迁移；已执行迁移不应就地修改。
