// ===== strings.js =====
// Dictionaries for the pixel office UI. Both locales must carry the same key set; the
// page never hard-codes user-visible text. Owner: T3 (app shell).
//
// Vocabulary (keep it consistent everywhere):
//   city view      -> 整栋办公楼 / 一层 = 一个工作区 / 一层里的小办公室 = 一个会话
//   building view  -> 工作区楼层平面 / 一间玻璃办公室 = 一个会话
//   room view      -> 一个会话的内部 / 主会话 + 团队成员 + 子代理
// Labels come from the scene painters as data ({kind, text, data}); this file only
// supplies the wording around that data.

const OFFICE_STRINGS = {
  zh: {
    // Panel
    'panel.title': '像素办公室',
    'panel.subtitle': '工作区是楼层，会话是办公室，团队是房间里的人',

    // Breadcrumb / navigation
    'nav.breadcrumb': '当前位置',
    'nav.home': '办公室',
    'action.back': '返回上一层',
    'action.help': '使用说明',
    'action.close': '关闭',

    // Header status line (city view) — plain host-style text, no pill chips
    'header.stats': '工作区 {workspaces} · 会话 {sessions} · 进行中 {running} · 团队 {teams}',

    // Day / night switch (three states, shared with the Settings row)
    'display.label': '昼夜',
    'display.auto': '自动',
    'display.day': '白天',
    'display.night': '夜晚',
    'display.autoHint': '跟随本地时间：7:00–19:00 为白天',
    'display.dayHint': '始终使用白天',
    'display.nightHint': '始终使用夜晚',

    // View names
    'view.city': '全部视角',
    'view.building': '工作区视角',
    'view.room': '会话视角',

    // Workspace / session naming
    'workspace.ungrouped': '未分组',
    'workspace.untitled': '未命名工作区',
    'workspace.sessions': '{n} 个会话',
    'workspace.running': '{n} 进行中',
    'workspace.idleAll': '全部空闲',
    'workspace.members': '{n} 位成员',
    'session.untitled': '未命名会话',
    'label.untitledMember': '成员',

    // Floor signage / overflow chips
    'label.floor': '{n}F',
    'label.hiddenStaff': '还有 {n} 位成员',

    // Tower
    'tower.title': '像素办公楼',
    'tower.sub': '{workspaces} 个工作区 · {sessions} 个会话',

    // Floor plan
    'office.sub': '{team} 人团队',

    // Roles and status
    'role.lead': '主会话',
    'role.teammate': '团队成员',
    'role.subagent': '子代理',
    'status.running': '工作中',
    'status.idle': '空闲',
    'status.todos': '待办 {done}/{total}',
    'status.doing': '正在：{work}',

    // Room props
    'room.whiteboard': '待办 {done}/{total}',
    'room.whiteboardEmpty': '暂无待办',
    'room.whiteboardHint': '白板上的团队待办',

    // Empty / loading
    'city.empty.title': '还没有工作区',
    'city.empty.hint': '创建或打开一个会话，它就会出现在这栋楼里。',
    'city.empty.sessionsTitle': '办公室还空着',
    'city.empty.sessionsHint': '工作区都已就位，还没有会话搬进来。',
    'building.empty.title': '这一层还没有办公室',
    'building.empty.hint': '给这个工作区开一个会话，团队就会搬进来。',
    'loading': '正在加载办公室…',
    'loading.hint': '正在读取工作区与会话',

    // Help overlay
    'help.title': '像素办公室使用说明',
    'help.tipsTitle': '小提示',
    'help.tips': '悬停画布上的标签可以展开详情；按 Esc 逐级返回；昼夜模式在顶部和设置里都能切换。画面上有更多楼层时，可以用滚轮、↑↓ 或画布上的像素箭头翻页。',
    'help.view.city.title': '全部视角',
    'help.view.city.text': '一栋办公楼：一层是一个工作区，楼层里的小办公室各是一个会话。亮灯的楼层与窗口表示正在工作，点击楼层进入工作区。',
    'help.view.building.title': '工作区视角',
    'help.view.building.text': '这一层的平面图：每间玻璃办公室是一个会话，里面是主会话的大桌和团队的工位。亮灯或有人打字表示在工作，点击办公室进入房间。',
    'help.view.room.title': '会话视角',
    'help.view.room.text': '一个会话的内部：主会话在右侧老板办公室，团队成员与子代理在开放办公区。点击任意角色，直接打开对应会话。',

    // Footer legend
    'legend.working': '亮 = 工作中',
    'legend.idle': '暗 = 空闲',
    'legend.click.city': '点楼层进入工作区',
    'legend.click.building': '点办公室进入会话',
    'legend.click.room': '点角色打开会话',
    'legend.esc': 'Esc 返回上一层',

    // Canvas accessibility
    'canvas.label': '像素办公室场景',

    // Settings row
    'setting.label': '像素办公室显示',
    'setting.hint': '办公室页面的昼夜模式，与页面顶部开关同步。',
  },
  en: {
    // Panel
    'panel.title': 'Pixel Office',
    'panel.subtitle': 'Workspaces are floors, sessions are offices, teams are the people inside',

    // Breadcrumb / navigation
    'nav.breadcrumb': 'Location',
    'nav.home': 'Office',
    'action.back': 'Back one level',
    'action.help': 'Help',
    'action.close': 'Close',

    // Header status line (city view) — plain host-style text, no pill chips
    'header.stats': 'Workspaces {workspaces} · Sessions {sessions} · Working {running} · Teams {teams}',

    // Day / night switch (three states, shared with the Settings row)
    'display.label': 'Day / night',
    'display.auto': 'Auto',
    'display.day': 'Day',
    'display.night': 'Night',
    'display.autoHint': 'Follow local time: 07:00–19:00 is day',
    'display.dayHint': 'Always daylight',
    'display.nightHint': 'Always night',

    // View names
    'view.city': 'All view',
    'view.building': 'Workspace view',
    'view.room': 'Session view',

    // Workspace / session naming
    'workspace.ungrouped': 'Ungrouped',
    'workspace.untitled': 'Untitled workspace',
    'workspace.sessions': '{n} sessions',
    'workspace.running': '{n} working',
    'workspace.idleAll': 'All idle',
    'workspace.members': '{n} members',
    'session.untitled': 'Untitled session',
    'label.untitledMember': 'Member',

    // Floor signage / overflow chips
    'label.floor': '{n}F',
    'label.hiddenStaff': '{n} more members',

    // Tower
    'tower.title': 'Pixel Office Tower',
    'tower.sub': '{workspaces} workspaces · {sessions} sessions',

    // Floor plan
    'office.sub': '{team}-person team',

    // Roles and status
    'role.lead': 'Lead',
    'role.teammate': 'Teammate',
    'role.subagent': 'Subagent',
    'status.running': 'Working',
    'status.idle': 'Idle',
    'status.todos': 'Todos {done}/{total}',
    'status.doing': 'Now: {work}',

    // Room props
    'room.whiteboard': 'Todos {done}/{total}',
    'room.whiteboardEmpty': 'No todos',
    'room.whiteboardHint': 'The team todo board',

    // Empty / loading
    'city.empty.title': 'No workspaces yet',
    'city.empty.hint': 'Create or open a session and it will show up in this building.',
    'city.empty.sessionsTitle': 'The office is still empty',
    'city.empty.sessionsHint': 'Your workspaces are set up; no sessions have moved in yet.',
    'building.empty.title': 'No offices on this floor yet',
    'building.empty.hint': 'Start a session in this workspace and the team will move in.',
    'loading': 'Loading the office…',
    'loading.hint': 'Reading workspaces and sessions',

    // Help overlay
    'help.title': 'How the pixel office works',
    'help.tipsTitle': 'Tips',
    'help.tips': 'Hover a label on the canvas to expand its details; press Esc to go up one level; switch day/night from the toolbar or Settings. When there are more floors than fit, scroll with the wheel, the ↑↓ keys or the pixel arrows on the canvas.',
    'help.view.city.title': 'All view',
    'help.view.city.text': 'One office tower: every floor is a workspace and the small offices on it are sessions. Lit floors and windows mean work in progress — click a floor to enter that workspace.',
    'help.view.building.title': 'Workspace view',
    'help.view.building.text': 'The floor plan: every glass office is a session, holding the lead\u2019s big desk and the team\u2019s workstations. Lit rooms and typing mean work in progress — click an office to enter the room.',
    'help.view.room.title': 'Session view',
    'help.view.room.text': 'Inside one session: the lead sits in the private office on the right, teammates and subagents work in the open office. Click anyone to open that session.',

    // Footer legend
    'legend.working': 'Lit = working',
    'legend.idle': 'Dim = idle',
    'legend.click.city': 'Click a floor to enter',
    'legend.click.building': 'Click an office to enter',
    'legend.click.room': 'Click a character to open',
    'legend.esc': 'Esc goes up one level',

    // Canvas accessibility
    'canvas.label': 'Pixel office scene',

    // Settings row
    'setting.label': 'Pixel office display',
    'setting.hint': 'Day/night mode for the office page; shared with the switch at the top.',
  },
};

const OFFICE_NS = 'pixel.office';
