#!/usr/bin/env bash
# SessionStart + PostToolUse(Edit|Write|MultiEdit|NotebookEdit) — codebase-memory TỰ INDEX, không nhắc người.
#
# Vì sao viết lại (1.3.1, theo góp ý user): bản trước chỉ gọi tiện ích ngoài `~/.local/bin/cbm-autosync`
# — máy không có nó thì hook im, project không bao giờ được index, và cổng "graph TRƯỚC, grep SAU" rơi
# vào fail-open ở MỌI lượt (đo: 94 câu "chưa sẵn sàng" trong một phiên). Nguyên tắc mới: **binary có và
# chạy được ⇒ bộ khung chủ động index** — chưa có project ⇒ `index_repository`; có rồi ⇒ re-index nền
# sau khi sửa tệp (debounce) — để codebase luôn có một nơi soi quan hệ, thay vì bảo user đi index.
#
# Chi phí: `index_repository` chạy NỀN, detached, không chặn phiên. Đo repo này (1.470 node): 3,5 giây.
# Debounce `CC_CBM_REINDEX_MIN` giây (mặc định 120) giữa hai lần kích, theo project, để một lô 30 lượt
# Edit không đẻ 30 tiến trình.
#
# Vẫn ưu tiên `cbm-autosync` nếu máy có (tiện ích incremental của user) — chỉ rơi về CLI của binary khi
# không có. Windows: `.cmd/.bat` không chạy (cùng lý do CVE ở `cbm-graph-first.sh`); tệp không đuôi thì
# shell chạy được nên ở đây KHÔNG bị giới hạn như execFile của node.
#
# Nói ra đúng MỘT dòng, và chỉ ở SessionStart khi project CHƯA index (lần đầu): agent biết graph sắp có,
# đừng kết luận "không có graph" ở lượt đầu. Đã index ⇒ im.
set -u

DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
BIN="${CC_CBM_BIN:-$HOME/.local/bin/codebase-memory-mcp}"
SYNC="$HOME/.local/bin/cbm-autosync"
STATE="${CC_CBM_AUTOINDEX_STATE:-${TMPDIR:-/tmp}/cc-cbm-autoindex}"
MIN="${CC_CBM_REINDEX_MIN:-120}"

# Dự án khai `integrations.cbm: "off"` ⇒ im lặng tuyệt đối (lời hứa của khung). Đọc bằng grep, không node.
if [ -f "$DIR/claude_config.json" ] && grep -qE '"cbm"[[:space:]]*:[[:space:]]*"off"' "$DIR/claude_config.json" 2>/dev/null; then
  exit 0
fi

# Chọn binary chạy được. `.exe` cho Windows; `.cmd/.bat` bỏ.
RUN=""
for c in "$BIN" "$BIN.exe"; do
  [ -f "$c" ] && [ -x "$c" ] && RUN="$c" && break
done
[ -n "$RUN" ] || [ -x "$SYNC" ] || exit 0

# Tên project của codebase-memory suy từ đường dẫn — PHẢI giống `cbm-graph-first.sh` (NAME).
NAME="$(printf '%s' "$DIR" | sed 's#^/##; s#/#-#g')"
KEY="$(printf '%s' "$NAME" | sed 's#[^A-Za-z0-9._-]#_#g')"
mkdir -p "$STATE" 2>/dev/null || exit 0
STAMP="$STATE/$KEY.at"

# Debounce theo mtime (portable: không dựa vào `stat -c` vs `stat -f`).
if [ -f "$STAMP" ] && [ -z "$(find "$STAMP" -mmin +"$(( (MIN + 59) / 60 ))" 2>/dev/null)" ]; then
  # Đã kích trong cửa sổ debounce ⇒ không kích lại. (find -mmin +N: tệp CŨ hơn N phút mới hiện.)
  exit 0
fi

input=$(cat)
event="$(printf '%s' "$input" | sed -n 's/.*"hook_event_name"[[:space:]]*:[[:space:]]*"\([A-Za-z]*\)".*/\1/p')"

# SessionStart: project chưa có trong graph ⇒ nói một dòng (lần đầu). Kiểm bằng CLI, timeout ngắn.
say=""
if [ "$event" = "SessionStart" ] && [ -n "$RUN" ]; then
  st="$("$RUN" cli index_status --project "$NAME" 2>/dev/null | grep -m1 '^{' || true)"
  case "$st" in
    *'"status":"ready"'*) ;;   # có graph ⇒ im, re-index nền vẫn chạy bên dưới
    *) say="ℹ️ codebase-memory: project \"$NAME\" chưa có graph — bộ khung đang index NỀN (repo vừa, vài giây). Lượt tra cứu đầu có thể còn rơi về grep; sau đó dùng search_graph/trace_path (project=\"$NAME\") trước." ;;
  esac
fi

# Kích index nền, detached, im lặng. Ưu tiên cbm-autosync (incremental) nếu có.
touch "$STAMP" 2>/dev/null || true
if [ -x "$SYNC" ]; then
  ( CBM_DEBOUNCE="${CBM_DEBOUNCE:-2}" nohup "$SYNC" index "$DIR" >/dev/null 2>&1 & ) >/dev/null 2>&1
else
  ( nohup "$RUN" cli index_repository --repo-path "$DIR" >/dev/null 2>&1 & ) >/dev/null 2>&1
fi

if [ -n "$say" ]; then
  esc="$(printf '%s' "$say" | sed 's/\\/\\\\/g; s/"/\\"/g')"
  printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$esc"
fi
exit 0
