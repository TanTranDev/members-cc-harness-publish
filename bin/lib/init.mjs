// init.mjs — sinh `claude_config.json` cho một dự án, và mở đường cho lệnh `cc-harness`.
//
// HAI VIỆC, tách bạch có chủ đích:
//   1. claude_config.json — cấu hình CỦA DỰ ÁN. Đã có ⇒ KHÔNG ĐÈ, chỉ in đề xuất. File này người
//      ta sửa tay và nhớ trong đầu; ghi đè nó là cách nhanh nhất để mất một buổi chiều.
//   2. .claude/settings.json — MERGE thêm allowlist cho `cc-harness`. Plugin KHÔNG ship được
//      `permissions` (ràng buộc của Claude Code), nên không có bước này thì mọi lệnh gate đều bị
//      hỏi quyền — đã gặp thật trong một phiên `claude -p`: `cc-harness rules --diff` bị chặn.
//      Merge chứ không ghi đè: settings.json là của dự án, có thể đã có hooks/permissions khác.
import fs from 'node:fs';
import path from 'node:path';

import { CONFIG_FILENAME } from './config.mjs';

/** Quyền tối thiểu để bộ khung chạy được. Hẹp nhất có thể mà vẫn đủ dùng. */
export const REQUIRED_PERMISSIONS = ['Bash(cc-harness:*)'];

/** Đọc JSON, phân biệt "không có" với "hỏng" — hai thứ này dẫn tới hai hành động khác nhau. */
function readJson(p) {
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch (e) {
    return e && e.code === 'ENOENT' ? { missing: true } : { error: `không đọc được (${(e && e.code) || e})` };
  }
  try {
    return { value: JSON.parse(raw) };
  } catch (e) {
    return { error: `JSON hỏng: ${e.message}` };
  }
}

/**
 * Dò dự án để ĐỀ XUẤT giá trị — không đoán bừa. Không dò được thì để giá trị rỗng và nói ra,
 * vì một `gate.commands` bịa ra sẽ chạy lệnh không tồn tại rồi báo gate đỏ mãi.
 */
/**
 * Manifest nào ứng với stack nào. Dò để ĐỀ XUẤT lệnh gate, KHÔNG để kết luận về stack — kết luận
 * đó là việc của `PROJECT.md`, do người khai. Bảng này cố ý nông: một repo có `package.json` chưa
 * chắc là dự án JS (có thể chỉ là tooling), nên nó chỉ gợi ý rồi để người sửa.
 */
const STACK_HINTS = [
  { file: 'go.mod', stack: 'Go', gate: ['go vet ./...', 'go test ./...'] },
  { file: 'Cargo.toml', stack: 'Rust', gate: ['cargo clippy', 'cargo test'] },
  { file: 'pyproject.toml', stack: 'Python', gate: ['ruff check .', 'pytest -q'] },
  { file: 'requirements.txt', stack: 'Python', gate: ['pytest -q'] },
  { file: 'pom.xml', stack: 'Java (Maven)', gate: ['mvn -q verify'] },
  { file: 'build.gradle.kts', stack: 'Kotlin/Java (Gradle)', gate: ['./gradlew check'] },
  { file: 'composer.json', stack: 'PHP', gate: ['composer test'] },
  { file: 'Gemfile', stack: 'Ruby', gate: ['bundle exec rspec'] },
];

