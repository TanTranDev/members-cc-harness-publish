#!/usr/bin/env bash
# PreToolUse — nạp tiêu chí "assert gì thì có nghĩa" TRƯỚC lượt viết test component đầu tiên.
#
# Vì sao có hook này: tiêu chí sống trong skill `writing-component-tests`, nhưng skill chỉ trồi lên
# khi model nhớ gọi nó. Đo được ở cổng anh em (`cbm-graph-first.sh`): sau một `/compact`, phiên tụt
# về thói quen cũ dù văn bản luật vẫn được bơm đủ mỗi lượt. Tài liệu Anthropic nói thẳng cùng điều:
# chỉ thị trong CLAUDE.md là *advisory*, hook là *deterministic*.
#
# ⚠️ NÓ NHẮC, KHÔNG PHÁN QUYẾT — và đây là ràng buộc THIẾT KẾ, không phải chỗ chưa làm xong:
# không tồn tại cách TĨNH nào phân biệt `toBe(tokens.x)` đang chép hằng (vô giá trị) với
# `toBe(tokens.x)` đang ghim một nhánh điều kiện (có giá trị) — đã tra hết eslint-plugin-jest (71
# rule), eslint-plugin-vitest, eslint-plugin-testing-library, eslint-react. Custom rule hỏng ở CẢ
# HAI chiều: báo nhầm đúng ca cần giữ, và mù với literal. Nên cổng này KHÔNG có gì để `exit 1`;
# việc duy nhất nó làm được là đảm bảo tiêu chí có mặt trong context trước khi gõ assert đầu tiên.
#
# ⚠️ PHẠM VI THẬT — hẹp hơn trực giác: đơn vị nhớ là `session_id`, và **subagent dùng CHUNG
# `session_id` với phiên chính** (đo 2026-08-04 ở lô cbm-graph-first). Main bị nhắc rồi thì
# `implementer` spawn sau KHÔNG được nhắc. Payload PreToolUse không có trường nào phân biệt hai
# loại ⇒ đây là GIỚI HẠN ĐƯỢC KHAI, không phải lỗi ẩn. Lời giao việc cho subagent phải tự mang
# tiêu chí. `/compact` và `/clear` cũng giữ nguyên `session_id` ⇒ tái vũ trang bằng
# `cbm-graph-first-rearm.sh` (SessionStart `clear|compact`), không phải bằng file này.
#
# HAZARD — vỡ được theo HAI chiều ngược nhau; mọi nhánh dưới đây phục vụ một trong hai:
#   (a) DENY sai/kẹt ⇒ chặn công việc thật. Chống bằng: phạm vi hẹp (chỉ `.test.tsx`/`.spec.tsx`),
#       chặn ĐÚNG MỘT lượt, và fail-OPEN ở mọi tiền đề thiếu — thiếu node · JSON hỏng · không ghi
#       được state.
#   (b) Cổng CÂM ⇒ luật chết mà gate vẫn xanh. Chống bằng: thông điệp mang ĐỦ tiêu chí (không chỉ
#       trỏ đường), cộng lưới mutation từng nhánh ở `.claude/templates/component-test-gate.test.mjs`.
set -u

input=$(cat)

# Thiếu node ⇒ nhường đường IM LẶNG. Cố ý không WARN: khán giả của WARN ở đây là máy đã thiếu chính
# công cụ dựng WARN, và `check-setup.sh` đã gate `node` ở REQUIRED_TOOLS (cùng lý lẽ với
# `cbm-graph-first.sh`). Kiểm TRƯỚC `sed` để PATH hỏng không rơi vào nhánh khác.
command -v node >/dev/null 2>&1 || exit 0

DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
# Cùng quy ước tên với `cbm-graph-first.sh`: bỏ `/` đầu, còn lại → `-`.
NAME="$(printf '%s' "$DIR" | sed 's#^/##; s#/#-#g')"
STATE="${CC_COMPONENT_TEST_GATE_STATE:-${TMPDIR:-/tmp}/cc-component-test-gate}"

# `input` đã hút hết stdin ở trên ⇒ PHẢI pipe lại cho node, không thì node đọc stdin RỖNG và thoát
# im lặng — hook câm 100% mà `exit 0`, đúng lớp false-negative im lặng §0 cấm.
printf '%s' "$input" | node -e '
const fs = require("fs");
const path = require("path");

