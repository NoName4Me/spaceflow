# 间序 · Spaceflow

> 企业空间资源管理与预订平台。第一期聚焦会议室的发现、内部布局可视化、预订与规则管理，为未来工位与楼层平面图扩展留出模型空间。

**当前状态：产品探索 / 交互原型 / 技术预研，尚非可上线的业务系统。**

## 现在可以体验什么

无需安装依赖，直接用浏览器打开 [`prototype/index.html`](./prototype/index.html)，即可使用**中文交互原型**：

- 空间发现：按楼栋、楼层、使用日期、时间、容纳人数、设施筛选会议室。
- 会议室详情：查看内部家具、门窗与设备布局，以及预订信息隐私展示。
- 预订日程：会议室×小时资源占用矩阵，点击空白时段发起预订。
- 我的预订：演示创建、取消、审批状态；预订信息默认公开，可主动隐藏。
- 布局编辑器：组件添加、点选、拖拽、坐标与旋转调整、复制/删除、撤销、模板重置、导出 JSON。
- 规则配置：按会议室切换直接预订 / 审批 / 仅管理员预订、周期性预订开关。

所有原型数据仅保存于浏览器 `localStorage`；不连接任何后端。**审批流、周期性预订执行、真正的用户/部门权限、并发锁、SSO 等尚未实现。**

## 文档导航

| 文档 | 内容 |
| --- | --- |
| [01 · 产品方案与原型](docs/01-product-design.md) | 定位、一期范围、核心体验、页面结构与验收点 |
| [02 · 技术选型与预研](docs/02-technical-evaluation.md) | Seatsurfing、React Konva、三种日历路线及许可证与风险 |
| [03 · 架构与关键规则](docs/03-architecture-decisions.md) | 空间模型、预订/审批、隐私、权限、并发策略 |
| [04 · 原型评审指南](docs/04-prototype-review.md) | 如何打开、体验脚本、交互完成度与限制 |
| [05 · PoC 验证清单](docs/05-poc-runbook.md) | 已运行测试、可复现命令、待验证项与通过标准 |

## 技术验证

```bash
# 零依赖预约规则纯逻辑测试；Node.js >= 20
node --test poc/booking/rules.test.mjs

# 原型：直接打开 prototype/index.html
# 可选：使用任意静态服务器托管 prototype 目录
python3 -m http.server 8080 --directory prototype

# React Konva 隔离实验：需要可访问 npm 的环境
cd poc/konva
npm install
npm run dev
npm run build
```

`poc/konva` 是独立的 React+Konva 编辑器技术实验，不是原型运行依赖。由于当前执行环境无法访问 npm registry，React Konva 尚未实机安装、构建或通过 UI 测试；不要将源码提交误解为依赖验证通过。

## 已确认产品原则

1. 一期只画**会议室内部布局**，不做整层平面图；图形以示意为主，无精确 CAD 尺寸。
2. 会议室与工位未来共享楼栋、楼层、空间资源基础模型，但独立维护布局对象。
3. 仅做会议室预订，不管理参会者、不组织会议。
4. 每间会议室可配置预订方式与周期性预订开关；可见权限与预订权限分开。
5. 支持本地用户/组织，SSO 与组织同步仅保留架构适配接口。
6. 预订主题和联系方式默认可见、预订者可隐藏；服务端需要实施隐私脱敏。

## 仓库说明建议

**Description（需要在 GitHub → Settings → General / 仓库 About 手动更新）**：

`间序 Spaceflow — 可视化会议室管理与预订平台，支持空间布局编辑，并面向工位管理扩展。`

**Topics 建议**：`meeting-room`、`room-booking`、`space-management`、`floorplan`、`scheduling`、`react`、`konva`。

> 仓库名称与 README 可以通过已连接的 GitHub 写入接口管理；仓库 About / Description / Topics 的元数据更新接口目前未开放，故本文档只提供可直接复制的配置值，未冒充已修改。

## 安全与开源说明

- 原型中的用户身份、联系人和手机号均为虚构示例，数据不应被用于真实办公预订。
- 代码未复制 Seatsurfing 等 GPL 项目源码。正式集成第三方组件前需锁定版本、核对完整许可证及依赖链。
- 本项目最终采用的许可证尚未决定；在确认前不应默认本仓库已采用 MIT 或其他开源许可证。