export function detectProject(root) {
  const out = { name: path.basename(root), src_dir: null, aliases: {}, gate: [], stack: null, notes: [] };

  const pkg = readJson(path.join(root, 'package.json'));
  if (pkg.value) {
    if (typeof pkg.value.name === 'string') out.name = pkg.value.name;
    out.stack = 'Node/JS-TS';
    const scripts = pkg.value.scripts ?? {};
    for (const s of ['typecheck', 'lint', 'test']) {
      if (scripts[s]) out.gate.push(`npm run ${s}`);
    }
    if (!out.gate.length) out.notes.push('package.json không có script typecheck/lint/test ⇒ gate.commands để rỗng, tự điền');
  } else if (pkg.error) {
    out.notes.push(`package.json ${pkg.error} ⇒ không dò được lệnh gate`);
  }

  // Không có package.json thì thử các manifest khác TRƯỚC khi bỏ cuộc — bản v1.0.0 chỉ biết npm,
  // nên mọi dự án Go/Python/Rust đều nhận "gate để rỗng" kèm một câu nói về npm.
  if (!out.gate.length) {
    for (const h of STACK_HINTS) {
      if (!fs.existsSync(path.join(root, h.file))) continue;
      out.stack = out.stack ? `${out.stack} + ${h.stack}` : h.stack;
      if (!out.gate.length) out.gate = [...h.gate];
      out.notes.push(`thấy ${h.file} ⇒ đề xuất gate cho ${h.stack} — KIỂM lại, mỗi dự án một bộ lệnh khác`);
    }
  }
  if (!out.gate.length && !out.stack) {
    out.notes.push('không nhận ra manifest nào ⇒ gate.commands để rỗng, tự điền');
  }

  for (const d of ['src', 'lib', 'app', 'internal', 'cmd', 'pkg']) {
    if (fs.existsSync(path.join(root, d))) { out.src_dir = d; break; }
  }
  if (!out.src_dir) out.notes.push('không thấy thư mục mã nguồn quy ước ⇒ project.src_dir để rỗng');

  const ts = readJson(path.join(root, 'tsconfig.json'));
  const paths = ts.value?.compilerOptions?.paths;
  if (paths) {
    for (const [k, v] of Object.entries(paths)) {
      const from = k.replace(/\*$/, '');
      const to = String(Array.isArray(v) ? v[0] : v).replace(/\*$/, '');
      if (from && to) out.aliases[from] = to;
    }
  }
  return out;
}

/** Khung config đề xuất. Giá trị không dò được để RỖNG — rỗng là lời khai trung thực, bịa thì không. */
export function buildConfig(d) {
  return {
    $schema: 'cc-harness/1',
    project: { name: d.name, src_dir: d.src_dir ?? '', aliases: d.aliases },
    design_system: { 'ds-web': '', 'ds-mobile': '' },
    rules: { overrides: [] },
    gate: { commands: d.gate },
    structure: { max_loc: 600, shared_features: [], baseline: 'script/structure-baseline.json' },
    // `confirm: 'on'` là mặc định CÓ CHỦ ĐÍCH cho dự án mới: bỏ review trong im lặng là lớp lỗi đã
    // trả giá thật (3 lượt liên tiếp khai "main tự review", vòng review đầu sau khi bị ép trả 6
    // finding gồm 1 bug thật). Phiền một câu hỏi thì sửa được bằng cách đổi sang `off`.
    review: { confirm: 'on', soft_cap: 3 },
    observe: { target: 'in-process', kind: 'command' },
    integrations: { cc_lock: 'optional', cbm: 'optional', rtk: 'optional', agent_tasks: 'off' },
    policy: { mode: 'quality' },
  };
}

/**
 * `PROJECT.md` — nguồn sự thật về STACK, cho người và cho agent đọc.
 *
 * Vì sao `init` phải sinh nó: bộ luật §2 và §8 đều coi `PROJECT.md` là nguồn sự thật (bản đồ tầng ↔
 * thư mục, lệnh dev, quy ước tên), và §0 CẤM agent suy stack từ `package.json` hay tên thư mục. Ở
 * v1.0.0 không có lệnh nào sinh tệp đó ⇒ mắt xích đứt, và agent rơi về ví dụ trong bộ luật — đó là
 * một nửa của lỗi "bias theo stack".
 *
 * Giá trị không dò được để `(chưa khai)`, KHÔNG bịa: rỗng là lời khai trung thực và nó nhìn thấy
 * được, còn một dòng bịa thì trông như đã khai.
 */