const [NAME, STATE] = process.argv.slice(1);

// Chỉ lượt GHI mới tính. Read/Grep/Bash không tạo ra assert nào.
const WRITE = new Set(["Edit", "Write", "MultiEdit"]);

// Phạm vi HẸP có chủ đích: chỉ tệp test DỰNG CÂY GIAO DIỆN. `.test.ts` (logic thuần) nằm ngoài —
// tiêu chí của cổng nói về assert trên cây React, áp cho tệp không dựng cây là lời khuyên không
// dùng được, và lời khuyên không dùng được dạy người đọc bỏ qua mọi lời khuyên tiếp theo.
const RENDER_TEST = /\.(test|spec)\.tsx$/;

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let data;
  try { data = JSON.parse(raw) || {}; } catch { process.exit(0); }   // JSON hỏng ⇒ không bao giờ cản
  if (!WRITE.has(String(data.tool_name || ""))) process.exit(0);

  const file = String((data.tool_input || {}).file_path || "");
  if (!RENDER_TEST.test(file)) process.exit(0);

  const sid = String(data.session_id || "nosid");
  // State theo (project, phiên) và đặt ở TMPDIR — KHÔNG trong repo: state phiên lẫn vào working
  // tree sẽ làm bẩn DIRTY hash của ledger.
  const key = `${NAME}__${sid.replace(/[^\w.-]/g, "_")}`;
  const okFile = path.join(STATE, `${key}.ok`);

  if (fs.existsSync(okFile)) process.exit(0);        // đã nhắc ⇒ im, đường phổ biến nhất

  const emit = (o) => {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", ...o } }));
    process.exit(0);
  };

  // Ghi state TRƯỚC khi chặn. Ghi hỏng ⇒ PHẢI nhường đường: không ghi được thì lượt sau cũng không
  // ghi được, tức cổng chặn VĨNH VIỄN không lối thoát — chiều hazard (a) dạng nặng nhất. Bài học
  // lấy nguyên từ `cbm-graph-first.sh`, nơi lỗi này đã xảy ra thật (STATE chmod 0555 ⇒ deny 6/6).
  try {
    fs.mkdirSync(STATE, { recursive: true });
    fs.writeFileSync(okFile, "");
  } catch (e) {
    // Cố ý KHÔNG set `permissionDecision:"allow"`: chỉ cần *không chặn*; "allow" tường minh sẽ bỏ
    // qua các lớp quyền khác — quyền tối thiểu.
    return emit({
      additionalContext:
        `⚠️ Cổng test-component không ghi được state tại ${STATE} (${e?.code ?? "lỗi ghi"}) ⇒ nhường ` +
        `đường. Không ghi được thì KHÔNG được chặn, vì lượt sau cũng hỏng y hệt ⇒ kẹt vĩnh viễn. ` +
        `Sửa quyền ghi thư mục đó, hoặc đặt CC_COMPONENT_TEST_GATE_STATE.`,
    });
  }

  emit({
    permissionDecision: "deny",
    permissionDecisionReason:
      `🧪 Test chỉ nên phải sửa khi có BEHAVIOR CHANGE (SWE at Google ch.12).\n` +
      `Bẫy hai đầu: toBe(tokens.x) = tautology (không bao giờ đỏ vì lý do đúng) · toBe(28) = ` +
      `change-detector (đỏ oan mỗi lần đổi token).\n` +
      `⇒ Assert QUAN HỆ (a ≠ b, a ≤ b) hoặc HÀNH VI quan sát được — KHÔNG assert GIÁ TRỊ.\n` +
      `Tầng này KHÔNG trả lời được: clip · tràn · lệch · tương phản · animation ⇒ dùng bằng chứng mắt.\n` +
      `Pattern đầy đủ + mount-counter cho bug remount: skill "writing-component-tests".\n\n` +
      `(Nhắc MỘT lần mỗi phiên. Gửi lại lượt ghi là xong — cổng này không phán quyết đúng/sai, ` +
      `nó chỉ nạp tiêu chí.)`,
  });
});
' "$NAME" "$STATE"
exit 0
