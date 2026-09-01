// rules.mjs — cắt bộ luật thành section có ID ỔN ĐỊNH, rồi trộn override của dự án.
//
// VÌ SAO ID PHẢI ỔN ĐỊNH: id là hợp đồng giữa `rules/FRAMEWORK.md` (plugin) và
// `claude_config.json` (repo dự án). Id đổi theo thứ tự heading, hay tự thêm hậu tố khi trùng,
// thì override của dự án lặng lẽ trỏ sang mục khác sau một lần biên tập base. Vì vậy:
//   - trùng id ⇒ ERROR, KHÔNG tự thêm `-2`;
//   - id cấp 3 gắn với id cha, nên hai mục "Lệnh" ở hai chương khác nhau không đụng nhau.
//
// BẪY ĐÃ BIẾT: heading nằm trong code fence KHÔNG phải heading. Bộ luật này đầy khối lệnh có
// dòng `## ...`; đếm chúng thành section thì id lệch và override trỏ nhầm chỗ.

/** Bảng chữ cái tiếng Việt không tách được bằng NFD (đ/Đ) — phần còn lại do NFD lo. */
const VN_SPECIAL = /[đĐ]/g;

/** Slug ổn định: bỏ dấu → hạ thường → chỉ giữ [a-z0-9] → gộp `-` → cắt 40, không để `-` ở đuôi. */
export function slug(text) {
  const noMarks = String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(VN_SPECIAL, 'd')
    .toLowerCase();
  const s = noMarks
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s.slice(0, 40).replace(/-+$/, '');
}