export function buildProjectMd(d) {
  const q = (v) => (v && String(v).trim() !== '' ? v : '(chưa khai)');
  return `# ${q(d.name)} — PROJECT.md

Tệp này là **nguồn sự thật về dự án** cho cả người và agent. Bộ luật của bộ khung KHÔNG biết stack
của bạn và không được đoán — nó đọc ở đây.

> Sinh bởi \`cc-harness init\`. Mục \`(chưa khai)\` là **thật sự chưa khai**, không phải chỗ trang trí:
> agent gặp nó thì HỎI, chứ không suy đoán.

## Stack

- Ngôn ngữ / runtime: ${q(d.stack)}
- Framework chính: (chưa khai)
- Package manager: (chưa khai)
- Phiên bản cần ghim: (chưa khai)

## Lệnh

| Việc | Lệnh |
|---|---|
| dev / chạy tại chỗ | (chưa khai) |
| build | (chưa khai) |
| **test TARGETED** (vòng TDD chạy cái này) | (chưa khai) |
| gate đầy đủ | \`cc-harness gate\` → chạy \`gate.commands\`: ${d.gate.length ? d.gate.map((c) => `\`${c}\``).join(' · ') : '(chưa khai)'} |

## Bản đồ tầng ↔ thư mục THẬT

| Tầng | Thư mục của dự án này |
|---|---|
| composition root (wire toàn app, không nghiệp vụ) | (chưa khai) |
| feature (module nghiệp vụ, tự chứa) | ${q(d.src_dir)} |
| shared feature (≥ 3 nơi dùng, USER duyệt) | (chưa khai) |
| core (primitive, CẤM nghiệp vụ) | (chưa khai) |

**Public API của một module** ở stack này là gì (tệp index · package export · interface · …):
(chưa khai)

## Quy ước tên

- Tệp: (chưa khai)
- Module / thư mục: (chưa khai)
- Tệp test + chỗ đặt: (chưa khai)

## Contract

Giá trị đã chốt với bên ngoài, đổi một mình thì hệ khác gãy. Khai đầy đủ vào mục §1 của bộ luật
(\`rules.overrides\` → \`§1\`), rồi trỏ tới đây: (chưa khai)

## Đích quan sát

\`observe.target\` = ${q(d.src_dir ? 'in-process' : null)} — cách lấy bằng chứng cho việc có bề mặt
quan sát được (UI · endpoint · output CLI · tệp sinh ra): (chưa khai)

## Nợ kiến trúc đang ratchet

Danh sách vi phạm đã đóng băng trong baseline của \`cc-harness structure\`, và kế hoạch trả:
(chưa khai)
`;
}

/**
 * Ba đường dẫn PHẢI gitignore ở mọi dự án dùng bộ khung.
 *
 * Đây là CƠ CHẾ của luật §10 "md mô tả HIỆN TẠI không được lên remote". Không có ba dòng này thì luật
 * đó chỉ là văn xuôi: một `git add -A` là thiết kế và spec lên remote, rồi outdate, rồi thành hợp
 * đồng sai mà cả team tin. Văn xuôi không chống được `git add -A`.
 */
export const GITIGNORE_LINES = ['docs-raw/', 'docs/wip/', 'specs/'];

const GITIGNORE_BLOCK = [
  '',
  '# cc-harness — KHÔNG BAO GIỜ push (bộ luật §10). Ba thứ này mô tả HIỆN TẠI nên outdate nhanh,',
  '# và một tài liệu outdate trên remote tệ hơn không có: người sau tin nó. Sự thật dùng chung là',
  '# code + item của agent-tasks.',
  ...GITIGNORE_LINES,
];

/**
 * Thêm dòng còn THIẾU vào `.gitignore`, giữ nguyên mọi thứ khác.
 *
 * So theo DÒNG đã trim, không so chuỗi con: `docs/wip/` nằm trong `!docs/wip/keep` là ca ngược nghĩa
 * hoàn toàn, mà `includes()` thì thấy "đã có".
 * @returns {{text:string, added:string[]}}
 */
