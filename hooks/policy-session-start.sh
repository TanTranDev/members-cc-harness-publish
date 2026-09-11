#!/usr/bin/env bash
# SessionStart (startup|resume|clear|compact) — bơm khối ⚙️ POLICY đã resolve vào context.
#
# Bơm ở MỌI mode (kể cả quality): bộ luật cố ý SẠCH số, policy là nguồn sự thật DUY NHẤT của mọi
# ngưỡng. Im ở quality thì agent không biết ngưỡng nào đang có hiệu lực.
# No silent skip: hỏng ⇒ WARN nhìn thấy được, KHÔNG câm. Nhưng luôn exit 0 — không làm vỡ phiên.
set -u

# HAI GỐC, đừng gộp: SELF_ROOT tìm RUỘT của chính plugin (cli.mjs), PLUGIN_ROOT tìm TÀI SẢN plugin
# (policy/defaults.json). Lô B đã ăn MODULE_NOT_FOUND vì dùng CLAUDE_PLUGIN_ROOT cho cả hai.
SELF_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$SELF_ROOT}"
checker="$SELF_ROOT/bin/lib/cli.mjs"
proj="${CLAUDE_PROJECT_DIR:-$(pwd)}"

emit() {
  local s="$1"
  s="${s//\\/\\\\}"; s="${s//\"/\\\"}"; s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"; s="${s//$'\t'/\\t}"
  # Quét nốt ký tự điều khiển THÔ còn lại (ESC màu, 0x01…): JSON cấm chúng ở dạng trần ⇒ context vỡ.
  # Phải đứng SAU các phép trên — chúng đã biến \n \r \t thành hai ký tự thường, nên dòng này chỉ
  # còn chạm thứ thực sự lạ. Bề mặt này mở vì `2>&1` gộp mọi stderr tương lai vào khối.
  s="${s//[[:cntrl:]]/}"
  printf '{\n  "hookSpecificOutput": {\n    "hookEventName": "SessionStart",\n    "additionalContext": "%s"\n  }\n}\n' "$s"
  exit 0
}

# Mọi đường hỏng đi qua đây: exit 0 (không vỡ phiên) nhưng NÓI RA — gate câm mà xanh là
# lớp lỗi đắt nhất của bộ khung (§0 "No silent skip").
warn() {
  emit "⚠️ POLICY GÃY — $1
Bộ khung đang chạy KHÔNG có tham số vận hành nào được nạp. Chẩn đoán:
  cc-harness policy --check
Chưa sửa xong ⇒ KHÔNG nhận task điều phối subagent (§0)."
}

command -v node >/dev/null 2>&1 || warn "không có \`node\` trong PATH (dự án: $proj)"
[ -f "$checker" ] || warn "bản cài plugin hỏng: thiếu $checker"

# `2>&1`: WARN của policy (vd lùi mode vì dự án thu hẹp `modes`) phải vào context phiên chứ không
# rơi xuống đất — người dùng cần biết mình đang thực sự ở mode nào.
block=$(node "$checker" policy --render --root "$proj" --plugin-root "$PLUGIN_ROOT" 2>&1) \
  || warn "policy --render thất bại:
$block"
[ -n "$block" ] || warn "policy --render trả về RỖNG (dự án: $proj)"

# `-n` KHÔNG đủ: vì `2>&1`, một dòng stderr ĐƠN ĐỘC cũng làm $block khác rỗng ⇒ rác được bơm vào
# phiên y như policy thật, không một dòng chẩn đoán nào (đường thật: `--render` ghi stdout qua pipe
# rồi exit — stdout async có thể cụt trong khi stderr vẫn tới). Đòi ĐÚNG sentinel của khối.
case "$block" in
  *"⚙️ POLICY"*) : ;;
  *) warn "policy --render KHÔNG trả khối \`⚙️ POLICY\` — output nhận được:
$block" ;;
esac

emit "$block"
