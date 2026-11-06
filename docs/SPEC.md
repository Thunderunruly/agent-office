# DSH 像素办公室（dsh-pixel-office）— 施工规范（冻结接口）

> 本文件是团队协作的唯一接口契约。**先读它，再写代码**。任何跨文件的改动先找 Lead 更新本文件。

## 1. 产品目标

在 DeepSeek Harness Web UI 左侧栏加一个「像素办公室」入口（`main` 面板 + `sidebar.panellist` 图标）。
一个和「会话看板」同概念的**三维度会话可视化**：

**一栋大楼**。工作区 = 楼层，会话 = 楼层里的一间间办公室。

| 维度 | 场景 key | 内容 |
| --- | --- | --- |
| 全部 | `city` | **一整栋像素办公楼**：一层 = 一个工作区（楼层招牌 = 工作区名），一层里有多间办公室（每间 = 一个会话），哪层/哪间亮灯就说明它在工作。侧边楼层号 + 顶部统计 + 招牌。点击楼层进入该工作区的楼层平面。 |
| 工作区 | `building` | **楼层平面图**：这一层（工作区）的走廊 + 一排/两排玻璃办公室，每间办公室 = 一个会话（一个智能体团队），里面有主会话（Lead）的大桌和团队成员工位；亮灯/有人打字 = 正在工作。点任意办公室进入房间。 |
| 会话 | `room` | **一间办公室的内部**：主会话（Lead）独占老板办公室（玻璃隔断、大桌、名牌），teammates/subagents 在开放办公区工位。角色有打字/发呆动画，点击角色 = 打开对应会话（`ctx.uiWorkspace.openSession`）。 |

> 数据模型不变：`workspace -> floors(session) -> staff`。场景换算：tower 一层 = 一个 workspace（`building.floors` = 该层的 office 列表）；floor 平面一间 = 一个 session。

必须能处理：
- 没有工作区的会话（归入「未分组」虚拟楼）。
- 没有团队的会话（老板办公室只有 Lead 一人，员工区空位）。
- 任意多会话/团队（超出画布用楼层号/`+N` 提示，v1 允许分页或只显示前 N，但不能崩）。
- 未来兼容 Super-agent（Router + Worker 多会话编排）：**员工一律从「会话图」推导**——团队投影的 teammates、`parentId` 指向本会话的子会话（子代理）、团队投影缺席时也能兜底。不要写死只认 `agentTeam`；角色名 `lead`/`router`/`captain`/`boss` 都当老板，其余当员工。
- 数据全部是活的：`sessions.list` / `workspaces.list` 快照订阅，运行状态、标题、成员变化即时反映。

## 2. 插件事实（已核实，DSH 0.2.1-rc.5）

- 包名 `dsh-pixel-office`，bundle 一个 host 行，`dsh.client.platform = "web"`，客户端单文件 `client.js`。
- 客户端模块格式（构建产物，`scripts/build.mjs` 生成）：

```js
window.__ModuleLoader__.load({
  id: 'dsh-pixel-office',
  factory(require) {
    const React = require('react');
    const { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } = React;
    const h = React.createElement;
    // ... src/*.js 按序拼接（不要在这些文件里 require 任何东西）
    return { inject, apply };
  },
});
```

- **宿主组件复用（用户明确要求）**：允许像 session-kanban 一样 `require('@deepseek-ai/dsh-client-ui-primitives')`，并在 `package.json` 的
  `dsh.client.external` 里声明；**必须 try/catch 并保留自绘 fallback**（宿主升级拿不到组件时页面不能崩）。可用的已知导出（来自 kanban）：
  `Button` / `SegmentedControl` / `SegmentedTabs` / `Menu` / `Tooltip` / `Input` / `Checkbox` / 若干 `Icon*`。
  `SegmentedControl` props: `{ id, label, value, options:[{value,label}], onChange }`；
  `Menu` props: `{ open, onClose, items:[{id,label}], selectedId, onSelect, align, side, portal, anchor }`；
  `Button` props: `{ variant:'primary'|'outline'|'ghost', icon, disabled, onClick }`。
  页面外壳优先用真实组件（设置行昼夜选择、顶部按钮/下拉/帮助等）；不要自己重画它们的样式。
