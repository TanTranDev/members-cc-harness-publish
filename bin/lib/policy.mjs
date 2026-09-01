// @ts-check
// Core policy — thuần hàm, KHÔNG tự định vị: mọi đường dẫn nhận qua tham số (file sống trong
// plugin nhưng nói về cây của người dùng).
//
// Dùng chung bởi `cc-harness policy` (cổng + --render) và hai hook policy/config-mode.
//
// KHÁC bản bộ khung gốc ĐÚNG một chỗ: bỏ nhánh validate `policy.gate`. Trong mô hình plugin,
// `gate.commands` sống ở `claude_config.json::gate` và `cc-harness gate` đọc THẲNG chỗ đó. Giữ lại
// một validator cho khoá không ai đọc chính là lớp "nửa vời" mà lô này sinh ra để dọn: hai nơi khai
// cùng một thứ thì nơi không được đọc sẽ lặng lẽ lệch, rồi ai đó sửa nhầm nơi.
import fs from 'node:fs';

export const SCHEMA_VERSION = 1;
/** Mode bộ khung hỗ trợ. Thêm mode mới = sửa lib + design doc, KHÔNG thêm bằng file override. */
export const KNOWN_MODES = ['quality', 'balance', 'usage'];
/**
 * Sàn model cho review. MỘT nguồn sự thật, nhưng HAI câu hỏi khác nhau — gộp làm một tập là nới sàn:
 *  - `invariants.reviewFloorModel` = CHÍNH CÁI SÀN ⇒ chỉ `opus`. `inherit` KHÔNG phải một sàn.
 *  - `modelRouting.code-reviewer`  = giá trị routing hợp lệ ⇒ `opus` hoặc `inherit`, vì CLAUDE.md §0
 *    cho `inherit` để NÂNG lên model phiên chính, "không bao giờ để hạ".
 * Gộp hai thứ này (bản trước) làm `reviewFloorModel: "inherit"` lọt cổng và khối bơm vào mọi phiên
 * in "sàn inherit review" — đúng lớp lỗi B-2 (câu bơm vào context nói khác cưỡng chế) ở trục khác.
 */
export const REVIEW_FLOOR_MODEL = 'opus';
export const REVIEW_ROUTING_MODELS = [REVIEW_FLOOR_MODEL, 'inherit'];
/** Bất biến dạng SỐ: phải hữu hạn và > 0 (ngưỡng ≤ 0 vô nghĩa: timebox 0' · fan-out 0). */
const INVARIANT_NUM_KEYS = ['smartZoneK', 'timeboxMin', 'reviewLoopBudget', 'threeStrikes', 'fanoutMax'];
/** Khoá bị cấm làm cầu prototype-pollution khi deep-merge dữ liệu NGOÀI (project/local JSON). */
const PROTO_KEYS = ['__proto__', 'constructor', 'prototype'];

/** @param {unknown} v */
const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Đọc JSON tại `file`. KHÔNG tự đoán đường dẫn.
 * @param {string} file
 * @returns {{ok:true,value:any}|{ok:false,error:string}}
 */
