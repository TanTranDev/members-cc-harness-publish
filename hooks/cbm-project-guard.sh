#!/usr/bin/env bash
# PreToolUse (matcher mcp__codebase-memory-mcp__.*) — net an toàn: khi gọi bất kỳ tool
# codebase-memory-mcp mà THIẾU/RỖNG `project`, nhắc agent (allow + additionalContext,
# KHÔNG chặn cứng) kèm tên project gợi ý theo thư mục hiện tại. Có `project` ⇒ im lặng.
# Generic, không hardcode dự án; không phụ thuộc mạng/binary. Không bao giờ chặn tool.
# KHÔNG cần gate binary như cbm-project-hint.sh: matcher chỉ khớp lời gọi MCP thật —
# máy không có codebase-memory-mcp thì hook này nghiễm nhiên không bao giờ chạy.
set -euo pipefail

DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
NAME="$(printf '%s' "$DIR" | sed 's#^/##; s#/#-#g')"

# Đọc stdin JSON (tool_input.project). Có project không rỗng ⇒ exit 0 im lặng (allow
# bình thường). Thiếu/rỗng ⇒ in nhắc. Lỗi parse ⇒ im lặng (không bao giờ cản tool).
node -e '
let raw = "";
process.stdin.on("data", d => raw += d);
process.stdin.on("end", () => {
  const name = process.argv[1] || "";
  let data;
  try { data = JSON.parse(raw) || {}; } catch (e) { process.exit(0); }
  // CHỈ nhắc cho tool THỰC SỰ nhận `project` (đúng danh sách CLAUDE.md §8). Các tool
  // khác của cùng server KHÔNG nhận project — list_projects (không param), index_repository
  // (repo_path), get_graph_schema, detect_changes… — nên im lặng, tránh nhắc SAI.
  // Whitelist (thà bỏ sót còn hơn misinform): tool mới không-project không bị nhắc nhầm.
  const PROJECT_TOOLS = new Set(["search_graph","trace_path","index_status","get_code_snippet","query_graph","get_architecture","search_code"]);
  const tool = String(data.tool_name || "").split("__").pop();
  if (!PROJECT_TOOLS.has(tool)) process.exit(0);
  const project = (data.tool_input || {}).project;
  if (project !== undefined && project !== null && String(project).trim() !== "") process.exit(0);
  const ctx = [
    "⚠️ codebase-memory: lời gọi này THIẾU tham số `project` (REQUIRED).",
    "Truyền project để tránh tra nhầm project mặc định → báo nhầm \"not found\".",
    "Project khớp thư mục hiện tại (quy ước path): " + name,
    "Làm dự án ở thư mục khác ⇒ list_projects lấy tên đúng.",
  ].join("\n");
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      additionalContext: ctx
    }
  }));
  process.exit(0);
});
'  "$NAME"
exit 0
