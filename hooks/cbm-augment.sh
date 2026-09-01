#!/usr/bin/env bash
# PreToolUse (Grep|Glob|Bash) — nhờ codebase-memory-mcp bổ sung context graph cho
# kết quả tìm kiếm (graph-augmented search). KHÔNG bao giờ chặn tool call.
#
# Vì sao matcher có `Bash` (thêm 2026-07-29): đo trên session `dazzling-discovering-raccoon`
# (mini_chat_app) — agent khám phá codebase bằng **26 tool call, 0 Grep/Glob, 19 lệnh dò-file
# bằng Bash** ⇒ hook matcher `Grep|Glob` CÂM 100%, và graph chỉ được nạp SAU khi đã trình
# phương án cho user (phương án đó thiếu 2 caller + 4 call site mà graph tìm ra ngay).
#
# Vì sao phải DỊCH thay vì chỉ thêm matcher: `hook-augment` của BIN lọc theo `tool_name` —
# đã đo, `Bash` cho **0 byte** kể cả khi command chứa grep, kể cả khi nhét `.tool_input.pattern`.
# Thêm matcher mà không dịch = land một thay đổi CÂM, đúng lớp lỗi hook này đang vá.
#
# Phạm vi có chủ đích: CHỈ lệnh có PATTERN tra được (`grep`/`rg`). `cat`/`ls`/`wc`/`find` là
# đọc file đã biết tên — graph không giúp, nên không augment (đo: 6/21 lệnh Bash dịch được).
# Máy chưa cài codebase-memory-mcp ⇒ thoát im lặng Ở ĐÂY, vì `cbm-project-hint.sh` đã WARN
# một lần đầu phiên; WARN lại trước mỗi lệnh Bash là ồn, không phải thông tin.
set -u

input=$(cat)

BIN="$HOME/.local/bin/codebase-memory-mcp"
[ -x "$BIN" ] || exit 0

# Thiếu jq ⇒ KHÔNG được giết đường cũ: `Grep|Glob` vốn chạy được mà không cần jq (BIN tự đọc
# stdin), nên fallback pipe nguyên văn. `Bash` thì BIN tự trả 0 byte — mất phần dịch, nhưng
# mất-im-lặng-một-tính-năng-mới còn hơn giết-im-lặng-một-tính-năng-đang-có. (`check-setup.sh`
# khai jq ở REQUIRED_TOOLS nên thiếu jq đã ồn ở cổng setup.)
if ! command -v jq >/dev/null 2>&1; then
  printf '%s' "$input" | "$BIN" hook-augment 2>/dev/null
  exit 0
fi

tool=$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null) || exit 0
case "$tool" in
  Grep | Glob)
    # Đường cũ: BIN tự hiểu 2 tool này ⇒ pipe NGUYÊN VĂN, không chạm gì.
    printf '%s' "$input" | "$BIN" hook-augment 2>/dev/null
    exit 0
    ;;
  Bash) ;;
  *) exit 0 ;;
esac

cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)
[ -n "$cmd" ] || exit 0

# Lọc RẺ trước khi gọi node: hook này chạy trước MỌI lệnh Bash của mọi phiên. Chi phí đo được
# (2026-07-29): lệnh thường ~11 ms (jq + case) · lệnh chạm `grep`/`rg ` ở BẤT KỲ vị trí — kể cả
# `git log --grep=`, `--arg`, hoặc trong chuỗi dữ liệu — ~33 ms · grep thật ~38 ms.
case "$cmd" in
  *grep* | *rg\ *) ;;
  *) exit 0 ;;
esac

# Trích chuỗi tìm kiếm: token trong nháy đầu tiên sau `grep`/`rg` (bắt cả lệnh gộp
# `ls x && grep -rn "Y" z`), fallback token trần đầu tiên không phải cờ.
pat=$(printf '%s' "$cmd" | node -e '
let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
  // Lần xuất hiện CUỐI của grep/rg. Phải là CUỐI, không phải đầu: với `grep -rn "A" a && grep
  // -rn "B" b`, lấy hit ĐẦU làm regex nháy vắt qua biên lệnh (ghép nháy đóng của A với nháy mở
  // của B) ⇒ pattern rác `a && grep -rn` ⇒ BIN trả 0 byte ⇒ hook CÂM ở đúng hình dạng lệnh phổ
  // biến. matchAll + lấy phần tử cuối, KHÔNG dùng regex không-global (nó dừng ở hit đầu).
  const hits = [...s.matchAll(/(?:^|[\s;&|(])(?:grep|rg)\s+/g)];
  if (!hits.length) return;
  const h = hits[hits.length - 1];
  const rest = s.slice(h.index + h[0].length);
  const q = rest.match(/(["\x27])([^"\x27]{2,})\1/);   // "X" hoặc \x27X\x27
  let p = q ? q[2] : null;
  if (p === null) {
    // Token TRẦN: siết thành hình dạng ĐỊNH DANH ≥ 3 ký tự. Lỏng hơn thì `grep` nằm trong chuỗi
    // dữ liệu (`echo "use grep to find" && ls`) cho ra pattern rác kiểu `to` — vô hại vì BIN trả
    // 0 byte, nhưng vẫn tốn một lần gọi cho mỗi lệnh như thế.
    for (const tok of rest.split(/\s+/)) {
      if (!tok || tok.startsWith("-")) continue;
      if (/^[A-Za-z_$][\w$.]{2,}$/.test(tok)) p = tok;
      break;                                            // chỉ xét token đầu không phải cờ
    }
  }
  if (!p) return;
  p = p.replace(/^\W+|\W+$/g, "");                      // gọt dấu thừa hai đầu
  if (p.length < 2 || p.length > 200) return;           // trần: pattern dài là dữ liệu, không phải tên
  // Chính TÊN LỆNH không bao giờ là thứ cần tra. Bắt idiom `… | grep X | grep -v grep`: ở đó
  // lấy-CUỐI cho ra `grep`. Đây là giá của việc lấy CUỐI thay vì ĐẦU — trade-off có chủ đích,
  // vì `grep A && grep B` (hai pattern độc lập) phổ biến hơn và lấy-ĐẦU ra pattern rác ở đó.
  if (/^(?:grep|egrep|fgrep|rg)$/.test(p)) return;
  process.stdout.write(p);
});' 2>/dev/null) || exit 0
[ -n "$pat" ] || exit 0

# Dịch sang dạng BIN hiểu. Giữ session_id/cwd để BIN phân giải đúng project.
printf '%s' "$input" \
  | jq --arg p "$pat" '{session_id, cwd, tool_name:"Grep", tool_input:{pattern:$p}}' 2>/dev/null \
  | "$BIN" hook-augment 2>/dev/null
exit 0
