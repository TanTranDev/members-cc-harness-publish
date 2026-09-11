// migrate.mjs — `cc-harness migrate`: MỘT cửa vào khi bước vào một dự án, đã dùng harness hay chưa.
//
// Nguyên tắc (chốt với user 2026-09-12):
//   · Không có "chế độ": user không biết source đang có gì — lệnh tự nhìn rồi quyết từng việc
//     (tạo · giữ nguyên · bổ sung), in kế hoạch trước, ghi khi có `--yes`.
//   · Mặc định lấy từ `git remote origin`: cc-lock, claim của agent-tasks, board issue đều dùng CHÍNH
//     repo của dự án — user đã chạy thật như vậy và mọi thứ ổn, không cần repo phụ.
//   · agent-tasks chỉ chạy với GitLab ⇒ origin ở GitHub thì `agent_tasks: off` và NÓI RA.
//   · `agent-tasks.config.json` ở ROOT (commit được) VÀ `<git-dir>/agent-tasks.env` cho token — tạo
//     sẵn, nhắc người điền. Token không bao giờ do máy điền.
//   · Không đè thứ đã có: tệp tồn tại ⇒ giữ, chỉ báo. `CLAUDE.md` có sẵn ⇒ THÊM một khối có đánh dấu,
//     không đè. Chạy hai lần ⇒ lần hai không đổi gì (idempotent).
//   · Phỏng vấn (nếu còn thứ máy không suy được) là việc của MAIN agent đang chat với user — skill
//     `cc-harness:migrate` dẫn; lệnh này không hỏi gì, chỉ nói rõ cái gì chưa suy được.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawn } from 'node:child_process';

import { init, buildConfig } from './init.mjs';
import { CONFIG_FILENAME } from './config.mjs';
import { doctor } from './doctor.mjs';

const CLAUDE_BEGIN = '<!-- cc-harness:begin -->';
const CLAUDE_END = '<!-- cc-harness:end -->';

const git = (root, args) => {
  try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return null; }
};

/** URL remote → {host, path, ssh, https, kind}. Nhận cả `git@h:g/p.git`, `ssh://git@h/g/p.git`, `https://h/g/p.git`. */
export function parseRemote(url) {
  if (!url) return null;
  let m = url.match(/^(?:ssh:\/\/)?(?:[\w.-]+@)?([\w.-]+)(?::\d+)?[:/](.+?)(?:\.git)?\/?$/);
  if (/^https?:\/\//.test(url)) m = url.match(/^https?:\/\/(?:[^@/]+@)?([\w.-]+)(?::\d+)?\/(.+?)(?:\.git)?\/?$/);
  if (!m) return null;
  const host = m[1].toLowerCase();
  const p = m[2];
  const kind = host === 'github.com' || host.endsWith('.github.com') ? 'github'
    : host.includes('gitlab') ? 'gitlab' : 'unknown';
  return { host, path: p, ssh: `git@${host}:${p}.git`, https: `https://${host}/${p}`, kind };
}

/** Nhánh chính: refs/remotes/origin/HEAD → main/master có thật → 'main'. */
function defaultBranch(root) {
  const sym = git(root, ['symbolic-ref', '-q', 'refs/remotes/origin/HEAD']);
  if (sym) return sym.replace(/^refs\/remotes\/origin\//, '');
  for (const b of ['main', 'master', 'develop']) {
    if (git(root, ['rev-parse', '--verify', '-q', `refs/remotes/origin/${b}`]) || git(root, ['rev-parse', '--verify', '-q', `refs/heads/${b}`])) return b;
  }
  return 'main';
}

function installedPlugin(name, home) {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(home, '.claude', 'plugins', 'installed_plugins.json'), 'utf8'));
    for (const [k, v] of Object.entries(m.plugins || {})) if (k.split('@')[0] === name) return (Array.isArray(v) ? v[0] : v)?.installPath || null;
  } catch { /* không đọc được ⇒ coi như chưa cài */ }
  return null;
}

function cbmBinary(home) {
  const base = path.join(home, '.local', 'bin', 'codebase-memory-mcp');
  return ['', '.exe'].map((e) => base + e).find((p) => fs.existsSync(p)) || null;
}

