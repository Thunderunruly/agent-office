# Changelog

## [0.1.0] - 2026-11-06

First public release.

- One fixed-pixel office tower in the DSH Web UI: every workspace is a floor and every
  session is a glass office on that floor.
- Three views — tower (all workspaces), workspace floor plan (all sessions of a
  workspace), and session room (lead + teammates + subagents) — with breadcrumbs and
  `Esc` navigation.
- Live `sessions.list` / `workspaces.list` subscriptions: running state, titles, team
  size, todo progress and recent work update in place.
- Agent Teams roster via the `agentTeam` projection with a session-graph fallback, and a
  generic staff model ready for Super-agent workers.
- Fixed-pixel world with device-pixel-locked art: resizing the window reveals more or
  less of the office; pixel pager on the elevator shaft for floors that do not fit.
- Day/night with automatic local-time switching plus a manual override in the page and
  in Settings → General.
- Host-native page chrome (real `Button` / `SegmentedControl` / `Modal` / `Tooltip` when
  the host exports them, self-contained fallbacks otherwise).
- No network access, no telemetry, one `localStorage` preference key.
