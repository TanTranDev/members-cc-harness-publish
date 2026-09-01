#!/usr/bin/env bash
# SessionStart + PostToolUse (Edit|Write|MultiEdit|NotebookEdit) — lên lịch
# re-index codebase-memory-mcp ở NỀN (cbm-autosync tự debounce + lock, full mode,
# không bao giờ chặn caller). Mục đích: graph luôn tươi để mọi agent tin và dùng
# bậc TÌM của bảng quyết định CLAUDE.md §7 thay vì grep cả repo.
# Máy chưa cài cbm-autosync ⇒ thoát im lặng (exit 0, không output).
#
# `set -u` cho đồng bộ với mọi hook khác: mọi biến ở dưới đều đã có mặc định `${x:-…}` nên nó
# không đổi hành vi hôm nay, chỉ chặn một lần sửa sau này lỡ tham chiếu biến chưa đặt.
set -u
BIN="$HOME/.local/bin/cbm-autosync"
[ -x "$BIN" ] || exit 0
CBM_DEBOUNCE="${CBM_DEBOUNCE:-2}" "$BIN" index "${CLAUDE_PROJECT_DIR:-$(pwd)}" >/dev/null 2>&1 || true
exit 0
