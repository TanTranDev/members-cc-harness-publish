// inject.mjs — SessionStart: trộn luật rồi bơm vào context của phiên.
//
// LUẬT CỨNG: hook này LUÔN exit 0 và LUÔN in JSON hợp lệ. Một hook chết hoặc in rác sẽ làm hỏng
// phiên của người dùng, và cái giá đó lớn hơn mọi thứ nó định bảo vệ. Sai sót được NÓI RA trong
// nội dung bơm — không im lặng, cũng không chặn.
//
// Escape do JSON.stringify lo. Bản bash cũ tự escape bằng chuỗi thay thế; bộ luật có backslash,
// nháy kép, tab và emoji nên đó là quả bom hẹn giờ.
import path from 'node:path';

import { renderRules } from './render.mjs';
import { resolveDesign, resolveSkills, reviewContext, designContext } from './design.mjs';
import { selectCore } from './tier.mjs';

const HEADER = '<EXTREMELY_IMPORTANT>\nĐây là BỘ LUẬT làm việc của dự án này, do plugin cc-harness trộn từ bản gốc của bộ khung cộng phần override khai trong claude_config.json. Tuân thủ như chỉ thị của user.\n</EXTREMELY_IMPORTANT>\n\n';

/**
 * Dựng phần nội dung bơm. Tách khỏi I/O để test được không cần tiến trình con.
 * @param {object} result kết quả renderRules
 * @param {Array} design entry từ resolveDesign — mặc định rỗng để test cũ không phải đổi
 */
export function buildContext(result, design = [], skills = undefined, review = []) {
  const notes = [];

  for (const e of result.errors) {
    if (e.code === 'config-missing') {
      notes.push(`⚠️ Dự án CHƯA có claude_config.json — đang chạy bộ luật gốc, không có tuỳ biến nào. Sinh bằng \`cc-harness init\`.`);
    } else if (e.code === 'base-missing') {
      notes.push(`⛔ Bản cài cc-harness hỏng: ${e.message}. KHÔNG có bộ luật nào được nạp — báo user cài lại plugin trước khi nhận task.`);
    } else {
      notes.push(`⚠️ Lỗi cấu hình luật — ${e.key ? e.key + ': ' : ''}${e.message}`);
    }
  }

  // Gỡ luật phải ỒN: nhắc MỖI phiên, kể cả phiên ăn cache. Đây là cái giá của việc cho phép
  // `op: remove` — nếu nó im lặng thì nó là lỗ luật, không phải tuỳ biến.
  for (const rm of result.removed) {
    notes.push(`⚠️ Dự án này đã GỠ mục ${rm.section} khỏi bộ luật, lý do: ${rm.reason}`);
  }

  // Lọc tầng là bước CUỐI, sau khi override đã áp cho TOÀN BỘ văn bản. Đảo thứ tự thì override
  // vào một mục `ref` sẽ không bao giờ được áp — lỗi câm, và chỉ lộ ra ở dự án có override.
  let body = result.text ?? null;
  let index = '';
  if (body !== null) {
    try {
      const t = selectCore(body);
      body = t.core;
      index = t.index;
      for (const w of t.warnings) notes.push(`⚠️ ${w.message}`);
    } catch (e) {
      // Lọc tầng hỏng ⇒ bơm TOÀN VĂN kèm cảnh báo. Thà tốn context còn hơn phiên không có luật;
      // và phải NÓI RA, vì "im lặng bơm nhiều hơn dự tính" là cách ngân sách trôi mà không ai thấy.
      notes.push(`⚠️ không lọc được tầng luật (${e && e.message}) ⇒ đang bơm TOÀN VĂN bộ luật. Báo user; phiên vẫn chạy đúng luật, chỉ tốn context.`);
    }
  }

  const ds = designContext(design, skills, review);
  const head = [...notes, ...ds].length ? [...notes, ...ds].join('\n') + '\n\n' : '';
  const tail = index ? `\n\n---\n\n${index}\n` : '';
  return HEADER + head + (body ?? '(không nạp được bộ luật — xem cảnh báo ở trên)') + tail;
}

export function run(env = process.env) {
  const root = env.CLAUDE_PROJECT_DIR || process.cwd();
  const pluginRoot = env.CLAUDE_PLUGIN_ROOT;

  if (!pluginRoot) {
    return {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: '⚠️ cc-harness: không biết ROOT của plugin (CLAUDE_PLUGIN_ROOT rỗng) ⇒ KHÔNG nạp được bộ luật. Phiên này đang chạy không có luật của bộ khung — báo user kiểm tra cài đặt plugin.',
      },
    };
  }

  let result;
  try {
    result = renderRules({ root: path.resolve(root), pluginRoot });
  } catch (e) {
    return {
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: `⚠️ cc-harness gặp lỗi không lường trước khi trộn luật: ${e && e.message}. Phiên chạy KHÔNG có luật bộ khung — báo user.`,
      },
    };
  }

  let design = [];
  let skills;
  try {
    design = resolveDesign(result.config, path.resolve(root));
  } catch { /* routing hỏng KHÔNG được kéo theo bộ luật — luật vẫn phải tới tay */ }
  try {
    skills = resolveSkills(result.config);
  } catch { /* như trên: skill routing hỏng thì mất một lời nhắc, không được mất cả bộ luật */ }
  let review = [];
  try {
    review = reviewContext(result.config);
  } catch { /* như trên */ }

  return {
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: buildContext(result, design, skills, review) },
  };
}

// Entry point của hook: in JSON rồi thoát 0, không có nhánh nào khác.
if (process.argv[1] && process.argv[1].endsWith('inject.mjs')) {
  process.stdout.write(JSON.stringify(run(), null, 2) + '\n');
  process.exit(0);
}
