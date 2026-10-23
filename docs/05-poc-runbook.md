# 05 · 技术 PoC：执行记录与下一轮验证清单

**记录日期**：2026-10-23

## A. 当前已实际执行

| 实验 | 命令 / 证据 | 结果 |
|---|---|---|
| Node.js 规则单元测试 | `node --test poc/booking/rules.test.mjs` | **通过：6 / 6** |
| JavaScript 源码语法检查 | `node --check prototype/app.js` | **通过** |
| React Konva npm 包可获取性 | `npm view react-konva version --fetch-timeout=5000 --fetch-retries=0` | **环境限制：EAI_AGAIN，未验证安装** |
| React Big Schedule npm 包可获取性 | `npm view react-big-schedule version --fetch-timeout=5000 --fetch-retries=0` | **环境限制：EAI_AGAIN，未验证安装** |
| Chrome GUI 视觉回归 | `chromium --headless ... file:///.../prototype/index.html` | **未完成：执行环境浏览器启动超时** |
| PostgreSQL GiST/SQL | `poc/booking/exclusion.sql` | **设计代码已写，未在真实数据库运行** |
| Seatsurfing Docker 服务 | 官方仓库及功能文档研究 | **未部署** |

## B. 浏览器原型复现

```bash
python3 -m http.server 8080 --directory prototype
# 打开 http://localhost:8080
```

回归检查（人工）：

- 点击楼栋/楼层、日期、设备，卡片数量与颜色相应变化。
- 详情页展示室内布局；默认可见主题，勾选隐私后在其他视图匿名展示。
- 预订冲突被拒绝，允许相邻时段；取消预订后释放占用。
- 编辑器拖动元素、修改坐标和旋转、撤销、保存后刷新布局保留。
- 切换为审批或仅管理员模式后，新预订表现相符。

## C. React Konva 功能 PoC

代码：`poc/konva/`；独立 Vite + React + React Konva 包，不影响零依赖原型。准备可联网 Node.js 20+ 环境。

```bash
cd poc/konva
npm install
npm run build
npm run dev
```

人工测试：10 / 100 / 300 元素渲染；选中、拖动、缩放和旋转；刷新恢复/JSON 导出后视觉位置一致；快速连续拖动时无跳动。Transformer 变换后须把 `scaleX/scaleY` 归一化到 `width/height`，否则序列化和重新渲染易出现累积变形。移动端触摸编辑另评估。

通过标准：构建通过、没有 React peer-dependency 警告、核心交互稳定、100 元素在目标办公电脑基本流畅（采用实际测量，不凭主观猜测）。

## D. 日历选型现场试验（待执行）

候选先后：React Big Schedule（v9）→ React Big Calendar → FullCalendar Premium（若可接受商业授权）。在同一套 `Room / Booking` 测试数据上对比：

1. 10 / 50 / 100 个资源；500 / 1000 条日程。
2. 周和日视图切换、横向滚动、点击空闲/占用、拖拽调整、中文本地化和键盘可用性。
3. 时区和跨 DST、交叉日期、重复事件、部分时间占用、日程重叠呈现。
4. MIT/Premium 实际所用包与版本清单，检查 Pro 组件是否不小心引用。

**注意**：前端日历只负责展示与交互，不对并发预约给最终承诺。React Big Schedule 文档显示冲突引擎被列为 Pro，不能假设免费核心包含该能力。

## E. Seatsurfing 实机部署试验（待执行）

根据官方仓库 README 在隔离测试环境拉取镜像并启动，记录镜像版本、服务截图及以下结果：

- 能否配置一间会议室，对管理员指定审批，对部门限定预订，普通员工使用浏览器查看。
- 资源级别的 floorplan 是否支持放置“单个会议室内”的桌椅/门窗（预期不支持，必须现场确认）。
- 组织/角色/API 可扩展性、修改 UI 需要触碰的源码范围、许可证义务与升级风险。

## F. PostgreSQL 并发与周期性 PoC（待执行）

在 PostgreSQL 15+ 执行 `poc/booking/exclusion.sql` 并验证：

- 两个并发事务向相同 `room_id` 插入重叠 `pending/confirmed`，最多一条成功；返回业务 409。
- 同一房间相邻边界不冲突；不同房间相同时段不冲突。
- 拒绝/取消/过期状态解除占用；审批到期释放顺序与后台任务幂等性。
- 同一周期系列跨时区、跨 DST、单次例外、批量部分失败处理的一致性。

## G. 最终出具技术选型结论前的门槛

本轮给出的是**静态选型倾向 + 可运行的交互原型 + 预约规则逻辑测试 + 独立 Konva PoC 源码**。要进入生产架构冻结，至少需补齐 C、D、E、F 中的实机验证，并沉淀截图、版本、指标与风险接受记录。不得把原型或静态源码当成真正上线系统。
