// config.mjs — đọc + validate `claude_config.json` của repo dự án.
//
// HỢP ĐỒNG: loadConfig(root) → { ok, config, errors[], warnings[], path }
//   errors   = chặn (ok=false). warnings = nói ra rồi đi tiếp.
//   Mỗi mục: { code, key, message } — `code` để máy bám, `message` để người sửa.
//
// HAI LUẬT KHÔNG ĐƯỢC PHÁ:
//   1. `root` NHẬN QUA THAM SỐ. Không `import.meta.url`, không `process.cwd()` — file này sống
//      trong plugin nhưng nói về repo dự án, hai chỗ khác nhau (luật 8 của framework-check).
//   2. "không tồn tại" ≠ "không đọc được". Gộp hai thứ này là cách nhanh nhất để một lỗi quyền
//      truy cập bị báo thành "dự án chưa cấu hình" và người đi sửa nhầm chỗ.
import fs from 'node:fs';
import path from 'node:path';

export const CONFIG_FILENAME = 'claude_config.json';

/** 3 trạng thái của một tích hợp ngoài. Harness áp LUẬT; config của tích hợp là việc của plugin đó. */
export const INTEGRATION_STATES = ['required', 'optional', 'off'];
export const KNOWN_INTEGRATIONS = ['cc_lock', 'cbm', 'rtk', 'agent_tasks'];

export const OVERRIDE_OPS = ['replace', 'append', 'remove'];

/**
 * Khoá ĐÃ BỎ, giữ tên lại để NÓI RA khi dự án còn khai nó.
 *
 * Khoá lạ vốn chỉ ra WARN chung "không hiểu khoá này". Với khoá vừa bị bỏ thì WARN chung là chưa
 * đủ: người khai nó tưởng nó còn tác dụng, và cái họ mất là một cơ chế chứ không phải một dòng
 * config. Nên mỗi khoá bỏ đi mang theo một câu nói rõ nó chết vì sao và thay bằng gì.
 */
export const REMOVED_KEYS = {
  'gate.prepush': 'đã BỎ ở v1.1.0 — khoá này được VALIDATE mà KHÔNG AI ĐỌC, tức một khoá CÂM: schema xanh, `config --check` xanh, mà giá trị không bao giờ tới nơi cần. Muốn chạy gate trước khi push thì dùng git hook của dự án gọi `cc-harness gate`.',
  risk: 'đã BỎ ở v1.1.0. Cơ chế chấm ⚠️ theo tiền tố đường dẫn cho ra tín hiệu HẰNG ĐÚNG (đo: 9/9 mục ⚠️ mang đúng một bit) nên bắt trả giá review cho cả những fix cơ bản. Thay bằng: `review.confirm` on/off + tiêu chí theo THỨ DIFF ĐÃ LÀM (§12). Danh sách single-writer chuyển sang `cc-lock.config.json` của plugin cc-lock.',
};
export const OBSERVE_TARGETS = ['in-process', 'served', 'deployed'];
export const OBSERVE_KINDS = ['command', 'screenshot-ios', 'screenshot-android', 'none'];

/** Kiểu khai báo cho từng khoá. Thiếu khoá ⇒ khoá lạ ⇒ WARN (không nuốt im lặng). */
const SCHEMA = {
  $schema: { type: 'string' },
  project: {
    type: 'object',
    fields: {
      name: { type: 'string' },
      src_dir: { type: 'string' },
      aliases: { type: 'object' },
    },
  },
  // `design_system` là đường TƯƠNG THÍCH, chỉ phủ hai bề mặt UI. Đường chính là `skills` bên dưới:
  // dự án Go/Python/backend không có bề mặt UI nào nhưng vẫn cần bơm skill riêng của stack mình.
  design_system: {
    type: 'object',
    fields: {
      'ds-web': { type: 'string' },
      'ds-mobile': { type: 'string' },
    },
  },
  skills: {
    type: 'object',
    fields: {
      required: { type: 'array' },   // skill LUÔN nhắc trong khối đầu phiên
      hints: { type: 'object' },     // { "<tiền tố đường dẫn>": "<skill>" } — nhắc khi chạm chỗ đó
    },
  },
  rules: {
    type: 'object',
    fields: { overrides: { type: 'array', items: 'override' } },
  },
  gate: {
    type: 'object',
    fields: { commands: { type: 'array' } },
  },
  structure: {
    type: 'object',
    fields: {
      max_loc: { type: 'number' },
      shared_features: { type: 'array' },
      baseline: { type: 'string' },
    },
  },
  // `risk` ĐÃ BỎ ở v1.1.0 — xem `REMOVED_KEYS` bên dưới. Kích hoạt review nay theo THỨ DIFF ĐÃ LÀM
  // (§12), không theo tiền tố đường dẫn; danh sách single-writer về đúng chủ của nó là
  // `cc-lock.config.json` của plugin cc-lock.
  review: {
    type: 'object',
    fields: {
      confirm: { type: 'string', enum: ['on', 'off'] },
      soft_cap: { type: 'number' },
    },
  },
  observe: {
    type: 'object',
    fields: {
      target: { type: 'string', enum: OBSERVE_TARGETS },
      kind: { type: 'string', enum: OBSERVE_KINDS },
      port: { type: 'number' },
      via: { type: 'string' },
      docker_project: { type: 'string' },
      freshness: { type: 'string' },
      deployed_id_cmd: { type: 'string' },
      src_dirs: { type: 'array' },
      out_dir: { type: 'string' },
    },
  },
  integrations: {
    type: 'object',
    fields: Object.fromEntries(
      KNOWN_INTEGRATIONS.map((k) => [k, { type: 'string', enum: INTEGRATION_STATES }]),
    ),
  },
  policy: { type: 'object', fields: { mode: { type: 'string' } } },
};