export function readJson(file) {
  if (!fs.existsSync(file)) return { ok: false, error: `không có file: ${file}` };
  // ĐỌC và PARSE tách đôi: gộp lại thì EACCES/EISDIR/EIO bị gán nhãn "JSON hỏng" ⇒ người sửa đi
  // sửa cú pháp một file thật ra không đọc nổi.
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    return { ok: false, error: `không đọc được file: ${file} — ${e instanceof Error ? e.message : String(e)}` };
  }
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (e) {
    return { ok: false, error: `JSON hỏng: ${file} — ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Deep-merge tới lá. `undefined` = không đụng; `null` = giá trị thật (thả ga).
 * @param {any} base @param {any} over
 */
function deepMerge(base, over) {
  if (over === undefined) return base;
  if (!isObj(base) || !isObj(over)) return over;
  const out = { ...base };
  for (const k of Object.keys(over)) {
    // `over` đến từ file NGOÀI (project.json/policy-local.json). `out.__proto__ = …` không tạo khoá
    // thường mà ĐỔI PROTOTYPE của policy ⇒ sinh khoá ma đọc được ở mọi nơi (đo: `m.pwned === 1`).
    if (PROTO_KEYS.includes(k)) continue;
    out[k] = deepMerge(base[k], over[k]);
  }
  return out;
}

/**
 * defaults ← project ← local. KHÔNG mutate tham số.
 * @param {any} defaults @param {any|null} project @param {any|null} local
 */
export function mergePolicy(defaults, project, local) {
  return deepMerge(deepMerge(structuredClone(defaults), project ?? undefined), local ?? undefined);
}

/**
 * Khối ⚙️ POLICY bơm vào context (mọi mode). Chỉ ĐỌC policy đã resolve.
 * `root` là BẮT BUỘC, không phải trang trí: đây là chế độ ĐẮT NHẤT để im lặng — output này là thứ
 * agent đọc rồi hành động theo, nên hook phân giải nhầm cây = phiên chạy hiến pháp của repo khác mà
 * không ai thấy. specs/project-root là SHALL, không có carve-out theo chế độ.
 * @param {any} p @param {string} mode @param {string} root
 */
export function renderPolicyBlock(p, mode, root) {
  const i = p.invariants;
  const out = [`⚙️ POLICY [mode=${mode} · schema ${p.schema} · root: ${root}]`];

  // CHỈ IN THỨ KHÁC MẶC ĐỊNH. Khối này đi cùng đường bơm với bộ luật, và ngân sách đó là tài
  // nguyên khan nhất của bộ khung: một dòng "11 vai × (thả ga)" tiêu context để nói KHÔNG CÓ GÌ.
  // Bản trước in đủ mọi vai mọi lần, cộng 6 con số bất biến mà §0 ĐÃ nói — trùng lặp giữa hai
  // đường bơm không phải bảo hiểm, nó là hai nguồn sự thật cho cùng một con số.
  const capped = Object.entries(p.spawnBudget ?? {})
    .filter(([, byMode]) => byMode[mode] !== null && byMode[mode] !== undefined)
    .map(([role, byMode]) => [role, `${byMode[mode].toolCalls}c/${byMode[mode].tokensK}k`]);
  if (capped.length) {
    // MỌI vai cùng một trần ⇒ nói MỘT lần. Liệt kê 11 vai với 11 giá trị y hệt nhau là 11 lần
    // nói cùng một câu, và nó là dạng phình mà ai đọc cũng bỏ qua — tức tiêu context để bị lờ.
    const vals = new Set(capped.map(([, v]) => v));
    out.push(vals.size === 1
      ? `• trần mỗi lượt spawn (MỌI vai): ${[...vals][0]}`
      : `• trần mỗi lượt spawn: ${capped.map(([r, v]) => `${r} ${v}`).join(' · ')}`);
  }

  // Routing: nêu vai nào LỆCH khỏi mặc định của mode gốc. Vai đúng mặc định thì §11 đã nói.
  const base = p.defaultMode;
  const routing = Object.entries(p.modelRouting ?? {})
    .filter(([, byMode]) => mode !== base && byMode[mode] !== byMode[base])
    .map(([role, byMode]) => `${role}=${byMode[mode]}`);
  if (routing.length) out.push(`• model routing LỆCH so với ${base}: ${routing.join(' · ')}`);

  out.push(`• ngưỡng: 3-strikes=${i.threeStrikes} · vòng review=${i.reviewLoopBudget} · fan-out ≤ ${i.fanoutMax} · ngưỡng suy luận ${i.smartZoneK}k · sàn ${i.reviewFloorModel} cho review việc đắt`);
  if (mode === base) out.push(`• mode mặc định, không vai nào bị thu hẹp — chi tiết vai/model: \`cc-harness rules §11\``);

  out.push(''); // newline CUỐI: hook nối khối này vào chuỗi khác — thiếu `\n` thì hai dòng dính nhau.
  return out.join('\n');
}

/**
 * Trả MẢNG lỗi (rỗng = hợp lệ). Gom hết, không dừng ở lỗi đầu.
 * @param {any} p @returns {string[]}
 */
