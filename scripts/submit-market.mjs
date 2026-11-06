#!/usr/bin/env node
/**
 * Submit this repository to the DSH plugin-market catalog.
 *
 *   node scripts/submit-market.mjs            # submit (or report already listed / PR open)
 *   node scripts/submit-market.mjs --dry-run  # print the entry and the plan only
 *
 * The catalog is the `awesome-dsh-plugin` repository: one YAML file per plugin under
 * `data/plugins/<owner>__<repo>.yml`, listed with a pull request. This script adds the
 * entry on a branch of your personal fork and opens the PR with the GitHub CLI.
 *
 * It is idempotent and safe to run from a scheduled task:
 *   - repo younger than 1 day -> exits 2 (the catalog gate rejects younger repos);
 *   - entry already upstream -> exits 0 ("already listed");
 *   - PR already open        -> exits 0 with the PR URL.
 *
 * Requires: git + an authenticated `gh` (the same account that owns the repo).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const OWNER = 'Thunderunruly';
const REPO = 'agent-office';
const UPSTREAM = 'awesome-dsh-plugin/awesome-dsh-plugin';
const FORK = 'Thunderunruly/awesome-dsh-plugin';
const ENTRY_PATH = `data/plugins/${OWNER}__${REPO}.yml`;
const BRANCH = `add-${OWNER.toLowerCase()}-${REPO}`;
const MIN_AGE_MS = 25 * 60 * 60 * 1000; // 1 day, with a small safety margin
const DRY_RUN = process.argv.includes('--dry-run');

const ENTRY = `url: https://github.com/${OWNER}/${REPO}
name: ${OWNER}/${REPO}
category: ui
description:
  en: 'A fixed-pixel office tower for DeepSeek Harness: every workspace is a floor and every session an office inside it. Lit windows mean work in progress, and clicking a floor or a person takes you straight to that session.'
  zh: '把 DeepSeek Harness 的所有会话画成一栋固定像素的办公楼：一层是一个工作区，一层里的每间办公室是一个会话；亮灯表示正在工作，点击楼层或角色可直接回到对应会话。'
`;

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

function ghJson(args) {
  const out = run('gh', args);
  return out.trim() ? JSON.parse(out) : null;
}

function log(message) {
  console.log(`[market] ${message}`);
}

if (DRY_RUN) {
  log(`dry run — would open a PR against ${UPSTREAM}`);
  log(`branch: ${FORK.split('/')[0]}:${BRANCH}, file: ${ENTRY_PATH}`);
  console.log(`\n${ENTRY}`);
  process.exit(0);
}

// 1. Repo age gate (the catalog CI rejects repos younger than one day).
const info = ghJson(['api', `repos/${OWNER}/${REPO}`, '--jq', '{created_at: .created_at, visibility: .visibility}']);
if (!info) {
  log(`cannot read repos/${OWNER}/${REPO} with gh; log in with "gh auth login"`);
  process.exit(1);
}
if (info.visibility !== 'public') {
  log(`repo ${OWNER}/${REPO} is ${info.visibility}; the catalog only accepts public repositories`);
  process.exit(1);
}
const age = Date.now() - Date.parse(info.created_at);
if (age < MIN_AGE_MS) {
  const ready = new Date(Date.parse(info.created_at) + MIN_AGE_MS).toISOString();
  log(`repo is ${Math.round(age / 3600000)}h old; the catalog needs >= 1 day. Retry after ${ready}.`);
  process.exit(2);
}

// 2. Already listed upstream?
let listed = true;
try {
  run('gh', ['api', `repos/${UPSTREAM}/contents/${ENTRY_PATH}`]);
} catch (error) {
  listed = false;
}
if (listed) {
  log(`already listed: https://github.com/${UPSTREAM}/blob/main/${ENTRY_PATH}`);
  process.exit(0);
}

// 3. Already an open PR from our branch?
const openPrs = ghJson([
  'pr', 'list', '--repo', UPSTREAM,
  '--head', `${OWNER}:${BRANCH}`, '--state', 'open',
  '--json', 'url,number',
]) || [];
if (openPrs.length > 0) {
  log(`PR already open: ${openPrs[0].url}`);
  process.exit(0);
}

// 4. Sync the fork with upstream, add the entry on a branch, push it.
try {
  log('syncing fork with upstream main…');
  run('gh', ['repo', 'sync', FORK, '--source', UPSTREAM, '--branch', 'main']);
} catch (error) {
  log(`fork sync failed (continuing): ${(error.stderr || error.message).toString().trim().split('\n')[0]}`);
}

const workDir = mkdtempSync(join(tmpdir(), 'dsh-market-pr-'));
try {
  log('cloning fork…');
  run('git', ['clone', '--depth', '1', `https://github.com/${FORK}.git`, workDir], { inherit: true });
  run('git', ['checkout', '-B', BRANCH], { cwd: workDir });
  const entryFile = join(workDir, ENTRY_PATH);
  mkdirSync(dirname(entryFile), { recursive: true });
  writeFileSync(entryFile, ENTRY, 'utf8');
  run('git', ['add', ENTRY_PATH], { cwd: workDir });
  run('git', ['-c', `user.name=${OWNER}`, '-c', `user.email=${OWNER}@users.noreply.github.com`,
    'commit', '-m', `Add ${OWNER}/${REPO}`, '-m', 'Fixed-pixel office tower for DeepSeek Harness sessions.'], { cwd: workDir });
  log('pushing branch…');
  run('git', ['push', '-u', 'origin', BRANCH, '--force'], { cwd: workDir, inherit: true });
  const prUrl = run('gh', [
    'pr', 'create', '--repo', UPSTREAM,
    '--head', `${OWNER}:${BRANCH}`,
    '--title', `Add ${OWNER}/${REPO}`,
    '--body', [
      `Adds **${OWNER}/${REPO}** to the catalog.`,
      '',
      '- Fixed-pixel office tower for DSH: workspaces are floors, sessions are offices, teams are the people inside.',
      '- Declares `dsh.bundle` in `package.json` and ships a ready `client.js` — installable straight from this repository, no build step.',
      '- Category `ui` (a visual panel added to the Web UI).',
      '',
      `Repository: https://github.com/${OWNER}/${REPO}`,
    ].join('\n'),
  ]).trim();
  log(`opened PR: ${prUrl}`);
  console.log(prUrl);
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
