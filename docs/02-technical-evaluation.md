# 02 · 技术选型与开源方案预研（2026-10-23）

## 结论

**优先自研业务层 + 复用通用组件。** 以 Seatsurfing 作为对照 PoC，而非默认二开底座；布局编辑引擎优先评估 React Konva；日历选型单独比较资源时间轴和许可证，预约写入必须用服务端事务防冲突。

> 本文区分「官方文档/源码资料确认」「静态研究判断」「已运行测试」。本轮无法访问 npm registry 和 Docker 镜像仓库，因此没有将 Seatsurfing 部署试用或 Konva npm 构建验证冒充为完成。

## 1. Seatsurfing

- 官方仓库：https://github.com/seatsurfing/seatsurfing
- 官网功能：https://seatsurfing.io/docs/features/
- 官方明确：Go/后端 + REST API + 管理 UI + 预订 PWA；按抽象 location/space 支持工位、会议室、车位；具备楼层图上传和空间点位拖拽、空间属性、预订和部分审批/用户组配置。
- 仓库 README 标注 GPL-3.0，产品有免费及 Professional 商用服务/功能，需逐项辨别不同发行物及能力所在层。
- **关键差异**：放置“可预订资源点”于楼层图 ≠ 在单个会议室里编辑桌椅、门窗和设备布局。后者仍需自主建模和编辑器。
- **初步结果**：不推荐以 Seatsurfing 为默认二开底座。它的面向多空间资源的抽象值得借鉴，但 GPL 许可、已有 UI 结构和室内编辑需求带来额外改造成本。
- **待验证**：本地 `docker compose up`，确认用户/权限/审批/预订 API、数据表结构、UI 改造成本、不同版本功能边界。未经实跑，不给出运行性能结论。

## 2. React Konva

- 官方仓库：https://github.com/konvajs/react-konva
- 文档：https://konvajs.org/docs/react/index.html
- 官方提供 Stage/Layer/Rect 画布组件、拖拽事件、Transformer 等，MIT 许可；**React Konva 19.3 需匹配 React 和 React DOM `^19.3.0`**。
- 与需求匹配：家具/门窗作为结构化对象存 JSON；拖拽、选中、缩放、旋转可在 Konva 完成，业务层实现模板、边界吸附、撤销栈与版本管理。
- 已提供隔离 PoC 源码：[`../poc/konva`](../poc/konva)，含添加、拖拽、缩放/旋转、撤销、JSON 导出。
- **已验证**：官方 API 和许可证资料；源码已完成。
- **未验证**：npm 依赖安装、TypeScript 构建、浏览器交互/兼容性、100+ 元素压力、导入数据的安全校验；原因是本执行环境无法访问 npm。

## 3. 日历/资源时间轴比较

| 方案 | 优点 | 许可与注意事项 | 当前建议 |
|---|---|---|---|
| React Big Calendar | 普通日/周/月视图成熟，有拖拽方案 | MIT；资源横向时间轴能力不应直接假设等价于商业调度组件 | 作为常规日历备选 |
| React Big Schedule v9 | 官方文档称免费提供资源 timeline/垂直资源视图、TypeScript 和基础 RRULE | 免费核心 MIT；**冲突引擎属于计划中的 Pro 功能，不可当作免费服务端锁**；需核对版本与接口 | 首选进入独立实机 PoC |
| FullCalendar + Resource Timeline | 视图与日历交互成熟 | FullCalendar 标准功能 MIT，**资源时间轴 Premium 商业授权** | 可接受采购成本时考虑 |
| 自研纯资源时间表 | 可以完全按照产品需要裁剪 | 多资源、跨天、拖拽、可访问性、虚拟化等工作需自己承担 | 原型可用，不建议立即作为生产基座 |

参考：
- https://react-big-schedule.ansulagrawal.com/
- https://github.com/bigcalendar/react-big-calendar
- https://fullcalendar.io/docs/premium
- https://fullcalendar.io/license

> 原型采用零依赖 HTML/CSS/JavaScript 实现一张基本占用矩阵，目的是**验证信息结构**，不是最终日历组件选择，也不是并发预约引擎。

## 4. 预约核心：PostgreSQL

官方资料：https://www.postgresql.org/docs/current/rangetypes.html

推荐使用 `tstzrange(start_at,end_at,'[)')` 的半开区间、`btree_gist` 扩展、排除约束 `(room_id WITH =, period WITH &&)`，限定状态为 `pending/confirmed`，从数据库层阻止同一会议室时间重叠。示例见 [`../poc/booking/exclusion.sql`](../poc/booking/exclusion.sql)。**仅靠前端或「先查询、后插入」不能避免竞态冲突。**

已运行的纯逻辑测试见 [`../poc/booking/rules.test.mjs`](../poc/booking/rules.test.mjs)。PostgreSQL SQL 尚未在实际数据库实例执行；仍需事务、状态超时回收、失败重试、权限审计和跨时区验证。

## 5. 架构初选

- 前端：React + TypeScript；面向桌面优先，复用布局模型和只读渲染组件。
- 布局：React Konva（待实跑验收）；室内 layout JSON 带 `schemaVersion` 和 `coordinateSystem`。
- 后端：模块化单体；NestJS 或 Spring Boot 二选一，按团队熟悉栈定，不为二开而迁就框架。
- 数据：PostgreSQL + 文件对象存储。空间资源、权限、预订事务分模块设计。
- 认证：本地账户为基础，OIDC/企业 SSO 为可替换入口；组织数据同步独立适配器。

## 6. 决策与退出条件

1. **Seatsurfing 是否二开**：只有在本地启动成功、审批/组织权限真正覆盖需求、改造成本明显低于自主实现且 GPL 合规路径明确时，才重新考虑。
2. **React Konva 是否采用**：安装构建通过；100+ 组件拖拽无明显卡顿；坐标/旋转/缩放存储后重放一致；导出导入 round-trip，无难修复的触控与层级问题。
3. **日历最终选型**：列资源数 50、100；单日事件 500、1000；中文和时区；拖拽/键盘访问；授权成本和维护风险。不要因演示数据能跑就进入生产。
4. **后端预约引擎**：100 次并发写入同一重叠区间最多只能有一条有效预订；周期性冲突可解释且事务一致。

## 7. 风险与法律边界

若复用 Seatsurfing GPL-3.0 源码必须单独做合规检查。仅借鉴公开业务思想、文档或采用 MIT 的通用库，不等于复用了 GPL 程序代码。具体发布及网络服务场景的许可证义务需经法务确认。组件的商业 Premium 功能不可在没有授权的情况下打包上线。