/** Kiểu thật của một giá trị JSON — mảng tách khỏi object, null tách khỏi object. */
function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

const err = (out, code, key, message) => out.errors.push({ code, key, message });
const warn = (out, code, key, message) => out.warnings.push({ code, key, message });

/** Chuỗi có nội dung thật — `"   "` KHÔNG tính (đã từng có ca hazard toàn khoảng trắng lọt cổng). */
const filled = (v) => typeof v === 'string' && v.trim() !== '';

function checkLeaf(value, spec, key, out) {
  if (typeOf(value) !== spec.type) {
    err(out, 'type', key, `phải là ${spec.type}, đang là ${typeOf(value)}`);
    return;
  }
  if (spec.enum && !spec.enum.includes(value)) {
    err(out, 'enum', key, `giá trị "${value}" không hợp lệ — chỉ nhận: ${spec.enum.join(' | ')}`);
  }
}

/** Một phần tử của `rules.overrides`. Ràng buộc phụ thuộc `op` nên tách riêng khỏi bảng SCHEMA. */
function checkOverride(item, key, out) {
  if (typeOf(item) !== 'object') {
    err(out, 'type', key, `phải là object, đang là ${typeOf(item)}`);
    return;
  }
  for (const f of ['section', 'op']) {
    if (!filled(item[f])) err(out, 'required', `${key}.${f}`, `bắt buộc, phải là chuỗi có nội dung`);
  }
  if (filled(item.op) && !OVERRIDE_OPS.includes(item.op)) {
    err(out, 'enum', `${key}.op`, `op "${item.op}" không hợp lệ — chỉ nhận: ${OVERRIDE_OPS.join(' | ')}`);
  }
  // `replace`/`append` cần nội dung thay vào; `remove` cần LÝ DO — gỡ luật phải ồn, không im lặng.
  if (item.op === 'replace' || item.op === 'append') {
    if (!filled(item.file)) err(out, 'required', `${key}.file`, `op "${item.op}" bắt buộc có "file" trỏ tới nội dung`);
  }
  if (item.op === 'remove' && !filled(item.reason)) {
    err(out, 'required', `${key}.reason`, 'op "remove" bắt buộc có "reason" — gỡ một mục luật phải khai lý do');
  }
  for (const k of Object.keys(item)) {
    if (!['section', 'op', 'file', 'reason'].includes(k)) {
      warn(out, 'unknown-key', `${key}.${k}`, `khoá lạ trong override — gõ sai?`);
    }
  }
}

/**
 * `gate.commands` — hình dạng bị CƯỠNG CHẾ vì `cc-harness gate` đọc THẲNG mảng này để chạy.
 * (Chuyển từ validator policy của bộ khung gốc sang đây — nơi khoá thật sự được đọc.)
 *
 * Hai phép kiểm dưới đây là lưới THẬT, không phải nghi thức:
 *  • mảng RỖNG ⇒ gate chạy 0 lệnh rồi ghi một cuốn sổ "xanh" — đúng nghĩa false-green;
 *  • lệnh chứa `\n` ⇒ sổ bằng chứng là tệp MÁY-ĐỌC theo DÒNG (`- <lệnh>  → exit N`), nên lệnh nhiều
 *    dòng vừa làm nơi đọc parse sai, vừa cho phép chèn nguyên một dòng `- npm test  → exit 0` GIẢ
 *    vào sổ. Ca vô ý (gõ JSON xuống dòng cho dễ đọc) hoàn toàn thực tế.
 */
