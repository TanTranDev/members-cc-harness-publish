// design-gate.mjs — PreToolUse(Edit|Write): cổng nạp skill design system trước khi sửa file UI.
//
// VÌ SAO LÀ DENY CHỨ KHÔNG PHẢI WARN — đo được, không phải suy đoán:
// tài liệu hooks nói `systemMessage` **chỉ hiện cho user**, không vào context model; PreToolUse
// chỉ có `permissionDecision` là chạm tới Claude. Bản warn-mode đầu tiên đã chạy thật trong một
// phiên `claude -p`: Claude sửa `.tsx` mà không nạp skill nào và tự khai ra rằng "không có guard
// runtime". Warn thuần vì thế không đạt mục tiêu — nó chỉ nhắc người, không nhắc máy.
//
// Cơ chế lấy nguyên từ "graph TRƯỚC, grep SAU" của bộ khung cũ (đã chạy thật, 28/28 mutant chết):
//   DENY lượt sửa UI ĐẦU TIÊN của mỗi phiên, kèm lý do chỉ đúng skill phải nạp
//   → Claude ĐỌC được lý do, nạp skill, thử lại → từ đó im hết phiên.
//
// Ba thứ cố ý KHÔNG làm:
//   - Không chặn quá một lần mỗi phiên (sentinel theo `session_id`) — chặn mãi là kẹt việc.
//   - Không chặn khi thiếu tiền đề (chưa cấu hình, không khai design_system, file không phải UI).
//   - Van an toàn: quá `CC_DESIGN_MAX_DENY` lần vẫn chưa qua ⇒ nhường đường kèm cảnh báo.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadConfig } from './config.mjs';
import { resolveDesign, surfacesFor } from './design.mjs';

function sentinelDir() {
  const base = process.env.CLAUDE_PLUGIN_DATA || path.join(os.tmpdir(), 'cc-harness-data');
  return path.join(base, 'design-gate');
}

/** Tên sentinel an toàn cho mọi hệ tệp — session_id do host cấp, không tin là đã sạch. */
const safe = (s) => String(s || 'no-session').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);

/**
 * @param {object} payload payload PreToolUse (đã JSON.parse)
 * @param {{root?:string, once?:boolean}} opts
 * @returns {{systemMessage?:string}} object rỗng = không nói gì
 */
export function checkEdit(payload, { root, once = true } = {}) {
  const file = payload?.tool_input?.file_path;
  if (!file) return {};

  const projectRoot = root || payload?.cwd || process.cwd();
  const cfg = loadConfig(projectRoot);
  // Chưa cấu hình / config hỏng ⇒ IM ở guard này. Việc nói ra là của hook SessionStart; nhắc lại
  // ở mỗi lượt Edit chỉ tạo tiếng ồn cho cùng một thông tin.
  if (!cfg.ok) return {};

  const entries = resolveDesign(cfg.config, projectRoot);
  if (!entries.length) return {};

  const hit = surfacesFor(file, entries);
  if (!hit.length) return {};

  const names = hit.map((e) => `\`${e.ref}\``).join(' hoặc ');
  const missing = hit.filter((e) => e.exists === false);
  const warn = missing.length ? ` ⚠️ ${missing.map((m) => m.hint).join(' · ')}` : '';

  let count = 0;
  if (once) {
    const f = path.join(sentinelDir(), safe(payload?.session_id));
    try {
      count = Number(fs.readFileSync(f, 'utf8')) || 0;
      if (count > 0) return {}; // phiên này đã bị chặn một lần rồi ⇒ nhường đường, im
    } catch { /* chưa có sentinel ⇒ đây là lượt đầu */ }

    // Không ghi được sentinel ⇒ KHÔNG chặn. Chặn mà không nhớ là đã chặn thì mỗi lượt Edit đều
    // bị chặn — kẹt cứng phiên. Thà mất guard còn hơn khoá cửa rồi vứt chìa.
    try {
      fs.mkdirSync(sentinelDir(), { recursive: true });
      fs.writeFileSync(f, '1');
    } catch (e) {
      return { systemMessage: `🎨 cc-harness: không ghi được sentinel (${(e && e.code) || e}) ⇒ cổng design tắt cho phiên này. Nhớ nạp ${names} trước khi sửa UI.` };
    }
  }

  const max = Number(process.env.CC_DESIGN_MAX_DENY);
  if (Number.isFinite(max) && max <= 0) {
    return { systemMessage: `🎨 cc-harness: cổng design bị tắt bằng CC_DESIGN_MAX_DENY=${max}. Design system: ${names}.` };
  }

  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        `🎨 cc-harness — cổng design system (chặn ĐÚNG MỘT LẦN mỗi phiên, lượt sau tự qua).\n\n` +
        `Bạn đang sửa file UI: ${path.basename(file)}\n` +
        `Design system của dự án này: ${names}${warn}\n\n` +
        `HÃY LÀM: nạp skill trên (Skill tool) rồi thực hiện lại đúng thao tác Edit/Write vừa rồi — ` +
        `lần này sẽ qua. Nếu thay đổi này KHÔNG đụng gì tới hình thức (đổi logic thuần, sửa comment, ` +
        `đổi tên biến) thì cứ làm lại ngay, cổng đã mở.`,
    },
  };
}