/** Nội dung CLAUDE.md sinh cho dự án — NGẮN, trỏ chứ không chép: mỗi dòng ở đây nạp vào MỌI phiên. */
export function claudeBlock({ name, remote, srcDir, gate, integ, branch }) {
  const lines = [
    CLAUDE_BEGIN,
    `# ${name} — ghi chú cho Claude`,
    '',
    'Dự án dùng bộ khung **cc-harness** (plugin, không có tệp nào của khung trong repo). Luật làm việc do plugin bơm',
    'đầu phiên; **đừng chép luật vào đây**. Thứ về dự án nằm ở ba chỗ:',
    '',
    '- `PROJECT.md` — stack thật · lệnh dev/test · bản đồ tầng ↔ thư mục · quy ước tên · nợ kiến trúc. **Đọc trước khi đụng code.**',
    `- \`${CONFIG_FILENAME}\` — \`gate.commands\` · \`src_dir\` · tích hợp · policy (máy đọc).`,
    '- Mục §1 của bộ luật (`cc-harness rules §1`) — contract bất biến của dự án; đụng là DỪNG hỏi.',
    '',
    '## Lệnh của dự án',
    '',
    '```bash',
    ...(gate.length ? gate.map((c) => `${c}`) : ['# gate.commands chưa khai — điền trong ' + CONFIG_FILENAME]),
    'cc-harness gate --out docs/wip/<lô>/verify.md   # chạy toàn bộ gate.commands, ghi ledger',
    'cc-harness doctor                              # kiểm setup · tích hợp',
    '```',
    '',
    '## Điều phối nhiều phiên',
    '',
    `- Remote: \`${remote ? remote.https : '(chưa có origin)'}\` · nhánh chính \`${branch}\`.`,
    `- cc-lock: ${integ.cc_lock === 'off' ? 'tắt' : `khoá tệp qua \`refs/locks\` trên chính repo này (\`cc-lock.config.json\`)`}.`,
    `- agent-tasks: ${integ.agent_tasks === 'off' ? 'tắt' + (remote?.kind === 'github' ? ' — origin là GitHub, agent-tasks chỉ chạy với GitLab' : '') : `board = Issues của chính repo này, claim qua \`refs/claims\` (\`agent-tasks.config.json\`; token ở \`.git/agent-tasks.env\`)`}.`,
    `- codebase-memory: ${integ.cbm === 'off' ? 'tắt' : 'bộ khung tự index nền; tra symbol/caller bằng graph trước khi grep'}.`,
    srcDir ? `- Code production dưới \`${srcDir}/\`; sửa ở đó cần task đã claim (khi agent-tasks bật).` : '- `project.src_dir` chưa khai — cổng claim-task chưa biết đâu là code.',
    '',
    '## Việc riêng của dự án muốn nói với Claude',
    '',
    '_(điền tay: bẫy của stack · thứ tuyệt đối không được đổi · người phụ trách tích hợp)_',
    CLAUDE_END,
    '',
  ];
  return lines.join('\n');
}

/**
 * @param {{root:string, pluginRoot?:string, write?:boolean, home?:string, env?:object}} o
 * @returns {{lines:string[], code:number, plan:object[]}}
 */
