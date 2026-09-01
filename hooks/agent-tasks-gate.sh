#!/usr/bin/env bash
# PreToolUse — cổng "claim task TRƯỚC khi sửa code" (cổng cứng số 2 của bộ luật, §0; chi tiết §14).
#
# Vì sao có hook này: ở v1.0.0, `agent_tasks` có khoá config + probe doctor + tiền tố skill nhưng
# **0 dòng luật** — README tự khai "chỗ nối đã chừa sẵn". Không có gì để tuân thủ, nên "thường xuyên
# bỏ qua agent-tasks" không phải lỗi tuân thủ mà là lỗ trong bộ luật. v1.1.0 viết §14, và đây là
# phần cưỡng chế của nó.
#
# ĐƠN VỊ VŨ TRANG LÀ MỘT YÊU CẦU CỦA USER, không phải một phiên — cùng khuôn với `cbm-graph-first.sh`,
# và cùng được `cbm-graph-first-rearm.sh` vũ trang lại. Lý do y hệt: mỗi yêu cầu mới là một việc mới,
# và việc mới cần một claim mới.
#
# HAZARD — cổng này vỡ được theo HAI chiều ngược nhau; mọi nhánh dưới đây phục vụ một trong hai:
#   (a) DENY sai/kẹt ⇒ agent không sửa được gì. Chống bằng: van an toàn (quá CC_TASKS_MAX_DENY lượt
#       ⇒ nhường đường), và fail-OPEN ở MỌI tiền đề thiếu — chưa cài plugin · không đọc được config ·
#       không ghi được state · payload hỏng · thiếu node.
#   (b) guard CÂM ⇒ §14 lại chỉ là lời hứa. Chống bằng: matcher tên tool THẬT (đã tra ở mã nguồn
#       plugin `agent-tasks` 0.1.12, không đoán), và chỉ chặn tệp dưới `project.src_dir`.
#
# HAI QUYẾT ĐỊNH khác cổng cbm, có lý do:
#   1. Van THẤP hơn (2 thay vì 3). Đường thoát hợp lệ ở đây là NGƯỜI trả lời ("làm ad-hoc"), không
#      phải agent gọi thêm một tool. Nhắc nhiều lượt trong lúc chờ người là nhiễu.
#   2. CHỈ chặn tệp trong `src_dir`. Sửa docs · brief · changelog · config KHÔNG bị chặn — nếu chặn,
#      agent không viết nổi cái brief để hỏi user về task.
set -u

DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
STATE="${CC_TASKS_STATE:-${TMPDIR:-/tmp}/cc-tasks-gate}"
# `CC_TASKS_PLUGINS` là SEAM ĐỂ KIỂM ĐƯỢC, không phải cấu hình cho người dùng — xem `CC_CBM_BIN`
# trong `cbm-graph-first.sh`. Đường chạy thật không bao giờ đặt biến này.
MANIFEST="${CC_TASKS_PLUGINS:-$HOME/.claude/plugins/installed_plugins.json}"

command -v node >/dev/null 2>&1 || exit 0   # thiếu node ⇒ im; không có gì chạy được để mà báo

input=$(cat)

# `input` đã hút hết stdin ⇒ PHẢI pipe lại cho node, không thì node đọc stdin RỖNG và thoát im lặng
# — tức hook câm 100% mà `exit 0`, đúng lớp false-negative im lặng mà bộ luật cấm.
printf '%s' "$input" | node -e '
const fs = require("fs");
const path = require("path");

const [DIR, STATE, MANIFEST] = process.argv.slice(1);

// `Number("abc")` = NaN, và `n >= NaN` LUÔN false ⇒ van an toàn chết câm, cổng deny vĩnh viễn.
// Env dị dạng phải rơi về mặc định, không được biến thành khoá cửa.
const MAX_RAW = Number(process.env.CC_TASKS_MAX_DENY);
const MAX_DENY = Number.isFinite(MAX_RAW) && MAX_RAW >= 0 ? MAX_RAW : 2;