- 客户端服务：
  - `ctx.sessions.list`：`{ ids, byId: Record<id, SessionSummary>, phase, projectionsBySession }`，`ObservableSnapshot`（`getSnapshot()/subscribe(fn)`）。
    - `SessionSummary`：`{ id, title, displayTitle, running, updatedAt, cwd, origin, parentId, blank, projectionValues?: { agentTeam?, sessionKanban? } , ... }`（可参考同作者的 dsh-session-kanban 插件的 `buildRow` 用法）。
  - `ctx.workspaces.list`：`{ items: [{ workspaceId, title, path, sessionIds }], archivedSessionIds, pinnedSessionIds, phase }`。
  - `ctx.remote.session.projections({ sessionId })` → `{ ok, value: { values } }`（清单投影缺失时补拉；可选，v1.1 再做）。
  - `ctx.uiWorkspace.openSession(sessionId)`：打开会话。
  - `ctx.layout.selectPanel('pixel-office')`：打开办公室面板；`ctx.layout.beginNavigation()` 可用。
  - `ctx.locale.register(NS, { zh, en })` / `ctx.locale.bind(NS)`；`ctx.locale.subscribe(fn)`。
  - 订阅写法：`useSyncExternalStore(cb => store.subscribe(cb), () => store.getSnapshot(), () => store.getSnapshot())`。
- 槽位注册（`src/app.js`，Lead 所有）：

```js
ctx.slots.inject('main', () => ctx.slots.register(
  { name: 'main', key: PANEL_ID, locale: NS, inject: () => ({ ctx }) }, OfficePage));
ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
  { name: 'sidebar.panellist', id: PANEL_ID, order: 21, locale: NS,
    label: () => t('panel.title'), inject: () => ({ ctx }) }, PixelOfficeIcon));
ctx.slots.inject('settings.general.item', () => ctx.slots.register(
  { name: 'settings.general.item', id: 'pixel-office-display', order: 27, locale: NS,
    inject: () => ({ ctx }) }, OfficeSettingRow));
```

- 团队投影（Agent Teams）：`entry.projectionValues.agentTeam = { members: [{ id, name, role: 'lead'|'teammate' }] }`。
  兜底：会话图里 `parentId === 本会话` 且 `origin !== 'fork'` 的子会话 = 员工（subagent）。
- 归档会话：用 `workspaces.list` 的 `archivedSessionIds` 从所有统计与场景里过滤。
- 样式只允许引用 `--dsw-alias-*` 主题 token（画布像素画本身可以用固定色）。禁止 `<iframe>`、禁止往 `document.body`/`head` 以外乱插 DOM；样式通过 `ctx.effect` 注入 `<style data-plugin="dsh-pixel-office">`（app.js 已做）。
- `localStorage` 只用 `dsh.pixel-office.*` 前缀；所有用户可见文字走 `src/strings.js`（zh + en 同时给）。

## 3. 文件与所有权（写作用域，禁止越界）

| 文件 | 所有者 | 内容 |
| --- | --- | --- |
| `package.json`, `cordis.patch.yml`, `index.js`, `client.js`(生成), `scripts/build.mjs`, `locale/*.json`, `icon.svg`, `README.md` | Lead | 清单、构建、安装、展示元数据 |
| `src/app.js` | Lead | 样式注入、locale 注册、槽位注册、侧栏图标 `PixelOfficeIcon` |
| `src/render.js` | Lead | canvas 生命周期、整数缩放、rAF、命中测试、hover/click 分发、昼夜切换、转场 |
| `src/model.js` | Lead | 数据模型（workspace→floors→staff）、订阅 hook、团队兜底推导 |
| `src/art-core.js`, `src/art-room.js` | **T1 美术** | 调色板/像素原语/角色/家具/共享道具；**会话房间场景** `buildRoomScene/paintRoomScene` |
| `src/art-city.js`, `src/art-building.js` | **T2 场景** | **大楼**（全部视图，一层=一个工作区）`buildCityScene/paintCityScene`；**楼层平面**（工作区视图，一间=一个会话）`buildBuildingScene/paintBuildingScene` |
| `src/ui.js`, `src/strings.js` | **T3 应用** | 页面外壳、标签叠层、帮助、设置行、CSS、中英文案 |
| `tests/*`、`scripts/verify.mjs` | T4 校验（集成期加入） | 纯函数单测、构建校验、安装后检查 |

