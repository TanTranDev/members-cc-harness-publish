#!/usr/bin/env bash
# PreToolUse(Edit|Write|MultiEdit) — cổng nạp skill design system trước khi sửa file UI.
#
# DENY lượt sửa UI ĐẦU TIÊN mỗi phiên, rồi mở hẳn. KHÔNG phải warn-mode: `systemMessage` của hook
# chỉ hiện cho USER, không vào context của model — nhắc suông thì Claude không đọc được, chỉ
# `permissionDecision: deny` mới tới được nó.
#
# Nhưng bản thân hook thì KHÔNG BAO GIỜ exit ≠ 0: quyết định nằm ở JSON trên stdout, còn exit code
# khác 0 làm hỏng cả lượt Edit. Không ghi được sentinel cũng KHÔNG được DENY (xem design-gate.mjs:
# chặn mà không nhớ đã chặn = khoá cửa rồi vứt chìa).
set -u

SELF_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
command -v node >/dev/null 2>&1 || exit 0   # thiếu node ⇒ im; SessionStart đã nói việc này rồi

node "$SELF_ROOT/bin/lib/design-gate-cli.mjs"
exit 0