const FENCE = /^\s{0,3}(```|~~~)/;
const HEADING = /^(#{2,3})\s+(.+?)\s*$/;
const NUMBERED = /^(\d+)\.\s*/;

/** Annotation của một mục, viết dưới dạng comment HTML ngay SAU dòng heading. */
const ANNOT = /^<!--\s*(inject|when)\s*:\s*(.+?)\s*-->\s*$/;

/** Tầng hợp lệ. Mặc định là `ref` — vào LÕI phải khai TƯỜNG MINH, không có đường mặc định vào. */
export const TIERS = ['core', 'ref'];

/**
 * Đọc annotation ở vài dòng ngay sau heading. Dừng ở dòng đầu tiên không phải comment/blank —
 * comment nằm giữa thân bài KHÔNG được tính là annotation của mục, nếu không thì một dòng
 * `<!-- inject: core -->` viết nhầm ở giữa §5 sẽ lặng lẽ đẩy cả §5 vào LÕI.
 */
function readAnnotations(lines, headingIdx) {
  const out = { declaredTier: null, when: null };
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.trim() === '') continue;
    const m = ANNOT.exec(raw.trim());
    if (!m) break;
    if (m[1] === 'inject') out.declaredTier = TIERS.includes(m[2]) ? m[2] : 'ref';
    else out.when = m[2];
  }
  return out;
}

/**
 * @param {string} md
 * @returns {{sections: {id:string,heading:string,level:number,start:number,end:number,tier:string,when:string|null}[], errors: {code:string,message:string}[]}}
 *   `start` = chỉ số dòng của heading; `end` = chỉ số dòng ĐẦU TIÊN không còn thuộc section.
 */
export function listSections(md) {
  const lines = String(md).split('\n');
  const sections = [];
  const errors = [];
  let inFence = false;
  let parentId = null;

  for (let i = 0; i < lines.length; i++) {
    if (FENCE.test(lines[i])) { inFence = !inFence; continue; }
    if (inFence) continue;

    const m = HEADING.exec(lines[i]);
    if (!m) continue;

    const level = m[1].length;
    const heading = m[2];
    let id;
    if (level === 2) {
      const n = NUMBERED.exec(heading);
      id = n ? `§${n[1]}` : `§${slug(heading)}`;
      parentId = id;
    } else {
      id = `${parentId || '§'}/${slug(heading)}`;
    }

    if (sections.some((s) => s.id === id)) {
      errors.push({ code: 'duplicate-id', message: `id "${id}" xuất hiện hai lần (dòng ${i + 1}) — đổi tiêu đề cho khác nhau; id KHÔNG được tự thêm hậu tố vì override của dự án bám theo nó` });
      continue;
    }
    const ann = readAnnotations(lines, i);
    // Tầng của mục cấp 3 KẾ THỪA cha, trừ khi nó tự khai. Lý do: đường bơm lấy trọn phạm vi của
    // mục cấp 2 (kể cả con), nên nếu con báo `ref` trong khi thực tế nó ĐANG được bơm thì mọi
    // phép đếm/kiểm dựa vào `tier` đều nói sai — đúng loại lỗi câm mà lớp này sinh ra để chống.
    const declared = ann.declaredTier;
    const parentTier = level === 3 ? (sections.filter((s) => s.level === 2).pop()?.tier ?? 'ref') : 'ref';
    const tier = declared ?? (level === 3 ? parentTier : 'ref');
    sections.push({ id, heading, level, start: i, end: lines.length, tier, when: ann.when, declaredTier: declared });
  }

  // `end` của mỗi section = heading kế tiếp có cấp BẰNG hoặc CAO HƠN. Nhờ vậy replace một mục
  // cấp 2 nuốt trọn các mục cấp 3 bên trong nó — đúng trực giác "thay cả chương".
  for (let k = 0; k < sections.length; k++) {
    for (let j = k + 1; j < sections.length; j++) {
      if (sections[j].level <= sections[k].level) { sections[k].end = sections[j].start; break; }
    }
  }

  if (inFence) {
    errors.push({ code: 'fence-unclosed', message: 'code fence mở mà không đóng — phần sau đó bị coi là nội dung fence, có thể nuốt mất section' });
  }
  return { sections, errors };
}

/** Khoảng cách Levenshtein — chỉ để GỢI Ý id gần nhất khi người dùng gõ sai. */
function distance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

/** Gợi ý id gần nhất — dùng chung cho `resolve()` và cho lệnh `rules <id>` gõ sai. */
export function nearestId(id, all) {
  if (!all.length) return null;
  const best = all.map((x) => ({ x, d: distance(id, x) })).sort((p, q) => p.d - q.d)[0];
  return best.d <= Math.max(3, Math.ceil(id.length / 2)) ? best.x : null;
}

/**
 * Trộn base với override của dự án.
 * @param {string} base nội dung `rules/FRAMEWORK.md`
 * @param {{section:string,op:string,file?:string,reason?:string}[]} overrides
 * @param {(file:string)=>{text:string|null,missing:boolean,why:string|null}} readFile
 *   Người gọi bơm hàm đọc vào — module này KHÔNG chạm filesystem, nên test không cần đĩa và
 *   phân biệt "không tồn tại" ≠ "không đọc được" nằm ở đúng một chỗ.
 */
export function resolve(base, overrides, readFile) {
  const errors = [];
  const applied = [];
  const removed = [];
  let lines = String(base).split('\n');

  const list = Array.isArray(overrides) ? overrides : [];

  // Trùng section ⇒ chặn CẢ HAI, không có luật "cái sau thắng" ngầm. Người viết config phải nói
  // rõ ý mình; đoán hộ ở đây là cách tạo ra hai bản luật khác nhau trên hai máy.
  const seen = new Map();
  for (const ov of list) seen.set(ov.section, (seen.get(ov.section) || 0) + 1);
  const duplicated = new Set([...seen.entries()].filter(([, n]) => n > 1).map(([s]) => s));
  for (const s of duplicated) {
    errors.push({ code: 'duplicate-override', message: `section "${s}" bị khai ${seen.get(s)} lần trong rules.overrides — giữ đúng một mục` });
  }

  for (const ov of list) {
    if (duplicated.has(ov.section)) continue;

    // Parse LẠI sau mỗi thao tác: mọi vị trí đã đổi. Số override là hàng đơn vị nên rẻ, và nó
    // làm hành vi tường minh — replace §2 rồi replace §2/con sẽ báo "không tìm thấy", đúng thực tế.
    const { sections } = listSections(lines.join('\n'));
    const target = sections.find((s) => s.id === ov.section);

    if (ov.op === 'append') {
      if (target) {
        errors.push({ code: 'section-exists', message: `section "${ov.section}" đã có trong base — dùng op "replace" nếu muốn thay, "append" chỉ dành cho mục MỚI` });
        continue;
      }
      const got = readFile(ov.file);
      if (got.text === null) {
        errors.push({ code: 'override-file', message: `override cho "${ov.section}": ${got.why} — ${ov.file}` });
        continue;
      }
      if (lines[lines.length - 1] !== '') lines.push('');
      lines = lines.concat(String(got.text).split('\n'));
      applied.push({ section: ov.section, op: 'append' });
      continue;
    }

    if (!target) {
      const hint = nearestId(ov.section, sections.map((s) => s.id));
      errors.push({
        code: 'section-not-found',
        message: `section "${ov.section}" không có trong bộ luật${hint ? ` — ý bạn là "${hint}"?` : ''} (xem \`cc-harness rules --list-sections\`)`,
      });
      continue;
    }

    if (ov.op === 'remove') {
      lines.splice(target.start, target.end - target.start);
      removed.push({ section: ov.section, reason: ov.reason });
      applied.push({ section: ov.section, op: 'remove' });
      continue;
    }

    if (ov.op === 'replace') {
      const got = readFile(ov.file);
      if (got.text === null) {
        errors.push({ code: 'override-file', message: `override cho "${ov.section}": ${got.why} — ${ov.file}` });
        continue;
      }
      lines.splice(target.start, target.end - target.start, ...String(got.text).split('\n'));
      applied.push({ section: ov.section, op: 'replace' });
      continue;
    }

    errors.push({ code: 'unknown-op', message: `op "${ov.op}" không hiểu được (đã qua validate config?)` });
  }

  return { text: lines.join('\n'), applied, removed, errors };
}