**任何情况下不要修改**：本机 DSH profile 目录（安装由 plugin_manager 负责）、其它插件仓库（只读参考）、DSH 安装目录（只读参考）。

## 4. 构建

```powershell
cd <repo-root>
node scripts/build.mjs --check   # 只检查：node --check 每个 src + JSON 合法 + 禁用依赖扫描
node scripts/build.mjs           # 生成 client.js（只有 Lead 在集成时跑）
```

拼接顺序（wrapper 里同一个函数作用域，**用函数声明，避免顶层 `const` 重名**）：

```
src/art-core.js → src/art-city.js → src/art-building.js → src/art-room.js
→ src/model.js → src/strings.js → src/render.js → src/ui.js → src/app.js
```

产物 `client.js` 的头尾由 build.mjs 包裹（见 §2）。wrapper 已提供：`React`、`h`、`useCallback/useEffect/useMemo/useRef/useState/useSyncExternalStore`。**src 文件内不要再声明这些名字**。

安装：用 `plugin_manager` 的 `install_bundle`，target 为本仓库的绝对路径。
安装后需要刷新一次 DSH 窗口；之后每次改 `src/*` → Lead 重新 build → 刷新页面即可生效（客户端 bundle 每次页面加载重新拉取）。

## 5. 冻结数据契约

### 5.1 模型（`src/model.js`）

```js
function buildOfficeModel(sessionSnapshot, workspaceSnapshot, options?) -> OfficeModel
function selectCity(model) -> CityModel
function selectBuilding(model, workspaceId) -> BuildingModel | null
function selectRoom(model, sessionId) -> RoomModel | null
function useOfficeModel(ctx) -> { model, phase }   // React hook，订阅 sessions.list + workspaces.list
```

```js
OfficeModel = {
  phase: 'pending' | 'ready',
  totals: { workspaces, sessions, running, teams, members },
  buildings: [BuildingModel],
  timestamp: number,
}
BuildingModel = {
  workspaceId: string,            // 'ungrouped' 为虚拟工作区
  title: string, path: string,
  sessionCount: number, runningCount: number, memberCount: number,
  floors: [FloorModel],           // 按 updatedAt 降序；只含顶层会话（有 parentId 的不算楼）
  updatedAt: number,
}
FloorModel = {
  sessionId, title, running, updatedAt,
  isBoss: true,                   // 每层的主会话（该 session 自己）
  currentWork: string,            // sessionKanban 投影 request/reply 截断（可空）
  todos: { done, total },
  workers: [MemberModel],         // teammates + 子会话（subagent），不含 lead
  teamSize: number,               // workers.length + 1
  accentSeed: number,             // 1..8，用于配色
}
MemberModel = {
  sessionId, name, title, role: 'lead' | 'teammate' | 'subagent',
  running, currentWork, todos:{done,total}, depth: number,
}
RoomModel = {
  sessionId, title, running, updatedAt, workspaceId, workspaceTitle,
  boss: MemberModel, staff: [MemberModel],   // staff 最多 6 个，按 role 再按 running/updatedAt 排
  todos: { done, total }, currentWork,
  teamSize, accentSeed,
}
```

规则：
- 顶层会话 = `workspace.sessionIds` 里有 & 没有 `parentId` 的会话；归档过滤。
- 员工推导：① `projectionValues.agentTeam.members`（role 非 lead 的；若 members 里没有 id===本会话的 lead，则视为**不是本队**，走 ②）；② `parentId === floor.sessionId` 的子会话（`origin === 'fork'` 不算）。
- 角色归一：`role === 'lead'` 或 id === 队长的当老板；团队投影的 member.id 若在 session list 里找不到会话（如刚落盘未进列表），也要显示为员工（`sessionId` 用 member.id，`title` 用 name，`running` false）。
- `accentSeed = hashCode(workspaceId|sessionId) % 8 + 1`（稳定）。
- 数据异常（缺字段、环）绝不能抛错；空工作区返回空数组。