export function migrate({ root, pluginRoot, write = false, home = os.homedir(), env = process.env }) {
  const lines = [];
  const plan = [];   // {action: 'tạo'|'giữ'|'bổ sung'|'bỏ qua', target, why}
  const say = (s) => lines.push(s);
  const act = (action, target, why) => plan.push({ action, target, why });
  const wr = (p, body, mode) => { if (!write) return; fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); if (mode) fs.chmodSync(p, mode); };

  // ── 0. Repo & remote ─────────────────────────────────────────────────────────
  const top = git(root, ['rev-parse', '--show-toplevel']);
  if (!top) { say(`✖ ${root} không phải git repo — migrate cần \`git remote origin\` để suy mặc định. Chạy từ trong repo.`); return { lines, code: 2, plan }; }
  if (path.resolve(top) !== path.resolve(root)) say(`⚠ root dự án ${root} ≠ toplevel git ${top} — dùng toplevel.`);
  root = path.resolve(top);
  const gitDir = (() => { const g = git(root, ['rev-parse', '--git-dir']); return g ? path.resolve(root, g) : null; })();
  const originUrl = git(root, ['remote', 'get-url', 'origin']);
  const remote = parseRemote(originUrl);
  const branch = defaultBranch(root);
  say(`cc-harness migrate — ${root}${write ? '' : '  (XEM TRƯỚC — thêm --yes để ghi)'}`);
  say(`  origin : ${originUrl || '(KHÔNG có — cc-lock/agent-tasks không suy được repo mặc định)'}${remote ? `  · host=${remote.host} (${remote.kind}) · nhánh chính=${branch}` : ''}`);

  // Tích hợp: mặc định suy từ máy + remote. Chỉ áp vào config MỚI SINH; config có sẵn thì giữ và gợi ý.
  const cbm = cbmBinary(home);
  const ccLockPlugin = installedPlugin('cc-lock', home);
  const tasksPlugin = installedPlugin('agent-tasks', home);
  const integ = {
    cc_lock: remote ? 'required' : 'off',
    cbm: cbm ? 'required' : 'optional',
    rtk: 'optional',
    agent_tasks: !remote ? 'off' : remote.kind === 'github' ? 'off' : 'required',
  };
  const integWhy = {
    cc_lock: remote ? 'có origin ⇒ khoá tệp trên chính repo' : 'không có origin',
    cbm: cbm ? 'binary có trên máy ⇒ graph trước, grep sau' : 'chưa cài codebase-memory-mcp',
    agent_tasks: !remote ? 'không có origin' : remote.kind === 'github' ? 'origin là GitHub — agent-tasks chỉ chạy với GitLab (Issues API)' : remote.kind === 'gitlab' ? 'origin là GitLab' : `host ${remote.host} không phải GitHub — GIẢ ĐỊNH GitLab tự host; sai thì đổi off`,
  };

  // ── 1. Khung harness: claude_config.json · PROJECT.md · gitignore · quyền ─────
  const cfgPath = path.join(root, CONFIG_FILENAME);
  const hadConfig = fs.existsSync(cfgPath);
  const r = init({ root, write });
  for (const l of r.lines.slice(1)) say(`  ${l.replace(/^\n/, '')}`);
  if (r.fail) { say('✖ init thất bại — sửa lỗi trên rồi chạy lại.'); return { lines, code: 1, plan }; }
  let cfg = null;
  try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch { /* xem trước: chưa có tệp */ }
  if (!hadConfig) {
    act('tạo', CONFIG_FILENAME, `integrations: ${Object.entries(integ).map(([k, v]) => `${k}=${v}`).join(' · ')}`);
    if (write && cfg) { cfg.integrations = { ...(cfg.integrations || {}), ...integ }; fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n'); }
    for (const [k, v] of Object.entries(integWhy)) say(`  · integrations.${k} = ${integ[k]} — ${v}`);
  } else {
    act('giữ', CONFIG_FILENAME, 'đã có — không đổi integrations của dự án');
    const cur = cfg?.integrations || {};
    for (const k of ['cc_lock', 'cbm', 'agent_tasks']) {
      if ((cur[k] ?? 'optional') !== integ[k]) say(`  · gợi ý: integrations.${k} đang "${cur[k] ?? '(mặc định)'}", máy suy "${integ[k]}" (${integWhy[k]}) — đổi nếu đúng ý`);
    }
  }
  const srcDir = String(cfg?.project?.src_dir || '').replace(/^\.\/+/, '').replace(/\/+$/, '');
  const gate = Array.isArray(cfg?.gate?.commands) ? cfg.gate.commands : [];
  const name = cfg?.project?.name || path.basename(root);
  const effInteg = hadConfig ? { ...integ, ...(cfg?.integrations || {}) } : integ;

  // ── 2. CLAUDE.md của dự án — tạo, hoặc THÊM khối có đánh dấu ─────────────────
  const claudePath = path.join(root, 'CLAUDE.md');
  const block = claudeBlock({ name, remote, srcDir, gate, integ: effInteg, branch });
  if (!fs.existsSync(claudePath)) {
    act('tạo', 'CLAUDE.md', 'bản ngắn: trỏ PROJECT.md/config/§1 · lệnh · điều phối nhiều phiên');
    wr(claudePath, block);
  } else {
    const cur = fs.readFileSync(claudePath, 'utf8');
    if (cur.includes(CLAUDE_BEGIN)) act('giữ', 'CLAUDE.md', 'đã có khối cc-harness — không đụng (sửa tay nếu muốn làm mới)');
    else { act('bổ sung', 'CLAUDE.md', 'thêm khối cc-harness ở cuối, giữ nguyên nội dung cũ'); wr(claudePath, `${cur.replace(/\s*$/, '')}\n\n${block}`); }
  }

  // ── 3. cc-lock.config.json ở root — lockRepoUrl = chính origin ───────────────
  if (effInteg.cc_lock !== 'off' && remote) {
    const p = path.join(root, 'cc-lock.config.json');
    if (fs.existsSync(p)) act('giữ', 'cc-lock.config.json', 'đã có');
    else {
      act('tạo', 'cc-lock.config.json', `lockRepoUrl=${remote.ssh} · projectKey=auto · mainlineRef=origin/${branch}`);
      // Cùng hình dạng với scripts/cc-lock-setup.mjs của plugin cc-lock 0.3.x (TEMPLATE) — file tự tài liệu hoá.
      wr(p, JSON.stringify({
        enabled: true, lockRepoUrl: remote.ssh, projectKey: 'auto', refNamespace: 'refs/locks',
        ttlSec: 900, heartbeatSec: 300, skewSec: 60, waitPollSec: 5, offlinePolicy: 'fail-closed',
        guardedTools: ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'], mainlineRef: `origin/${branch}`,
        freshnessMode: 'deny', fetchThrottleSec: 60,
      }, null, 2) + '\n');
    }
    if (!ccLockPlugin) say('  ⚠ plugin cc-lock CHƯA cài trên máy này — config vẫn đúng cho người khác; cài: claude plugin install cc-lock@members-cc-lock');
  } else act('bỏ qua', 'cc-lock.config.json', effInteg.cc_lock === 'off' ? 'cc_lock=off' : 'không có origin');

  // ── 4. agent-tasks: config ở root (commit) + env ở <git-dir> (token) ─────────
  if (effInteg.agent_tasks !== 'off' && remote) {
    const p = path.join(root, 'agent-tasks.config.json');
    if (fs.existsSync(p)) act('giữ', 'agent-tasks.config.json', 'đã có');
    else {
      act('tạo', 'agent-tasks.config.json', `boardUrl=${remote.https} · claimRepoUrl=${remote.ssh}`);
      // Cùng hình dạng với `tasks-cli init` của agent-tasks 0.3 (_doc · boardUrl · claimRepoUrl · ttlSec · heartbeatSec).
      wr(p, JSON.stringify({
        _doc: [
          'agent-tasks — cấu hình CỦA DỰ ÁN, commit file này. KHÔNG bao giờ để token ở đây.',
          'boardUrl: project GitLab chứa ISSUE BOARD — mặc định là chính repo này (cc-harness migrate).',
          'claimRepoUrl: repo git giữ khoá claim (SSH) — mặc định là chính repo này.',
          'Token: <git-dir>/agent-tasks.env (đã tạo sẵn, điền GITLAB_TOKEN) hoặc ~/.agent-tasks/.env.',
          'Kiểm: tasks-cli verify · tạo nhãn: tasks-cli labels --apply · dựng board: tasks-cli board --apply',
        ],
        boardUrl: remote.https, claimRepoUrl: remote.ssh, ttlSec: 1800, heartbeatSec: 600,
      }, null, 2) + '\n');
    }
    if (gitDir) {
      const e = path.join(gitDir, 'agent-tasks.env');
      const machineEnv = path.join(home, '.agent-tasks', '.env');
      const hasMachineToken = fs.existsSync(machineEnv) && /^\s*GITLAB_TOKEN\s*=\s*\S+/m.test(fs.readFileSync(machineEnv, 'utf8'));
      if (fs.existsSync(e)) {
        const filled = /^\s*GITLAB_TOKEN\s*=\s*\S+/m.test(fs.readFileSync(e, 'utf8'));
        act('giữ', '.git/agent-tasks.env', filled ? 'đã có token' : 'đã có nhưng GITLAB_TOKEN còn TRỐNG — điền vào');
      } else {
        act('tạo', '.git/agent-tasks.env', 'quyền 600, GITLAB_TOKEN trống — NGƯỜI điền');
        wr(e, [
          '# agent-tasks — token của RIÊNG clone này (không bao giờ commit; nằm trong .git/ nên git không thấy).',
          '# Group/Project Access Token scope `api` trên GitLab. Điền rồi chạy: tasks-cli verify.',
          '# Để trống nếu máy đã có ~/.agent-tasks/.env (token dùng chung mọi dự án).',
          'GITLAB_TOKEN=',
          '',
        ].join('\n'), 0o600);
      }
      say(`  ${hasMachineToken ? '· token cấp máy đã có ở ~/.agent-tasks/.env' : '⚠ CHƯA có token: điền GITLAB_TOKEN vào .git/agent-tasks.env (hoặc ~/.agent-tasks/.env) — agent-tasks trơ tới khi có'}`);
    } else say('  ⚠ không xác định được thư mục .git ⇒ không tạo được agent-tasks.env');
    if (!tasksPlugin) say('  ⚠ plugin agent-tasks CHƯA cài trên máy này — cài: claude plugin install agent-tasks');
  } else act('bỏ qua', 'agent-tasks.config.json + .git/agent-tasks.env', integWhy.agent_tasks);

  // ── 5. codebase-memory: index nền ngay ───────────────────────────────────────
  if (cbm && effInteg.cbm !== 'off') {
    act(write ? 'chạy' : 'sẽ chạy', 'index_repository (nền)', `project "${root.replace(/^\//, '').replace(/\//g, '-')}"`);
    if (write) { try { spawn(cbm, ['cli', 'index_repository', '--repo-path', root], { detached: true, stdio: 'ignore' }).unref(); } catch { /* tiện ích */ } }
  }

  // ── Kế hoạch ─────────────────────────────────────────────────────────────────
  say('');
  say(write ? 'Đã làm:' : 'Kế hoạch (chưa ghi gì):');
  const w = Math.max(...plan.map((p) => p.target.length));
  for (const p of plan) say(`  ${p.action.padEnd(7)} ${p.target.padEnd(w)}  ${p.why}`);

  // ── 6. Xác minh sau khi ghi ──────────────────────────────────────────────────
  if (write) {
    say('');
    const d = doctor({ root, pluginRoot, home, env });
    const warns = d.lines.filter((l) => /⚠|✖/.test(l));
    say(`doctor: ${d.fail ? '✖ FAIL' : warns.length ? `✔ OK, ${warns.length} cảnh báo` : '✔ OK'}`);
    for (const l of warns.slice(0, 8)) say(`  ${l.trim()}`);
    const run = (label, cmd, args) => {
      try {
        const out = execFileSync(cmd, args, { cwd: root, encoding: 'utf8', timeout: 25000, stdio: ['ignore', 'pipe', 'pipe'] });
        say(`${label}: ${out.trim().split('\n').slice(-3).join(' | ').slice(0, 300)}`);
      } catch (e) { say(`${label}: ⚠ ${(e.stdout || e.stderr || e.message || '').toString().trim().split('\n').slice(-2).join(' | ').slice(0, 300)}`); }
    };
    if (effInteg.cc_lock !== 'off' && ccLockPlugin) run('cc-lock status', process.execPath, [path.join(ccLockPlugin, 'bin', 'cc-lock'), 'status']);
    if (effInteg.agent_tasks !== 'off' && tasksPlugin) run('tasks-cli verify', process.execPath, [path.join(tasksPlugin, 'bin', 'tasks-cli.mjs'), 'verify']);
    say('');
    say('Việc của NGƯỜI còn lại:');
    if (effInteg.agent_tasks !== 'off') say('  1. Điền GITLAB_TOKEN vào .git/agent-tasks.env (nếu chưa có token cấp máy), rồi `tasks-cli verify` → `labels --apply` → `board --apply`.');
    say(`  ${effInteg.agent_tasks !== 'off' ? 2 : 1}. Điền PROJECT.md (mục "(chưa khai)") — agent chính đọc source rồi điền, hỏi bạn thứ không suy được.`);
    say(`  ${effInteg.agent_tasks !== 'off' ? 3 : 2}. Commit: ${[CONFIG_FILENAME, 'PROJECT.md', 'CLAUDE.md', '.claude/settings.json', '.gitignore', effInteg.cc_lock !== 'off' ? 'cc-lock.config.json' : null, effInteg.agent_tasks !== 'off' ? 'agent-tasks.config.json' : null].filter(Boolean).join(' · ')}`);
  } else {
    say('');
    say('Ghi thật: cc-harness migrate --yes');
  }
  return { lines, code: 0, plan };
}
