# 03 · 架构原则与关键业务规则

## ADR-001：一期模块化单体，未来扩展空间类型

**决定**：用户端/管理端共享 API；后端按 `space-catalog`、`layout`、`reservation`、`approval`、`identity`、`authorization`、`audit` 边界模块化，部署先保持单体。不是一开始拆成多个微服务。

**理由**：预订审批和时间占位高度事务相关；分布式拆分会增加跨服务一致性、排障和部署复杂度。未来引入工位，可在 `Space` 层扩展资源类型、独立新建其预约策略。

## ADR-002：楼层与布局模型分离

```text
Building 1──N Floor 1──N Space (space_type: meeting_room | workstation | ...)
                            │
                            ├──SpaceFeature / Equipment
                            ├──RoomBookingPolicy
                            ├──SpaceAccessPolicy
                            └──RoomInteriorLayout (versioned JSON)

未来独立新增：FloorPlan (楼层平面图) + SpacePlacement (空间在图上位置)
```

`RoomInteriorLayout` 不是 `FloorPlan`：前者记录家具、门窗、设备；后者记录整个楼层区域与每间会议室的空间点位。两个画布可共用渲染/编辑基础，但要采用不同类型和 API。

JSON 示例：

```json
{
  "schemaVersion": 1,
  "spaceId": "room-demo-001",
  "layoutType": "room-interior",
  "coordinateSystem": {"width": 600, "height": 390},
  "elements": [
    {"id": "desk-1", "type": "table", "x": 190, "y": 140, "w": 180, "h": 82, "rotation": 0},
    {"id": "screen-1", "type": "screen", "x": 240, "y": 60, "w": 90, "h": 16, "rotation": 0}
  ]
}
```

应校验白名单 `type`、最大元素数、坐标数值范围、布局 JSON 大小及 schema 版本。不要把用户输入当成原始 SVG/HTML 直接渲染。

## ADR-003：预订并发和审批占位

状态建议：`draft`（仅请求态，不进入预订表）→ `pending` → `confirmed`；申请也可 `rejected`、`expired`、`cancelled`。直接预订由事务写入 `confirmed`；需审批的申请由事务写入 `pending` 并占位，审批通过转成 `confirmed`；超过审批有效期要事务标记 `expired` 后释放约束。

**数据库决定**：每个实际占用时段建一行 `ReservationOccurrence`，持有 `space_id`、UTC 开始结束时刻、状态及可选 `series_id`。使用 PostgreSQL `tstzrange` 与 GiST 排除约束，避免同房间有效预约时间重叠。排除约束只包括 `pending`、`confirmed`；不包含已取消、拒绝与过期。时间区间 `[start,end)`，因此 10:00 结束与 10:00 开始不冲突。详见 `poc/booking/exclusion.sql`。

**周期性预订**：将 RRULE 与时区保存在 series 上，按周期窗口展开 occurrence，逐个检查冲突。建议整系列创建作为一次事务；若支持“只建无冲突项”，须在提交前明确显示被跳过的日期。单次取消保留 series 关联并创建 exception，不以覆盖整条 RRULE 的方式修改。

**时区**：用户看到办公楼当地时区，数据库存 UTC instant 和业务 IANA timezone；跨 DST 的“每周 9:00”应按当地墙上时钟生成，而不是每周 UTC +168 小时。

**一致性验收**：两个用户同时预订同一空间相同区间，数据库至多一条 `pending/confirmed` 成功；冲突返回 409 及可理解的冲突时段。

## ADR-004：权限与隐私分离

会议室自身权限建议拆分 `can_view`、`can_book`、`can_manage`、`can_approve`，默认 `can_view/can_book` 全员允许。判断顺序建议：租户/组织隔离 → 管理员特权 → 指定人/部门规则 → 全员默认规则。个人与部门显式拒绝的优先级需正式确认，不在原型中自行定死。

会议室 `hidden`：普通用户发现 API 完全不返回它；`disabled`：可见但禁止产生新预约；`maintenance`：记录维护时段及原因，可能与预订冲突；状态操作均记录审计。

预订默认公开 **主题、联系人、联系方式**，预订者选隐藏后：对普通可查看用户返回 `busy`、时间范围及必要的匿名占用信息；其他敏感字段不可出现在响应 JSON 中。对预订者本人、审批人员、适当授权管理员视职责返回更多字段，并审计管理操作。即使接口返回 404/403 也不应泄漏内部会议室清单。

## ADR-005：身份与组织可替换

默认本地登录、用户与部门；对接 SSO 只提供 OIDC/SAML adapter 方案位置，不预先绑定企业 IdP。组织同步应能识别被禁用用户、人员调动、组织合并及已有预约历史，不能用用户展示名称作为长期外键。

## ADR-006：非功能性验收建议

- 安全：最小权限、服务端 ABAC/RBAC、审计、日志脱敏、CSRF/XSS、接口速率限制、密码哈希与会话策略。
- 可靠性：同一请求幂等键、并发预订约束、后台超时任务重试、通知失败不影响预订事务本身。
- 性能：按日期/楼栋/楼层查询可用房间支持索引与分页；资源日程必须避免 N+1 查询。
- 无障碍：筛选、预订、取消可键盘完成；图形布局提供文本属性摘要，不把空间信息只放在画布里。
- 可扩展：布局 JSON 的读取、写入和迁移都显式带 `schemaVersion`。

## 下一次架构评审需要拍板

后端语言框架、审批角色和待审批超时策略、权限冲突优先级、周期性部分冲突处理、保留历史/数据脱敏策略、部署安全基线。