### 5.2 场景（`src/art-*.js`）

逻辑分辨率固定 **640 × 360**，整数像素。build 一次，paint 每帧。

```js
function buildCityScene(cityModel, viewport, options) -> CityScene
function paintCityScene(ctx, scene, anim)
function buildBuildingScene(buildingModel, viewport, options) -> BuildingScene
function paintBuildingScene(ctx, scene, anim)
function buildRoomScene(roomModel, viewport) -> RoomScene
function paintRoomScene(ctx, scene, anim)
```

`options = { scroll }`：**页索引**（不是楼层偏移，0 = 第一页）。**大楼默认一屏装下所有工作区楼层**（行高按可用高度自适应，24–64px，优先全部装下）；
装不下时才分页：`scene.scrollMax = 页数 - 1`，`scene.scrollPageSize` = 每页楼层数，`scene.scrollTotal` = 总楼层数，
`scene.scrollRange = { from, to }` = 当前页显示的楼层号（1-based，用于 UI 显示「楼层 4–12 / 12」）。
**必须在最后一页才画大堂+街道**；非最后一页禁止把更低楼层画进 lobby/街道区域（否则会出现"1F 都看到了却没有地面，
还要再滑一下"的诡异情况——这是用户报过的 bug）。非第一页不画屋顶（画切边）；顶部页屋顶周围画云。不要用「还有 N 层」标签。
滚动步进 = 1 页。**翻页控件 = 画布内的像素箭头面板**（用户明确要求：这是场景美术的一部分，保留像素图标；不要再来一份 DOM 按钮）：
场景在电梯井旁画像素 ▲▼ 按钮 + 轨道/轿厢指示，`hits` 发 `{kind:'scroll', delta:±1}`；**不要给这个面板加任何装饰性 glow**
（用户反馈过"凭空发光"）。UI 只负责 wheel/↑↓/点击转发，不再渲染自己的分页按钮。楼层平面里办公室超过一屏容纳数时同样按页滚动。

`viewport = { w, h }`：逻辑画布尺寸，由 renderer 按实际窗口实时给出（整数像素，典型 700–900 × 500–800，最小 480×320，**不固定 640×360**，窗口越方越接近方形）。
**scene.w / scene.h 必须等于 viewport.w / viewport.h；所有几何一律由 scene.w / scene.h 推导，禁止写死 640/360**（可以保留常量作为默认值兜底）。

布局密度硬要求（用户反馈第一版"旁边太空、全都挤在一起"）：
- 场景必须铺满整张画布：大楼占宽度 45%–60%、占高度 65%–80%；楼层平面在会话少时用**更大的办公室**（2 间各占半宽）而不是一堆小房间挤中间；房间的老板办公室/工位随画布放大。
- ≥90% 的画面面积要有内容（天空/街景/墙面/地板/家具/植物/灯光都算），不要把主体缩成中间一小块。
- 楼层/办公室/员工数量多时按可用空间收窄尺寸或分页；数量少时放大铺满。

```js
Scene = {
  kind: 'city' | 'building' | 'room',
  w: viewport.w, h: viewport.h,
  hits: [{ x, y, w, h, target: Target }],     // 画布逻辑坐标；先后顺序 = 命中顺序（后者优先）
  labels: [{ x, y, anchor: 'above'|'below'|'center'|'right', kind: string,
             text: string, sub?: string, tone?: string, data?: object }], // DOM 叠层标签
  ...场景自有字段
}
Target =
  | { kind: 'building', workspaceId }   // 点大楼（tower）里的某层 -> 进入该工作区楼层平面
  | { kind: 'floor', sessionId }        // 点楼层平面里的某间办公室 -> 进入该会话房间
  | { kind: 'member', sessionId, role } // room 里点员工/老板 -> 打开对应会话
  | { kind: 'scroll', delta: -1 | 1 }   // 画在场景里的上/下滚动箭头 -> UI 调整 scroll
```