export function mergeGitignore(existing) {
  const cur = typeof existing === 'string' ? existing : '';
  const have = new Set(cur.split(/\r?\n/).map((l) => l.trim()));
  const added = GITIGNORE_LINES.filter((l) => !have.has(l));
  if (!added.length) return { text: cur, added };
  const body = GITIGNORE_BLOCK.filter((l) => !GITIGNORE_LINES.includes(l) || added.includes(l));
  const sep = cur === '' || cur.endsWith('\n') ? '' : '\n';
  return { text: `${cur}${sep}${body.join('\n')}\n`, added };
}

/**
 * Thêm quyền còn THIẾU vào settings, giữ nguyên mọi thứ khác.
 * @returns {{settings:object, added:string[]}}
 */
export function mergePermissions(existing) {
  const settings = existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {};
  const perms = { ...(settings.permissions ?? {}) };
  const allow = Array.isArray(perms.allow) ? [...perms.allow] : [];
  const added = REQUIRED_PERMISSIONS.filter((p) => !allow.includes(p));
  if (added.length) {
    perms.allow = [...allow, ...added];
    settings.permissions = perms;
  }
  return { settings, added };
}

/**
 * @param {{root:string, write?:boolean}} opts `write:false` ⇒ chỉ xem trước, không đụng đĩa
 * @returns {{lines:string[], changed:string[], fail:boolean}}
 */