export function validatePolicy(p) {
  /** @type {string[]} */ const errs = [];
  if (!isObj(p)) return ['policy không phải object'];
  if (p.schema !== SCHEMA_VERSION) errs.push(`schema phải = ${SCHEMA_VERSION} (thấy: ${JSON.stringify(p.schema)})`);
  const modes = Array.isArray(p.modes) ? p.modes : [];
  if (!modes.length) errs.push('modes: phải là mảng không rỗng');
  // Cưỡng chế quyết định design §6 "KHÔNG cho project/local thêm mode mới". Không có vòng này,
  // một override khai ĐỦ mọi nhánh cho mode lạ sẽ qua cổng IM LẶNG — validator chỉ bắt gián tiếp
  // khi người ta khai THIẾU, tức lưới phụ thuộc vào việc kẻ thêm mode làm ẩu. (đo: 0 lỗi)
  for (const m of modes)
    if (!KNOWN_MODES.includes(m))
      errs.push(`modes: "${m}" không phải mode bộ khung hỗ trợ (chỉ ${KNOWN_MODES.join(' | ')})`
        + ' — thêm mode mới phải sửa __lib__/policy.mjs + design doc, KHÔNG thêm bằng'
        + ' project.json / policy-local.json');
  if (!modes.includes(p.defaultMode)) errs.push(`defaultMode "${p.defaultMode}" không nằm trong modes [${modes}]`);
  // Bất biến phải kiểm KIỂU + GIÁ TRỊ, không chỉ "có mặt": renderPolicyBlock bơm thẳng các số này
  // vào MỌI phiên, nên `smartZoneK: "xin chao"` hay `threeStrikes: null` lọt cổng = agent đọc rác.
  if (!isObj(p.invariants)) errs.push('invariants: thiếu hoặc không phải object');
  else {
    for (const k of INVARIANT_NUM_KEYS) {
      const v = p.invariants[k];
      if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0)
        errs.push(`invariants.${k}: phải là số hữu hạn > 0 (thấy: ${JSON.stringify(v)})`);
    }
    // Ca NẶNG NHẤT: cưỡng chế sàn đọc REVIEW_FLOOR_MODELS, còn câu bơm vào context đọc khoá này.
    // Không kiểm ⇒ hai nguồn nói khác nhau và cái agent ĐỌC là cái sai.
    if (p.invariants.reviewFloorModel !== REVIEW_FLOOR_MODEL)
      errs.push(`invariants.reviewFloorModel: phải là "${REVIEW_FLOOR_MODEL}"`
        + ` (thấy: ${JSON.stringify(p.invariants.reviewFloorModel)}) — sàn review là bất biến;`
        + ' "inherit" là cờ NÂNG model, KHÔNG phải một sàn');
  }

  // `?? {}` một mình KHÔNG đủ: `{"modelRouting": null}` làm deepMerge trả null ⇒ `?? {}` ⇒ vòng lặp
  // chạy 0 lần ⇒ exit 0 với bảng TRỐNG. Kẻ hạ sàn không khai `code-reviewer: sonnet` (bị bắt), họ
  // XOÁ CẢ BẢNG (bản trước không bắt). Đây là bất đối xứng: invariants có guard, hai bảng thì không.
  if (!isObj(p.spawnBudget)) errs.push('spawnBudget: thiếu hoặc không phải object');
  if (!isObj(p.modelRouting)) errs.push('modelRouting: thiếu hoặc không phải object');
  else if (!('code-reviewer' in p.modelRouting))
    errs.push('modelRouting.code-reviewer: thiếu — sàn Opus là bất biến, KHÔNG được xoá bằng override');

  // Nhánh validate `policy.gate` của bản gốc đã CHUYỂN sang `config.mjs` (`checkGateCommands`), vì
  // ở mô hình plugin `gate.commands` sống trong `claude_config.json` — nơi `cc-harness gate` thật
  // sự đọc. Chuyển chứ KHÔNG xoá: hai phép kiểm ở đó là lưới thật (mảng rỗng = chạy 0 lệnh rồi ghi
  // sổ "xanh"; lệnh chứa `\n` = chèn được một dòng `- npm test  → exit 0` GIẢ vào sổ máy-đọc).

  for (const [role, byMode] of Object.entries(isObj(p.spawnBudget) ? p.spawnBudget : {})) {
    if (!isObj(byMode)) { errs.push(`spawnBudget.${role}: không phải object`); continue; }
    for (const m of modes) {
      if (!(m in byMode)) { errs.push(`spawnBudget.${role}.${m}: thiếu`); continue; }
      const b = byMode[m];
      if (b === null) continue; // thả ga — hợp lệ
      if (!isObj(b)) { errs.push(`spawnBudget.${role}.${m}: phải là object hoặc null`); continue; }
      for (const k of ['toolCalls', 'tokensK']) {
        // `typeof … !== 'number'` là TẬP CON của `!Number.isFinite` ⇒ mutant tương đương, KHÔNG thừa:
        // giữ để nếu ai đổi `Number.isFinite` → `isFinite` global (ép kiểu: `isFinite('6') === true`)
        // thì toán hạng này còn là lưới duy nhất. Xoá nó ⇒ suite vẫn xanh, lưới mất câm.
        if (typeof b[k] !== 'number' || !Number.isFinite(b[k]) || b[k] < 0)
          errs.push(`spawnBudget.${role}.${m}.${k}: phải là số ≥ 0 (thấy: ${JSON.stringify(b[k])})`);
      }
    }
  }

  for (const [role, byMode] of Object.entries(isObj(p.modelRouting) ? p.modelRouting : {})) {
    if (!isObj(byMode)) { errs.push(`modelRouting.${role}: không phải object`); continue; }
    for (const m of modes) {
      if (typeof byMode[m] !== 'string') errs.push(`modelRouting.${role}.${m}: thiếu hoặc không phải chuỗi`);
    }
    // Bất biến: sàn Opus cho review — mode KHÔNG hạ được. `inherit` hợp lệ vì nó chỉ NÂNG.
    if (role === 'code-reviewer')
      for (const m of modes)
        if (!REVIEW_ROUTING_MODELS.includes(byMode[m]))
          errs.push(`modelRouting.code-reviewer.${m}: vi phạm sàn Opus (thấy "${byMode[m]}")`);
  }
  return errs;
}