**label kind 约定（UI 按 kind 本地化，场景只给数据）**：

| kind | 出现场景 | text | data |
| --- | --- | --- | --- |
| `workspace` | tower（一层 = 工作区） | 工作区名（空则 UI 用「未分组/未命名」） | `{ workspaceId, ungrouped, runningCount, sessionCount, memberCount }` |
| `workspace-title` | floor 平面顶部招牌 | 工作区名 | 同上 |
| `office` | floor 平面（一间 = 会话） | 会话名 | `{ sessionId, floorNumber, running, teamSize, workers, currentWork }` |
| `boss` | room | 主会话者名字 | `{ sessionId, running, currentWork, todos, title }` |
| `member` | room | 成员名 | `{ sessionId, role, running, currentWork, todos }` |
| `whiteboard` | room | '' | `{ done, total, teamSize, hiddenStaff }` |

>`tower-more` / `floor-more` 已废弃：楼层/办公室放不下时一律用竖直滚动 + 上下箭头（`target.kind==='scroll'`），不再显示"还有 N 层"。

`anim`（render.js 每帧计算）：

```js
anim = {
  time: number,          // ms，单调递增
  night: boolean,        // 昼夜
  hover: Target | null,  // 当前悬停目标（用于高亮）
  page: number,          // 当前分页（v1 场景可忽略）
  reducedMotion: boolean,
}
```

约定：
- painter 只画、**绝不**读写 DOM/React/网络；只接收这 3 个参数。
- `ctx` 是 `CanvasRenderingContext2D`，`ctx.imageSmoothingEnabled = false` 由 render 设置。
- `labels` 里文字不要换行，长度 ≤ 24 字符；给 UI 层再截断。
- `hits` 的矩形不要重叠乱序：越上层（老板办公室 > 员工桌 > 地板）越靠后。
- 画布坐标系原点左上角，尺寸 `scene.w × scene.h`（viewport 决定）；四周留 8px 安全边。

### 5.3 页面外壳（`src/ui.js`）

```js
function OfficePage(props)                 // main 槽组件；props.ctx 注入
function OfficeSettingRow(props)           // settings.general.item 行
const OFFICE_CSS = `...`                   // app.js 注入 <style>；只用 --dsw-alias-* token
```

页面结构（类名固定，CSS 由 T3 写）：

```
.po-page
  .po-topbar   [面包屑 .po-crumb > 按钮/文本] [统计 chips .po-stats] [按钮 .po-tool 白天/夜晚/自动 | 帮助]
  .po-stage    (flex:1, 最小 0, 相对定位)
    canvas.po-canvas
    .po-labels (absolute inset 0, pointer-events none) 每个 label 一个 .po-label
    .po-empty / .po-loading 覆盖层
  .po-footer   [图例 .po-legend: 亮灯=工作中 / 键盘=员工 / 皇冠=主会话] [提示文字]
```

- 顶部统计：`工作区 N · 会话 M · 进行中 K · 团队 T`（由 locale 拼接）。
- 面包屑：`办公室` / `工作区名` / `会话名`，可点击上行；Esc 也上行。
- 昼夜：三态切换（自动/白天/夜晚），存 `localStorage['dsh.pixel-office.display.v1']`；自动按本地时间 7:00–19:00 为白天。
- 场景切换：`scope = {kind:'city'} | {kind:'building', workspaceId} | {kind:'room', sessionId}`；点击 building → building，点击 floor → room，点击 member → `ctx.uiWorkspace.openSession(sessionId)`。
- 自动刷新：模型变化时重建 scene（`build*Scene` + renderer.setScene）；不要每帧重建。
- 空态：没有会话时城市显示空街区 + 提示「还没有会话，去开一个吧」。
- 帮助浮层：说明三种视图与点击规则，Esc 关闭。
- `OfficeSettingRow`：设置行「办公室显示」下拉（自动/白天/夜晚），与页面按钮共享同一 localStorage 键，改动后派发 `window.dispatchEvent(new CustomEvent('dsh-pixel-office:display'))`。

