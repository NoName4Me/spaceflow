# Spaceflow 基础组件改造
采用 shadcn/ui 官方 New York Radix 组件（上游 shadcn-ui/ui `055aa6b7837b1808456a24beb4c97a677864aa82`），通过 Tailwind v4 语义变量定制。原生 select 适合现有 FormData 及 Playwright，保留原生多选、checkbox 和 range 控件以维护表单及无障碍语义。按钮、文本输入、选择框、文本域、Label 和对话框进入公共基础组件。地图、拖拽编辑器、日历等业务组件不重写。
## 视觉约束
以 shadcn 官方组件的中性布局、低装饰边框、适中密度为基线，使用低饱和森林灰绿作为唯一交互主色，状态颜色独立。保留中文信息密度，不使用装饰性渐变、重阴影或无业务意义的徽章。所有资源随构建打包，运行时无需公网。
## 迁移
`components/ui/` 为官方组件源码，`components/primitives.tsx` 为旧页面兼容层；新增功能直接使用基础组件。主题集中于 `theme.css` 和 `shadcn.css`，`ui-foundation.css` 仅作为既有页面迁移桥接。后续逐个移除旧 CSS。
## 设计评审
未能通过当前连接的工具调用 Claude 或 Gemini；本次以官方组件规范和可运行截图为依据，不声称存在第三方模型评审。