function checkGateCommands(v, key, out) {
  if (!Array.isArray(v)) return; // sai kiểu đã có checkLeaf báo
  if (!v.length) {
    err(out, 'gate-empty', key, 'mảng RỖNG — gate chạy 0 lệnh rồi ghi sổ xanh là false-green;'
      + ' bỏ hẳn khoá `gate` nếu dự án chưa dùng');
    return;
  }
  v.forEach((c, i) => {
    if (typeof c !== 'string' || c.trim() === '' || /[\r\n]/.test(c)) {
      err(out, 'gate-command', `${key}[${i}]`,
        `phải là chuỗi lệnh không rỗng, MỘT dòng (thấy: ${JSON.stringify(c)})`);
    }
  });
}

function checkNode(node, fields, prefix, out) {
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${k}` : k;
    const spec = fields[k];
    if (!spec) {
      // Khoá ĐÃ BỎ nói rõ nó chết vì sao và thay bằng gì; khoá lạ thường thì WARN chung. Gộp hai
      // ca vào một câu "gõ sai, hay thừa?" làm người khai `risk` tưởng mình gõ sai tên, rồi đi
      // sửa chính tả cho một cơ chế đã không còn tồn tại.
      // Tra theo ĐƯỜNG DẪN ĐẦY ĐỦ trước (`gate.prepush`), rồi khoá cấp 1 (`risk`). Bản đầu chỉ tra
      // khoá cấp 1 nên `gate.prepush` rơi về WARN chung "gõ sai, hay thừa?" — tức người khai nó đi
      // sửa chính tả cho một khoá đã bị bỏ.
      const gone = REMOVED_KEYS[key] ?? (!prefix ? REMOVED_KEYS[k] : undefined);
      if (gone) warn(out, 'removed-key', key, gone);
      else warn(out, 'unknown-key', key, 'khoá không có trong schema — gõ sai, hay thừa?');
      continue;
    }
    if (key === 'gate.commands') { checkLeaf(v, spec, key, out); checkGateCommands(v, key, out); continue; }
    if (spec.type === 'object' && spec.fields) {
      if (typeOf(v) !== 'object') { err(out, 'type', key, `phải là object, đang là ${typeOf(v)}`); continue; }
      checkNode(v, spec.fields, key, out);
      continue;
    }
    if (spec.type === 'array' && spec.items === 'override') {
      if (typeOf(v) !== 'array') { err(out, 'type', key, `phải là array, đang là ${typeOf(v)}`); continue; }
      v.forEach((item, i) => checkOverride(item, `${key}[${i}]`, out));
      continue;
    }
    checkLeaf(v, spec, key, out);
  }
}

/**
 * @param {string} root ROOT của repo dự án (bắt buộc truyền — xem luật 1 ở đầu file)
 * @returns {{ok:boolean, config:object|null, errors:Array, warnings:Array, path:string}}
 */
export function loadConfig(root) {
  const p = path.join(root, CONFIG_FILENAME);
  const out = { ok: false, config: null, errors: [], warnings: [], path: p };

  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      err(out, 'config-missing', CONFIG_FILENAME,
        `không có ${p} — chạy \`cc-harness init\` để sinh, hoặc khai tường minh nếu dự án cố ý không dùng`);
    } else {
      err(out, 'config-unreadable', CONFIG_FILENAME,
        `không đọc được ${p} (${(e && e.code) || e}) — đây KHÁC với "chưa cấu hình": file có đó nhưng không mở được`);
    }
    return out;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    err(out, 'config-parse', CONFIG_FILENAME, `JSON không hợp lệ: ${e.message}`);
    return out;
  }

  if (typeOf(parsed) !== 'object') {
    err(out, 'type', '(root)', `nội dung phải là object, đang là ${typeOf(parsed)}`);
    return out;
  }

  out.config = parsed;
  checkNode(parsed, SCHEMA, '', out);
  out.ok = out.errors.length === 0;
  return out;
}

/** Gộp mọi error/warning thành text cho CLI và hook — một chỗ định dạng, mọi nơi in giống nhau. */
export function formatDiagnostics(result) {
  const lines = [];
  for (const e of result.errors) lines.push(`  ✖ ${e.key}: ${e.message}`);
  for (const w of result.warnings) lines.push(`  ⚠ ${w.key}: ${w.message}`);
  return lines.join('\n');
}
