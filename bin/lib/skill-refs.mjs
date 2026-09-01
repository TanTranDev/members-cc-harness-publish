// skill-refs.mjs — lớp kiểm tham chiếu skill trong SKILL.md và agents/*.md.
//
// VÌ SAO CẦN: skill của plugin LUÔN namespaced (`/cc-harness:brainstorming`). Bộ khung cũ sống ở
// `.claude/skills/` nên gọi nhau bằng tên trần; bê nguyên sang plugin thì mọi tham chiếu chéo
// thành tên KHÔNG TỒN TẠI — và Claude sẽ đi tìm một skill ma thay vì báo lỗi.
//
// Hai chiều đều phải kiểm:
//   bare-ref     — tên trần trùng một skill trong roster ⇒ thiếu namespace.
//   dangling-ref — `cc-harness:X` mà X không có trong roster ⇒ trỏ vào hư không (gõ sai, hoặc
//                  skill đã đổi tên/bị xoá mà tham chiếu ở lại).

/**
 * Namespace của các plugin ANH EM — đã ĐỌC TỪ MÃ NGUỒN của chúng, không suy đoán:
 *   cc-lock      → plugin `cc-lock`, skill tên `cc-lock-*` ⇒ gọi `cc-lock:cc-lock-coordination`
 *                  (tiền tố lặp trông thừa nhưng đúng: namespace + tên skill là hai lớp khác nhau)
 *   agent-tasks  → plugin `agent-tasks`, skill `task-*`   ⇒ gọi `agent-tasks:task-next`
 */
export const SIBLING_PLUGINS = { 'cc-lock': 'cc-lock-', 'agent-tasks': 'task-' };

/** Tên KHÔNG thuộc roster nhưng được phép đứng trần — phải khai tường minh, không đoán. */
export const EXEMPT = [];

const NS = 'cc-harness';

/**
 * Roster THẬT của một plugin = trường `name:` trong frontmatter, KHÔNG phải tên thư mục.
 * Claude Code lấy tên invocation từ `name:`; thư mục chỉ là nơi cất file. Hai thứ lệch nhau ⇒
 * skill được nạp dưới một tên khác hẳn tên mọi tài liệu đang trỏ tới.
 *
 * Đây là bug thật đã gặp: thư mục đổi `porting` → `migrate` nhưng frontmatter vẫn `name: porting`,
 * nên skill sống dưới tên `cc-harness:porting` trong khi 2 chỗ trong `agents/` trỏ
 * `cc-harness:migrate` — tham chiếu treo. Lưới cũ mù vì nó lấy roster từ tên thư mục.
 *
 * @param {{dir:string, name:string|null}[]} entries
 * @returns {{names:string[], mismatches:{code:string,file:string,name:string,message:string}[]}}
 */
export function rosterFromSkills(entries) {
  const names = [];
  const mismatches = [];
  for (const e of entries) {
    if (!e.name) {
      mismatches.push({ code: 'missing-name', file: `skills/${e.dir}/SKILL.md`, name: e.dir, message: `thiếu \`name:\` trong frontmatter — Claude Code không biết gọi skill này bằng tên gì` });
      continue;
    }
    if (e.name !== e.dir) {
      mismatches.push({ code: 'name-dir-mismatch', file: `skills/${e.dir}/SKILL.md`, name: e.name, message: `thư mục là "${e.dir}" nhưng \`name:\` là "${e.name}" ⇒ skill được nạp là \`${NS}:${e.name}\`, không phải \`${NS}:${e.dir}\`` });
    }
    names.push(e.name);
  }
  return { names, mismatches };
}

/**
 * @param {{path:string, text:string}[]} files
 * @param {string[]} roster tên skill THẬT (lấy từ `name:` frontmatter — xem rosterFromSkills)
 * @param {string[]} exempt
 * @returns {{code:string, file:string, name:string, message:string}[]}
 */
export function checkSkillRefs(files, roster, exempt = EXEMPT) {
  const inRoster = new Set(roster);
  const allowBare = new Set(exempt);
  const out = [];

  for (const f of files) {
    for (const m of f.text.matchAll(/`([a-z][a-z0-9-]*)`/g)) {
      const name = m[1];
      if (allowBare.has(name)) continue;
      if (inRoster.has(name)) {
        out.push({ code: 'bare-ref', file: f.path, name, message: `\`${name}\` là skill của plugin ⇒ phải viết \`${NS}:${name}\`` });
      }
    }
    for (const m of f.text.matchAll(new RegExp('`' + NS + ':([a-z][a-z0-9-]*)`', 'g'))) {
      const name = m[1];
      if (!inRoster.has(name)) {
        out.push({ code: 'dangling-ref', file: f.path, name, message: `\`${NS}:${name}\` trỏ tới skill KHÔNG tồn tại trong roster` });
      }
    }

    // Plugin anh em: namespace đúng nhưng tên skill sai tiền tố ⇒ gần như chắc chắn gõ nhầm.
    // Không kiểm được là skill đó CÓ THẬT hay không (plugin nằm ngoài repo này), nên chỉ kiểm
    // thứ kiểm được — và nói rõ giới hạn đó thay vì im lặng cho qua tất cả.
    for (const [plugin, prefix] of Object.entries(SIBLING_PLUGINS)) {
      for (const m of f.text.matchAll(new RegExp('`' + plugin + ':([a-z][a-z0-9-]*)`', 'g'))) {
        if (!m[1].startsWith(prefix)) {
          out.push({
            code: 'sibling-prefix', file: f.path, name: m[1],
            message: `\`${plugin}:${m[1]}\` — skill của plugin ${plugin} đều bắt đầu bằng "${prefix}"`,
          });
        }
      }
    }
  }
  return out;
}