/**
 * Tool nào tính là ĐÃ CLAIM. Tra từ mã nguồn plugin agent-tasks 0.1.12 (`lib/tool-defs.mjs`),
 * KHÔNG đoán: đoán sai một tên là cổng câm 100%.
 *
 * Whitelist chứ không blacklist, để tool mới của server không âm thầm trở thành cửa mở khoá.
 * `tasks_list` · `task_get` · `tasks_my_claims` CỐ Ý không nằm đây: xem hàng đợi ≠ giành việc.
 */
const CLAIM = new Set(["task_intake", "task_claim_next", "task_claim"]);
const EDIT = new Set(["Edit", "Write", "MultiEdit"]);

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let data;
  try { data = JSON.parse(raw) || {}; } catch { process.exit(0); }   // JSON hỏng ⇒ không bao giờ cản
  const tool = String(data.tool_name || "");
  const sid = String(data.session_id || "nosid");

  // ── tiền đề 1: dự án phải khai `required` ──────────────────────────────────
  // `optional` ⇒ luật §14 vẫn áp nhưng cổng KHÔNG canh (user chưa yêu cầu mức đó).
  // `off` ⇒ im lặng tuyệt đối. Không đọc được config ⇒ coi như `optional` (fail-open).
  //
  // Đọc TAY thay vì qua `config.mjs`: hook chạy trước MỌI Edit/Write, thêm một tiến trình node nữa
  // là nhân đôi chi phí cố định của đường nóng. Chấp nhận được vì mọi đường hỏng rơi về "không
  // chặn", và nếu khoá bị đổi tên thì cổng NGỪNG chặn — hụt lưới thì ồn ở chỗ khác (doctor), chứ
  // không phải kẹt phiên. ⚠️ Tên khoá này phải giữ ĐỒNG BỘ với schema trong `bin/lib/config.mjs` —
  // đổi một bên là `off` mất hiệu lực.
  let cfg = null;
  try { cfg = JSON.parse(fs.readFileSync(path.join(DIR, "claude_config.json"), "utf8")); } catch { /* fail-open */ }
  if (!cfg || (cfg.integrations || {}).agent_tasks !== "required") process.exit(0);

  const key = String(`${DIR}__${sid}`).replace(/[^\w.-]/g, "_");
  const okFile = path.join(STATE, `${key}.ok`);
  const nFile = path.join(STATE, `${key}.n`);
  const mkState = () => { try { fs.mkdirSync(STATE, { recursive: true }); } catch { /* noop */ } };

  // ── nhánh MỞ KHOÁ ─────────────────────────────────────────────────────────
  if (tool.startsWith("mcp__agent-tasks__")) {
    if (CLAIM.has(tool.split("__").pop())) {
      mkState();
      try { fs.writeFileSync(okFile, ""); } catch { /* mở khoá hỏng ⇒ cùng lắm bị nhắc lại */ }
    }
    process.exit(0);
  }

  if (!EDIT.has(tool)) process.exit(0);
  if (fs.existsSync(okFile)) process.exit(0);   // đã claim ⇒ đường phổ biến nhất, rẻ nhất

  const emit = (o) => {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", ...o } }));
    process.exit(0);
  };
  // Nhường đường nhưng NÓI RA. Cố ý KHÔNG set `permissionDecision:"allow"`: hook này chỉ cần
  // *không chặn*, và "allow" tường minh sẽ bỏ qua các lớp quyền khác — quyền tối thiểu.
  const pass = (msg) => emit({ additionalContext: msg });

  // ── tiền đề 2: tệp đích phải nằm trong src_dir ─────────────────────────────
  // Không khai `src_dir` ⇒ KHÔNG chặn gì: không biết đâu là code thì chặn bừa là chặn cả brief.
  const srcDir = String((cfg.project || {}).src_dir || "").replace(/^\.\/+/, "").replace(/\/+$/, "");
  if (!srcDir) {
    return pass(
      `ℹ️ Cổng claim-task KHÔNG áp được: \`project.src_dir\` chưa khai trong claude_config.json nên ` +
      `không biết đâu là code production. Khai nó, hoặc nhớ luật §14 bằng tay: claim task trước khi sửa code.`,
    );
  }
  const file = String((data.tool_input || {}).file_path || "");
  const rel = path.relative(DIR, path.resolve(DIR, file)).split(path.sep).join("/");
  if (rel.startsWith("..") || !rel.startsWith(`${srcDir}/`)) process.exit(0);   // ngoài src_dir ⇒ không chặn

  // ── tiền đề 3: plugin phải đã cài ──────────────────────────────────────────
  // Cổng canh một tool KHÔNG TỒN TẠI thì chỉ chặn được người dùng của chính nó.
  let installed = null;
  try {
    const m = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
    installed = Object.keys(m.plugins || {}).some((k) => k.split("@")[0] === "agent-tasks");
  } catch { installed = null; }
  if (installed !== true) {
    return pass(
      `⚠️ Dự án khai \`agent_tasks: "required"\` nhưng plugin \`agent-tasks\` ${installed === null ? "KHÔNG kiểm được (không đọc được manifest)" : "CHƯA cài"} ` +
      `⇒ cổng claim-task nhường đường. Luật §14 VẪN ÁP: việc này có task chưa? Không có ⇒ HỎI user ` +
      `(tạo task, hay làm ad-hoc), đừng tự quyết. Cài: claude plugin install agent-tasks`,
    );
  }

  // ── van an toàn (chiều hazard (a)) ─────────────────────────────────────────
  let n = 0;
  try { n = Number(fs.readFileSync(nFile, "utf8")) || 0; } catch { /* chưa có ⇒ 0 */ }
  if (n >= MAX_DENY) {
    return pass(
      `⚠️ Đã nhắc ${n} lần "claim task trước" trong yêu cầu này ⇒ nhường đường cho phần còn lại. ` +
      `Nhưng code đang land NGOÀI SỔ: không ai biết ai đang làm gì, và hai phiên có thể làm trùng. ` +
      `Nói với user một dòng về việc đó.`,
    );
  }
  // KHÔNG ghi được state ⇒ PHẢI nhường đường: không đếm được thì không được chặn, vì van an toàn và
  // đường mở khoá cùng nằm ở đây — hỏng cả hai thì phiên kẹt vĩnh viễn. (Cùng lớp lỗi đã đo được ở
  // `cbm-graph-first.sh`: STATE chmod 0555 ⇒ 6/6 lượt deny, gọi tool xong vẫn deny.)
  mkState();
  try {
    fs.writeFileSync(nFile, String(n + 1));
  } catch (e) {
    return pass(
      `⚠️ Cổng claim-task không ghi được state tại ${STATE} (${e && e.code ? e.code : "lỗi ghi"}) ⇒ nhường đường. ` +
      `Sửa quyền ghi thư mục đó, hoặc đặt CC_TASKS_STATE.`,
    );
  }

  emit({
    permissionDecision: "deny",
    permissionDecisionReason:
      `🎫 Claim task TRƯỚC khi sửa code — đây là lượt sửa ĐẦU TIÊN của yêu cầu này dưới \`${srcDir}/\`.\n` +
      `Chưa claim mà sửa là làm việc ngoài sổ: hai phiên có thể nhận cùng một việc mà không ai biết.\n\n` +
      `  Việc ĐÃ CÓ trong hàng đợi:\n` +
      `    mcp__agent-tasks__task_claim_next { }              # bốc item phù hợp tiếp theo\n` +
      `    mcp__agent-tasks__task_claim      { work_item_iid } # item cụ thể\n` +
      `  Việc MỚI chưa từng vào hệ thống:\n` +
      `    mcp__agent-tasks__task_intake     { brief, shape, care, hazard }\n` +
      `      brief   = 7 mục (§10). shape: lam-thang | chot-roi-lam | chia-roi-lam | chot-chia-roi-lam\n` +
      `      care    = thuong | chat.  care=chat thì hazard BẮT BUỘC (task_complete từ chối nếu rỗng)\n\n` +
      `Không có task cho việc này và cũng không nên tạo ⇒ HỎI user, đừng tự quyết. Chi tiết: \`cc-harness rules §14\`.\n` +
      `(Nhắc lại ${MAX_DENY} lượt là van tự nhường đường — nhưng lúc đó code land ngoài sổ.)`,
  });
});
' "$DIR" "$STATE" "$MANIFEST"
exit 0