### 5.4 渲染器（`src/render.js`，Lead）

```js
function createOfficeRenderer(options) -> {
  start(), destroy(),
  setScene(scene),          // 场景切换（可带转场）
  setNight(boolean),
  setReducedMotion(boolean),
  relayout(),               // 容器尺寸/字体变化后重算
}
// options = { canvas, stage, getAnimHints, onActivate(target), onHover(target|null),
//             onLayout(transform) }
// transform = { scale, offsetX, offsetY, cssWidth, cssHeight, logicalWidth, logicalHeight }
```

- 画布尺寸 = `logicalWidth × logicalHeight`（随窗口变化；**按整数设备像素倍率**计算以保证 HiDPI 下像素清晰：
  `pixelScale = max(1, ceil(stageWidth * devicePixelRatio / 1100))`，`logicalWidth = round(stageWidth*dpr/pixelScale)`，
  `logicalHeight = round(stageHeight*dpr/pixelScale)`，CSS 尺寸 = logical × pixelScale / dpr，正好铺满 stage）。
  典型 150% 缩放的 971×800 窗口会得到 728×600 逻辑画布，12 个工作区楼层应能**一屏全部装下**。
  UI 把 `{ w: logicalWidth, h: logicalHeight }` 作为 viewport 传给 `build*Scene`；layout 变化时重建 scene。
- pointer 事件做命中测试（`scene.hits` 逆序）；hover 触发 `onHover`；click 触发 `onActivate`；`pointermove` 时更新 cursor。
- 每帧 `anim = { time, night, hover, page:0, reducedMotion }` 调 painter；`requestAnimationFrame`，不可见时（document.hidden）暂停。
- 转场：`setScene` 时 260ms 黑场淡入淡出（先黑 0→1，再 1→0），期间画新场景。
- `onLayout` 变化时通知 UI 重排 labels。
- `destroy` 移事件/取消 rAF/断 ResizeObserver。组件卸载必须调用。

## 6. 美术方向（T1/T2 必读）

参考：Habblaud（habbo 风俯视 3/4 像素办公室）。**不要下载/复制它的素材**，只学风格：暖灰/米白地板、深色 1px 描边、家具平涂 + 两档明暗、人物圆头豆豆眼、角色名牌、暖黄灯光。

- 调色板（art-core 导出 `PAL`，其余文件引用）：
  ```
  ink #1d212b, inkSoft #2f3542, outline #141822
  floor #d9d4c7 / #cfc9ba / #e2ddd0, floorLine #b9b2a3
  wall #efeadd / #e4ddcc, wallTrim #c9c0ac
  wood #b98a5a / #9c6f45 / #7d5735, metal #9aa3ad / #6f7883
  fabric #6d7f8f / #56687a, chair #333b48 / #454f5e
  screen #2b3a4a, screenGlow #62d9c6, ledGreen #63d471, ledAmber #e8b153, ledRed #e06a5f
  skin #f0c9a6 / #d9a97f / #b9825c, hair #2b2f3a / #6b4a35 / #d8b25c / #a34d3f / #8a8f98
  plant #4f7d4a / #6a9a5f / #3c6139, pot #b0745e
  night #0e1626 / #16243a / #24344f, lampLight #ffd97a
  ```
