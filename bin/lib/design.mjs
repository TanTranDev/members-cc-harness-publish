// design.mjs — routing design system: dự án khai dùng skill nào cho bề mặt nào.
//
// `cc-design` là kho skill THỤ ĐỘNG. Quyết định nằm ở đây, đọc từ `claude_config.json`:
//   { "design_system": { "ds-web": "cc-design:design-system-web", "ds-mobile": "my-inhouse-ds" } }
//
// Giá trị nhận hai dạng:
//   "<plugin>:<skill>" — skill của một plugin (không kiểm được nó có thật không: plugin nằm
//                        ngoài repo, và ta cố ý KHÔNG đoán).
//   "<tên trần>"       — skill trong `.claude/skills/<tên>/` của CHÍNH dự án. Cái này KIỂM ĐƯỢC.
import fs from 'node:fs';
import path from 'node:path';

/** Bề mặt UI → đuôi file. Dùng để guard nhắc khi sửa UI mà chưa nạp skill tương ứng. */
export const SURFACES = {
  'ds-web': ['.tsx', '.jsx', '.vue', '.svelte', '.css', '.scss', '.html'],
  'ds-mobile': ['.tsx', '.jsx', '.kt', '.swift'],
};

/**
 * @param {object|null} config
 * @param {string} root ROOT repo dự án (để kiểm skill local có tồn tại không)
 * @returns {{surface:string, ref:string, kind:'plugin'|'local', exists:boolean|null, hint:string|null}[]}
 *   `exists === null` nghĩa là KHÔNG KIỂM ĐƯỢC (skill của plugin khác) — khác hẳn `false`.
 */
export function resolveDesign(config, root) {
  const ds = config?.design_system ?? {};
  const out = [];
  for (const surface of Object.keys(SURFACES)) {
    const ref = ds[surface];
    if (!ref) continue;
    if (ref.includes(':')) {
      out.push({ surface, ref, kind: 'plugin', exists: null, hint: null });
      continue;
    }
    const p = path.join(root, '.claude', 'skills', ref, 'SKILL.md');
    const exists = fs.existsSync(p);
    out.push({
      surface, ref, kind: 'local', exists,
      hint: exists ? null : `không thấy ${path.join('.claude/skills', ref, 'SKILL.md')} — tên skill local sai, hay chưa tạo?`,
    });
  }
  return out;
}

/**
 * Skill của dự án, đường TỔNG QUÁT — không chỉ UI.
 *
 * `design_system` chỉ phủ hai bề mặt UI, nên dự án Go/Python/backend không có chỗ nào khai skill
 * riêng của stack mình. Khoá `skills` sửa đúng chỗ đó:
 *   { "skills": { "required": ["my-org:go-service-rules"],
 *                 "hints": { "src/api/": "my-org:openapi-rules" } } }
 *
 * `required` — nhắc trong khối đầu phiên. `hints` — nhắc khi chạm thư mục khớp (chưa nối cơ chế
 * nhắc-đúng-lúc, nên hiện tại chỉ được KHAI và KIỂM, chưa được bơm vào lúc chạm thư mục).
 *
 * @returns {{required:string[], hints:{prefix:string,ref:string}[], errors:string[]}}
 */
export function resolveSkills(config) {
  const sk = config?.skills ?? {};
  const errors = [];
  const required = [];
  for (const ref of Array.isArray(sk.required) ? sk.required : []) {
    if (typeof ref !== 'string' || ref.trim() === '') { errors.push('skills.required: có phần tử không phải chuỗi'); continue; }
    // Tên TRẦN (không namespace) gần như luôn là lỗi: skill của plugin BẮT BUỘC mang namespace, và
    // gõ tên trần thì Claude không tìm thấy — im lặng, vì "không thấy skill" không phải lỗi ném ra.
    if (!ref.includes(':')) errors.push(`skills.required: "${ref}" không có namespace — skill của plugin phải gọi \`<plugin>:<skill>\`, gõ tên trần sẽ KHÔNG tìm thấy`);
    required.push(ref);
  }
  const hints = [];
  const h = sk.hints;
  if (h && typeof h === 'object' && !Array.isArray(h)) {
    for (const [prefix, ref] of Object.entries(h)) {
      if (typeof ref !== 'string' || ref.trim() === '') { errors.push(`skills.hints["${prefix}"]: phải là tên skill`); continue; }
      hints.push({ prefix, ref });
    }
  }
  return { required, hints, errors };
}

/**
 * Công tắc review của dự án, dạng dòng bơm vào phiên.
 *
 * VÌ SAO PHẢI BƠM: §12 phân nhánh theo `review.confirm` (`on` ⇒ user chốt mỗi việc · `off` ⇒ agent tự
 * vào), nhưng giá trị đó nằm trong `claude_config.json` mà agent KHÔNG được lệnh đọc. Khai một khoá
 * rồi không đưa nó tới nơi cần là khoá câm — schema xanh, config xanh, hành vi không bao giờ đổi.
 *
 * Chỉ in khi KHÁC mặc định (`on`, trần 3): mặc định là mức chặt hơn và §12 đã mô tả nó, nên im lặng
 * ở ca mặc định vừa đúng nghĩa vừa không tốn byte của đường bơm.
 */
export function reviewContext(config) {
  const r = config?.review ?? {};
  const out = [];
  if (r.confirm === 'off') {
    out.push('**`review.confirm: off`** — KHÔNG hỏi user có vào luồng review không: tự đánh giá theo dấu hiệu (§12), tự spawn, và KHAI vào ledger dấu hiệu đã thấy. Đề xuất vẫn bắt buộc, chỉ là không chờ người.');
  }
  if (typeof r.soft_cap === 'number' && r.soft_cap !== 3) {
    out.push(`- Trần MỀM số vòng review của dự án này: **${r.soft_cap}** (mặc định 3). Hết trần ⇒ dừng, trình user tiếp hay dừng.`);
  }
  return out;
}

/** Dòng bơm vào context phiên. Không khai gì ⇒ trả [] và im lặng HỢP PHÁP (đã khai là không dùng). */
export function designContext(entries, skills = { required: [], hints: [], errors: [] }, review = []) {
  const lines = [...review];
  if (entries.length) {
    lines.push('**Design system của dự án này** (khai ở `claude_config.json`):');
    for (const e of entries) {
      const label = e.surface === 'ds-web' ? 'UI WEB' : 'UI MOBILE';
      lines.push(`- Sửa ${label} ⇒ BẮT BUỘC nạp skill \`${e.ref}\` TRƯỚC khi viết code.`);
      if (e.exists === false) lines.push(`  ⚠️ ${e.hint}`);
    }
    lines.push('Không nạp skill tương ứng mà vẫn sửa UI là bỏ qua design system — hỏi user nếu thấy mâu thuẫn.');
  }
  if (skills.required?.length) {
    lines.push(`**Skill BẮT BUỘC của dự án này**: ${skills.required.map((r) => `\`${r}\``).join(' · ')} — nạp TRƯỚC khi viết code thuộc phạm vi của nó.`);
  }
  for (const hint of skills.hints ?? []) {
    lines.push(`- Chạm \`${hint.prefix}\` ⇒ nạp \`${hint.ref}\`.`);
  }
  for (const e of skills.errors ?? []) lines.push(`⚠️ ${e}`);
  return lines;
}

/** Bề mặt nào khớp đường dẫn file đang sửa (một file có thể khớp nhiều bề mặt, vd .tsx). */
export function surfacesFor(filePath, entries) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  if (!ext) return [];
  return entries.filter((e) => SURFACES[e.surface].includes(ext));
}
