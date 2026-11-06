// ===== model.js =====
// Live Session/Workspace snapshot -> office model (buildings -> floors -> staff).
// Pure functions only; the React subscription lives in useOfficeModel at the bottom.
// Everything must stay defensive: a missing field is normal, never an exception.

const OFFICE_WORK_PROJECTION = 'sessionKanban';
const OFFICE_TEAM_PROJECTION = 'agentTeam';
const OFFICE_MAX_STAFF = 6;
const OFFICE_ACCENT_COUNT = 8;

/** FNV-1a: stable accent/seed per workspace or session. */
function officeHash(text) {
  const value = String(text == null ? '' : text);
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function officeAccentSeed(text) {
  return (officeHash(text) % OFFICE_ACCENT_COUNT) + 1;
}

function officeBaseName(path) {
  const text = String(path == null ? '' : path).replace(/[\\/]+$/, '');
  const parts = text.split(/[\\/]/);
  return parts.length ? parts[parts.length - 1] : '';
}

function officeClipText(text, max) {
  const clean = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(1, max - 1))}…`;
}

function officeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/** One session's compact work facts from the registered `sessionKanban` projection. */
function officeWorkOf(entry) {
  const values = entry && entry.projectionValues;
  const work = values && values[OFFICE_WORK_PROJECTION];
  if (!work || typeof work !== 'object') {
    return { request: '', reply: '', currentWork: '', todos: { done: 0, total: 0 } };
  }
  const done = officeNumber(work.done, 0);
  const total = officeNumber(work.total, 0);
  const request = typeof work.request === 'string' ? work.request : '';
  const reply = typeof work.reply === 'string' ? work.reply : '';
  return {
    request,
    reply,
    currentWork: officeClipText(reply || request, 120),
    todos: { done: Math.max(0, done), total: Math.max(0, total) },
  };
}

/** Agent Team roster for the leader entry, or null when this entry is not a team leader. */
function officeTeamOf(entry) {
  const values = entry && entry.projectionValues;
  const team = values && values[OFFICE_TEAM_PROJECTION];
  if (!team || !Array.isArray(team.members)) return null;
  const members = [];
  for (const member of team.members) {
    if (!member || typeof member.id !== 'string' || !member.id) continue;
    members.push({
      id: member.id,
      name: typeof member.name === 'string' && member.name ? member.name : '',
      role: member.role === 'lead' ? 'lead' : 'teammate',
    });
  }
  if (members.length === 0) return null;
  const lead = members.find((member) => member.role === 'lead');
  if (!lead || lead.id !== entry.id) return null;
  return { leadId: lead.id, members };
}

function officeSessionTitle(entry) {
  if (!entry) return '';
  const title = typeof entry.title === 'string' ? entry.title.trim() : '';
  if (title) return title;
  const display = typeof entry.displayTitle === 'string' ? entry.displayTitle.trim() : '';
  if (display && display !== entry.id) return display;
  return '';
}

/** One worker row (teammate or subagent session) for a floor's open-office desks. */
function officeWorkerOf(source, role, sessions) {
  const live = source.sessionId ? sessions.get(source.sessionId) : null;
  const title = officeSessionTitle(live) || source.name || '';
  return {
    sessionId: source.sessionId,
    name: officeClipText(source.name || title || '', 18),
    title: officeClipText(title, 24),
    role,
    running: live ? live.running : false,
    currentWork: live ? live.work.currentWork : '',
    todos: live ? live.work.todos : { done: 0, total: 0 },
    depth: role === 'teammate' ? 1 : 1,
    updatedAt: live ? live.updatedAt : 0,
  };
}

/** Fold one top-level session into a floor (the session is the boss; the rest are staff). */
function officeFloorOf(session, sessions, children) {
  const team = session.team;
  const workers = [];
  const seen = new Set([session.id]);
  let bossName = '';
  if (team) {
    for (const member of team.members) {
      if (member.id === session.id) {
        bossName = member.name || '';
        continue;
      }
      if (seen.has(member.id)) continue;
      seen.add(member.id);
      workers.push(officeWorkerOf({ sessionId: member.id, name: member.name }, 'teammate', sessions));
    }
  }
  for (const child of children.get(session.id) || []) {
    if (seen.has(child.id)) continue;
    if (child.origin === 'fork') continue;
    seen.add(child.id);
    workers.push(officeWorkerOf({ sessionId: child.id, name: '' }, 'subagent', sessions));
  }
  const roleRank = (worker) => (worker.role === 'teammate' ? 0 : 1);
  workers.sort((left, right) => (
    Number(right.running) - Number(left.running)
    || roleRank(left) - roleRank(right)
    || right.updatedAt - left.updatedAt
  ));
  return {
    sessionId: session.id,
    title: officeClipText(officeSessionTitle(session) || bossName || '', 64),
    bossName: officeClipText(bossName || officeSessionTitle(session) || '', 18),
    running: session.running,
    updatedAt: session.updatedAt,
    isBoss: true,
    currentWork: session.work.currentWork,
    todos: session.work.todos,
    workers,
    teamSize: workers.length + 1,
    accentSeed: officeAccentSeed(session.id),
  };
}

function officeBuildingOf(workspace, floors) {
  let runningCount = 0;
  let memberCount = 0;
  let updatedAt = 0;
  for (const floor of floors) {
    if (floor.running) runningCount += 1;
    memberCount += floor.workers.length;
    if (floor.updatedAt > updatedAt) updatedAt = floor.updatedAt;
  }
  const title = typeof workspace.title === 'string' ? workspace.title.trim() : '';
  const path = typeof workspace.path === 'string' ? workspace.path : '';
  return {
    workspaceId: workspace.workspaceId,
    ungrouped: workspace.ungrouped === true,
    title: title || officeBaseName(path) || '',
    path,
    sessionCount: floors.length,
    runningCount,
    memberCount,
    floors,
    updatedAt,
    accentSeed: officeAccentSeed(workspace.workspaceId || 'ungrouped'),
  };
}

/**
 * Build the whole office once per snapshot change.
 * Sessions without a workspace (or without a parent) land in the virtual "ungrouped" building.
 */
function buildOfficeModel(sessionSnapshot, workspaceSnapshot) {
  const sessionValues = sessionSnapshot && typeof sessionSnapshot === 'object' ? sessionSnapshot : {};
  const workspaceValues = workspaceSnapshot && typeof workspaceSnapshot === 'object' ? workspaceSnapshot : {};
  const byId = sessionValues.byId && typeof sessionValues.byId === 'object' ? sessionValues.byId : {};
  const ids = Array.isArray(sessionValues.ids) ? sessionValues.ids : Object.keys(byId);
  const archived = new Set(
    Array.isArray(workspaceValues.archivedSessionIds) ? workspaceValues.archivedSessionIds : [],
  );

  const sessions = new Map();
  for (const id of ids) {
    const entry = byId[id];
    if (!entry || typeof entry !== 'object') continue;
    if (archived.has(id)) continue;
    sessions.set(id, {
      id,
      title: officeSessionTitle(entry),
      running: entry.running === true,
      updatedAt: officeNumber(entry.updatedAt, 0),
      parentId: typeof entry.parentId === 'string' ? entry.parentId : '',
      origin: typeof entry.origin === 'string' ? entry.origin : '',
      work: officeWorkOf(entry),
      team: officeTeamOf(entry),
    });
  }

  const children = new Map();
  for (const session of sessions.values()) {
    if (!session.parentId) continue;
    const list = children.get(session.parentId);
    if (list) list.push(session);
    else children.set(session.parentId, [session]);
  }

  const workspaceItems = Array.isArray(workspaceValues.items)
    ? workspaceValues.items.filter((item) => item && typeof item.workspaceId === 'string' && item.workspaceId)
    : [];
  const assigned = new Set();
  const buildings = [];
  for (const workspace of workspaceItems) {
    const sessionIds = Array.isArray(workspace.sessionIds) ? workspace.sessionIds : [];
    const floors = [];
    for (const id of sessionIds) {
      const session = sessions.get(id);
      if (!session) continue;
      assigned.add(id);
      floors.push(officeFloorOf(session, sessions, children));
    }
    buildings.push(officeBuildingOf(workspace, floors));
  }

  const ungroupedFloors = [];
  for (const session of sessions.values()) {
    if (assigned.has(session.id)) continue;
    // Children live inside their leading session's floor; only roots become floors.
    if (session.parentId) continue;
    assigned.add(session.id);
    ungroupedFloors.push(officeFloorOf(session, sessions, children));
  }
  if (ungroupedFloors.length > 0) {
    buildings.push(officeBuildingOf({ workspaceId: 'ungrouped', ungrouped: true }, ungroupedFloors));
  }

  let totalSessions = 0;
  let totalRunning = 0;
  let totalTeams = 0;
  let totalMembers = 0;
  for (const building of buildings) {
    totalSessions += building.sessionCount;
    totalRunning += building.runningCount;
    totalMembers += building.memberCount;
    for (const floor of building.floors) {
      if (floor.teamSize > 1) totalTeams += 1;
    }
  }

  return {
    phase: sessionValues.phase === 'ready' ? 'ready' : 'pending',
    buildings,
    totals: {
      workspaces: buildings.filter((building) => !building.ungrouped).length,
      sessions: totalSessions,
      running: totalRunning,
      teams: totalTeams,
      members: totalMembers,
    },
    timestamp: Date.now(),
  };
}

function selectCity(model) {
  const safe = model || { buildings: [], totals: {} };
  return {
    buildings: safe.buildings,
    totals: safe.totals,
  };
}

function selectBuilding(model, workspaceId) {
  if (!model || !Array.isArray(model.buildings) || !workspaceId) return null;
  return model.buildings.find((building) => building.workspaceId === workspaceId) || null;
}

function officeRoomOf(building, floor) {
  const staff = floor.workers.slice(0, OFFICE_MAX_STAFF);
  const boss = {
    sessionId: floor.sessionId,
    name: floor.bossName || floor.title,
    title: floor.title,
    role: 'lead',
    running: floor.running,
    currentWork: floor.currentWork,
    todos: floor.todos,
    depth: 0,
    updatedAt: floor.updatedAt,
  };
  return {
    sessionId: floor.sessionId,
    title: floor.title,
    running: floor.running,
    updatedAt: floor.updatedAt,
    workspaceId: building.workspaceId,
    workspaceTitle: building.title,
    ungrouped: building.ungrouped === true,
    boss,
    staff,
    todos: floor.todos,
    currentWork: floor.currentWork,
    teamSize: floor.teamSize,
    hiddenStaff: Math.max(0, floor.workers.length - staff.length),
    accentSeed: floor.accentSeed,
  };
}

function selectRoom(model, sessionId) {
  if (!model || !Array.isArray(model.buildings) || !sessionId) return null;
  for (const building of model.buildings) {
    for (const floor of building.floors) {
      if (floor.sessionId === sessionId) return officeRoomOf(building, floor);
    }
  }
  return null;
}

/** React hook: subscribe to the two live snapshots and fold them into one model. */
function useOfficeModel(ctx) {
  const sessions = ctx && ctx.sessions;
  const workspaces = ctx && ctx.workspaces;
  const subscribeSessions = useCallback(
    (notify) => (sessions && sessions.list ? sessions.list.subscribe(notify) : () => {}),
    [sessions],
  );
  const sessionsSnapshot = useCallback(
    () => (sessions && sessions.list ? sessions.list.getSnapshot() : null),
    [sessions],
  );
  const sessionValues = useSyncExternalStore(subscribeSessions, sessionsSnapshot, sessionsSnapshot);

  const subscribeWorkspaces = useCallback(
    (notify) => (workspaces && workspaces.list ? workspaces.list.subscribe(notify) : () => {}),
    [workspaces],
  );
  const workspacesSnapshot = useCallback(
    () => (workspaces && workspaces.list ? workspaces.list.getSnapshot() : null),
    [workspaces],
  );
  const workspaceValues = useSyncExternalStore(subscribeWorkspaces, workspacesSnapshot, workspacesSnapshot);

  const model = useMemo(
    () => buildOfficeModel(sessionValues, workspaceValues),
    [sessionValues, workspaceValues],
  );
  return { model, phase: model.phase };
}