- 人物 16×24（画布像素），2–3 帧打字动画 + 1 帧发呆；老板加领带/皇冠名牌。
- 三层信息必须一眼可读：**哪个工作区有事（楼亮灯）→ 哪层在干活（层里有人打字）→ 谁在干活（人名牌 + 状态点）**。
- 亮灯 = 该楼/该层有 `running` 会话。白天也要能看出"亮灯"：用窗内暖黄光 + 屏幕光。
- 房间必须包含：老板办公室（玻璃隔断、大桌、老板椅、名牌、台灯）+ 开放办公区（工位、显示器亮屏、键盘、椅子、人物）+ 墙饰（窗、挂钟走真实时间、白板、书架、海报、盆栽）+ 地板（大格瓷砖 + 老板办公室地毯）。员工空位显示空椅子。
- 大楼（全部视图）必须包含：天空（云/太阳/月亮+星星）、**一整栋楼**（楼顶招牌/天台水塔/天线红灯）、每层一条水平楼板 = 一个工作区（招牌 = 工作区名 + 楼层号），每层里 3–4 个**小办公室窗口**（每间 = 一个会话，亮 = 工作中，能看到 2–3 个像素小人剪影/打字光）、底楼大堂（转门、路灯、树、邮筒、长椅、小车），楼层多时用「还有 N 层」或滚动。
- 楼层平面（工作区视图）必须包含：地板/走廊、**每间办公室 = 一个会话**（玻璃隔断/门/门牌、迷你工位、主会话大桌、亮屏、正在打字的角色剪影、团队人数），走廊上的电梯口/植物/饮水机/公告板，楼层招牌；办公室多时 4 间一行/两行 + 「还有 N 间」。
- 会话房间（room）细节见上：老板办公室 + 开放办公区。
- 所有动画用 `anim.time` 驱动（正弦/取模），不要 setInterval；性能目标 60fps（纯 fillRect 画，少用 shadowBlur；发光用叠加半透明矩形/像素圆）。

## 6.5 固定像素世界（用户最终确认的模型）

**所有场景都是固定像素世界**：楼层 32px、大楼宽 420、电梯井 24、目录牌 208、屋顶 26、大堂 32、街道 56、办公室 210×150、
工位 132×64、人物 16×24、道具尺寸……全部写死常量，**不随 viewport 缩放**。

- renderer 的像素倍率也固定：**2 个设备像素 / 美术像素**（`OFFICE_DEVICE_PIXEL_SCALE = 2`）。
- viewport 只决定"看到多少"：窗口变大 → 露出更多天空/街景/墙面/地板（可以在露出区域**增加**固定尺寸道具），
  绝不被拉伸；窗口变小 → 先裁外围装饰，再按页滚动（city/building 有像素翻页箭头；room 对称裁切保证核心可见）。
- 世界块居中/贴底：city 楼体块水平居中、街道贴 viewport 底边；building 办公室网格居中、走廊贴底；room 核心居中。
- 容量 = 固定尺寸能放下的数量；`total <= capacity` 就一屏，否则分页。禁止把元素变小来"适配"。

## 7. 协作与验收

1. 各人在自己的写作用域内交付；写之前先读现有 stub（Lead 已给可运行骨架）。
2. 完成时 `node scripts/build.mjs --check` 必须干净；再用 **fixture 自测**：`node tests/model-test.mjs`（T4 提供；T3 先保证纯函数可被 import——`src/model.js` 用 `export` 不行，构建是拼接；测试方式：`node tests/model-test.mjs` 直接读 src 文本 + `vm` 执行，T4 负责实现）。
3. 集成：Lead build + install + 让用户刷新截图；按截图反馈继续改各自文件，**不要循环造变体**。
4. 提交消息给 Lead：改了什么、接口是否有变、需要 Lead 做什么（如新增 locale key）。
5. 禁止：启动浏览器/服务、改 profile、装插件、跑 `plugin_manager`（Lead 独占）、读写对方拥有的文件、下载素材。

## 8. v1 验收清单（Lead 最终检查）

- [ ] `node scripts/build.mjs --check` 通过；`client.js` 生成；无被禁 import。
- [ ] `install_bundle` 返回 applied；`Slots.listSubTree root=main` 能看到 key `pixel-office`；`sidebar.panellist` 出现 `pixel-office`。
- [ ] 页面无 slot crash（用户截图确认）；三种视图可切换；点击楼层/角色有正确导航。
- [ ] 中英文案齐全；`meta.title/description` 在设置-插件里显示「像素办公室」；图标为像素楼。
- [ ] 浅色/深色主题下页面外壳可读；画布昼夜切换正常。
- [ ] 无网络请求、无 telemetry、未写入非 `dsh.pixel-office.*` 的 localStorage。