export function init({ root, write = true }) {
  const lines = [];
  const changed = [];
  let fail = false;

  const d = detectProject(root);
  lines.push(`cc-harness init — ${root}`);
  lines.push(`  dò được: name=${d.name} · src_dir=${d.src_dir ?? '(không rõ)'} · gate=${d.gate.length ? d.gate.join(', ') : '(không rõ)'}`);
  for (const n of d.notes) lines.push(`  ⚠ ${n}`);

  // ── 1. claude_config.json ──
  const cfgPath = path.join(root, CONFIG_FILENAME);
  const cur = readJson(cfgPath);
  if (cur.error) {
    lines.push(`\n✖ ${CONFIG_FILENAME}: ${cur.error} — sửa hoặc xoá rồi chạy lại; tôi KHÔNG đè lên file không đọc được.`);
    fail = true;
  } else if (!cur.missing) {
    lines.push(`\n· ${CONFIG_FILENAME} đã có ⇒ GIỮ NGUYÊN. Kiểm bằng \`cc-harness config --check\`.`);
  } else if (write) {
    fs.writeFileSync(cfgPath, JSON.stringify(buildConfig(d), null, 2) + '\n');
    changed.push(CONFIG_FILENAME);
    lines.push(`\n✔ đã sinh ${CONFIG_FILENAME} — KIỂM \`gate.commands\` trước khi dùng. Dự án có UI ⇒ khai thêm \`design_system\`; stack khác ⇒ khai \`skills.required\`.`);
  } else {
    lines.push(`\n· sẽ sinh ${CONFIG_FILENAME} (đang xem trước)`);
  }

  // ── 2. .claude/settings.json — permissions ──
  const setPath = path.join(root, '.claude', 'settings.json');
  const set = readJson(setPath);
  if (set.error) {
    lines.push(`✖ .claude/settings.json: ${set.error} — KHÔNG đè. Tự thêm: ${REQUIRED_PERMISSIONS.join(' ')}`);
    fail = true;
  } else {
    const { settings, added } = mergePermissions(set.value);
    if (!added.length) {
      lines.push(`· .claude/settings.json: quyền cho \`cc-harness\` đã có`);
    } else if (write) {
      fs.mkdirSync(path.dirname(setPath), { recursive: true });
      fs.writeFileSync(setPath, JSON.stringify(settings, null, 2) + '\n');
      changed.push('.claude/settings.json');
      lines.push(`✔ .claude/settings.json: thêm quyền ${added.join(', ')}`);
      lines.push(`  (plugin KHÔNG ship được permissions — thiếu dòng này thì mọi lệnh gate đều bị hỏi quyền)`);
      lines.push(`  ⚠ Quyền này CHỈ có hiệu lực khi workspace đã được TRUST. Claude Code bỏ qua toàn bộ`);
      lines.push(`    permissions.allow của dự án chưa trust — mở Claude Code tương tác một lần tại đây`);
      lines.push(`    và đồng ý hộp thoại trust. \`cc-harness doctor\` kiểm giúp trạng thái này.`);
    } else {
      lines.push(`· sẽ thêm quyền ${added.join(', ')} vào .claude/settings.json`);
    }
  }

  // ── 3. PROJECT.md — nguồn sự thật về stack ──
  const pmPath = path.join(root, 'PROJECT.md');
  if (fs.existsSync(pmPath)) {
    lines.push(`· PROJECT.md đã có ⇒ GIỮ NGUYÊN. Kiểm xem mục "Stack" và "Lệnh" còn đúng không.`);
  } else if (write) {
    try {
      fs.writeFileSync(pmPath, buildProjectMd(d));
      changed.push('PROJECT.md');
      lines.push(`✔ đã sinh PROJECT.md — điền các mục \`(chưa khai)\`; bộ luật ĐỌC tệp này để biết stack.`);
    } catch (e) {
      lines.push(`✖ không ghi được PROJECT.md (${(e && e.code) || e}) — tạo tay, bộ luật cần nó`);
      fail = true;
    }
  } else {
    lines.push(`· sẽ sinh PROJECT.md (đang xem trước)`);
  }

  // ── 4. .gitignore — CƠ CHẾ của luật "không lên remote" ──
  const giPath = path.join(root, '.gitignore');
  let giCur = '';
  try { giCur = fs.readFileSync(giPath, 'utf8'); } catch (e) {
    if (e && e.code !== 'ENOENT') {
      lines.push(`✖ .gitignore: không đọc được (${e.code}) — KHÔNG đè. Tự thêm: ${GITIGNORE_LINES.join(' ')}`);
      fail = true;
      giCur = null;
    }
  }
  if (giCur !== null) {
    const { text, added } = mergeGitignore(giCur);
    if (!added.length) {
      lines.push(`· .gitignore: đã có đủ ${GITIGNORE_LINES.join(' · ')}`);
    } else if (write) {
      try {
        fs.writeFileSync(giPath, text);
        changed.push('.gitignore');
        lines.push(`✔ .gitignore: thêm ${added.join(' · ')}`);
        lines.push(`  (thiết kế và spec KHÔNG BAO GIỜ push — chúng mô tả HIỆN TẠI nên outdate nhanh)`);
      } catch (e) {
        lines.push(`✖ .gitignore: không ghi được (${(e && e.code) || e}) — tự thêm: ${added.join(' ')}`);
        fail = true;
      }
    } else {
      lines.push(`· sẽ thêm vào .gitignore: ${added.join(' · ')}`);
    }
  }

  // `CLAUDE.md` cố ý KHÔNG tự sinh: nó là tiếng nói của DỰ ÁN với Claude, không phải của bộ khung.
  // Sinh hộ một tệp như thế là đặt lời vào miệng người khác. Chỉ nói ra khi thiếu.
  if (!fs.existsSync(path.join(root, 'CLAUDE.md'))) {
    lines.push(`· chưa có CLAUDE.md — KHÔNG tự sinh (đó là tiếng nói của dự án, không phải của khung).`);
    lines.push(`  Muốn nói riêng gì với Claude ở repo này thì tạo tay; bộ luật sẽ đọc nó.`);
  }

  lines.push(`\nTiếp theo: \`cc-harness doctor\``);
  return { lines, changed, fail };
}
