#!/usr/bin/env bash
# PreToolUse — cổng CHẤT LƯỢNG cho handoff QC (entry changelog).
#
# Đổi tên từ `changelog-daily-guard.sh`: bản cũ chỉ chặn ĐÚNG MỘT thứ — ghi vào file-theo-ngày
# legacy — trong khi entry changelog LÀ tài liệu bàn giao cho QC (skill `changelog`). Vị trí thư
# mục, tên tệp và format 4 mục đều sống bằng prose, tức advisory.
#
# Đo được ở repo sản phẩm (2026-08-06): 4 entry ghi SAU khi luật đổi một ngày vẫn sai CẢ BA —
# sai thư mục (`changelog/entries/` thay vì `docs/releases/entries/`), viết theo khuôn nhật ký dev,
# và KHÔNG entry nào có mục "Cách kiểm chứng" — đúng thứ QC cần nhất. Hook cũ cũng chưa từng có
# lưới nào. Cùng bài học với `cbm-graph-first`: prose không giữ được, chỉ cơ chế mới giữ.
#
# ⚠️ KHÁC `component-test-gate.sh` — cổng này PHÁN QUYẾT, không chỉ nhắc. Lý do: ba thứ nó kiểm
# (đường dẫn · tên tệp · sự hiện diện của heading) là dữ kiện TĨNH 100%, không phải phán đoán như
# "assert này có phải tautology không". Cái gì tĩnh hoá được thì mới xứng đáng là gate.
#
# Nó CỐ Ý KHÔNG chấm chất lượng NỘI DUNG (mục "Cách kiểm chứng" viết có dùng được không) — thứ đó
# không tĩnh hoá được, để `code-reviewer` và người đọc.
#
# HAZARD — hai chiều ngược nhau:
#   (a) DENY oan ⇒ chặn việc ghi hợp lệ. Chống bằng: phạm vi hẹp (chỉ đúng hai họ đường dẫn),
#       nhận entry LÀM LUÔN rút gọn 2 mục, và fail-OPEN ở mọi tiền đề thiếu.
#   (b) Cổng CÂM ⇒ entry rác vẫn land, QC nhận tài liệu không dùng được. Chống bằng: thông điệp
#       gọi ĐÍCH DANH thứ thiếu, cộng lưới mutation ở `.claude/templates/changelog-entry-gate.test.mjs`.
set -u

input=$(cat)

# Thiếu node ⇒ nhường đường IM LẶNG (cùng lý lẽ với `component-test-gate.sh`: khán giả của cảnh báo
# là máy đã thiếu chính công cụ dựng cảnh báo, và `check-setup.sh` đã gate `node`).
command -v node >/dev/null 2>&1 || exit 0

printf '%s' "$input" | node -e '
const WRITE = new Set(["Edit", "Write", "MultiEdit"]);

// Sáu mục của handoff QC (skill `changelog`). Khớp theo TIỀN TỐ vì mục đầu có hậu tố
// "(QC test cái này)". Thứ tự trong mảng = thứ tự nêu trong thông điệp lỗi.
//
// "Vì sao" và "Nợ để lại" thêm ở v1.1.1. Vì sao chúng phải nằm ĐÂY, không chỉ trên item:
// fragment là thứ DUY NHẤT nằm trong git — mọi member clone về là có, kể cả khi agent-tasks tắt,
// kể cả việc làm ad-hoc không có item, kể cả ba tháng sau khi không ai còn mở tracker.
//
// ⚠️ "Vì sao" ở đây là KẾT LUẬN, không phải quá trình: chốt hướng nào · BỎ hướng nào · đổi lại
// được gì. Quá trình thăm dò (các phương án, ngõ cụt) vẫn KHÔNG thuộc fragment — xem thông điệp
// DENY bên dưới. Lằn ranh đó là lý do mục này chỉ đáng 2–4 dòng chứ không thành một bài.
//
// "Nợ để lại" bắt buộc CÓ MẶT nhưng thân bài `—` là hợp lệ: cùng lý lẽ với `spec_delta: []` phải
// khai lý do — "không nợ gì" là một KHẲNG ĐỊNH, không phải mặc định.
const SECTIONS = [
  "Đã đổi gì", "Vì sao", "Cách kiểm chứng", "Rủi ro cần soi kỹ", "Nợ để lại", "Bằng chứng gate",
];
// Entry LÀM LUÔN được rút gọn còn hai mục (skill: "frontmatter + Đã đổi gì 1–2 dòng + Bằng chứng
// gate 2–3 dòng"). Bỏ ngoại lệ này thì cổng thành thuế lên đúng cấp việc phổ biến nhất — và cấp đó
// theo định nghĩa là việc KHÔNG có đánh đổi để chốt.
const SECTIONS_LITE = ["Đã đổi gì", "Bằng chứng gate"];

const NAME_RE = /^(\d{8})-\d{6}-[^/]+\.md$/;      // YYYYMMDD-HHMMSS-<slug>.md
const LEGACY_RE = /(?:^|\/)(?:docs\/releases|changelog)\/\d{8}\.md$/;
const OLD_ENTRIES_RE = /(?:^|\/)changelog\/entries\//;
const ENTRIES_RE = /(?:^|\/)docs\/releases\/entries\/([^/]+)\/([^/]+)$/;

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let data;
  try { data = JSON.parse(raw) || {}; } catch { process.exit(0); }   // JSON hỏng ⇒ không bao giờ cản
  if (!WRITE.has(String(data.tool_name || ""))) process.exit(0);

  const ti = data.tool_input || {};
  const file = String(ti.file_path || "");
  if (!file) process.exit(0);

  const deny = (reason) => {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
    }));
    process.exit(0);
  };
  const HOW = `Khuôn đúng: docs/releases/entries/<YYYYMM>/<YYYYMMDD-HHMMSS>-<slug>.md — xem skill "changelog".`;

  // ── 1. File theo NGÀY (legacy) — hành vi kế thừa từ changelog-daily-guard ──
  if (LEGACY_RE.test(file)) {
    return deny(`Changelog theo ngày đã ĐÓNG BĂNG (legacy) — mọi entry mới phải là fragment write-once.\n${HOW}`);
  }

  // ── 2. Cấu trúc thư mục CŨ ────────────────────────────────────────────────
  if (OLD_ENTRIES_RE.test(file)) {
    return deny(
      `"changelog/entries/" là cấu trúc CŨ — entry changelog nay là handoff cho QC và sống ở docs/releases/entries/.\n${HOW}`,
    );
  }

  const m = file.match(ENTRIES_RE);
  if (!m) process.exit(0);                          // ngoài phạm vi ⇒ im lặng tuyệt đối
  const monthDir = m[1];
  const base = m[2];

  // ── 3. Tên tệp ────────────────────────────────────────────────────────────
  const nm = base.match(NAME_RE);
  if (!nm) {
    return deny(`Tên tệp entry sai khuôn: "${base}".\n${HOW}\nPhần ngày-giờ KHÔNG có dấu gạch bên trong (YYYYMMDD-HHMMSS), và phải có <slug>.`);
  }
  const monthOfName = nm[1].slice(0, 6);
  if (monthDir !== monthOfName) {
    return deny(
      `Thư mục tháng "${monthDir}" không khớp ngày trong tên tệp (${nm[1]}) ⇒ phải là "${monthOfName}".\n` +
      `Đặt nhầm tháng làm lệnh gộp changelog đọc sai kỳ.`,
    );
  }

  // ── 4. Nội dung — CHỈ Write mới có content ────────────────────────────────
  // ⚠️ GIỚI HẠN ĐƯỢC KHAI: Edit/MultiEdit không mang toàn văn nên cổng không kiểm được format ở
  // đường đó. Chấp nhận: entry là write-once (skill cấm sửa entry đã tồn tại), nên đường tạo mới —
  // đường Write — mới là đường cần chặn.
  if (String(data.tool_name) !== "Write") process.exit(0);
  // Phân biệt THIẾU TRƯỜNG với RỖNG: không có `content` là thiếu tiền đề (payload lạ) ⇒ đi qua;
  // `content: ""` là một lượt ghi THẬT tạo ra tệp entry rỗng ⇒ phải rơi vào phép kiểm bên dưới và
  // bị DENY. Gộp hai ca bằng `if (!content) exit` đổi một DENY đúng lấy một pass sai, và mở đường
  // lách hai bước: Write rỗng → Edit đổ nội dung (Edit không kiểm được nội dung).
  if (ti.content === undefined || ti.content === null) process.exit(0);
  const content = String(ti.content);

  if (!/^---\s*\n[\s\S]*?\n---\s*(\n|$)/.test(content)) {
    return deny(`Entry thiếu frontmatter YAML ở đầu tệp (--- title/date/tier/scope ... ---).\nXem skill "changelog".`);
  }

  // Thu hoạch heading ở ĐẦU DÒNG và NGOÀI khối code. Grep chuỗi bất kỳ sẽ đếm cả heading nằm trong
  // ví dụ ``` ``` — chính lỗi đó vừa gây một false-positive khi kiểm tay 4 entry ở repo sản phẩm.
  const headings = [];
  let inFence = false;
  for (const line of content.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const h = line.match(/^#{2,4}\s+(.*)$/);
    if (h) headings.push(h[1].trim());
  }

  // `tier` PHẢI đọc trong KHỐI FRONTMATTER, không phải toàn văn: một dòng `tier: …` lạc ở đầu dòng
  // trong thân bài (hình dạng rất thật — entry NÓI VỀ khuôn changelog) sẽ hạ ngưỡng từ 4 mục xuống
  // 2 một cách IM LẶNG. Phép thu hoạch heading bên trên đã biết loại trừ khối code; chỗ này phải
  // nhất quán với nó.
  const fm = content.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  const tierLine = fm ? fm[1].match(/^tier:\s*(.*)$/m) : null;
  const tier = tierLine ? tierLine[1] : "";
  // Nhận CẢ HAI tên: `LÀM LUÔN` là tên từ v1.1.0, `LÀM THẲNG` là tên đã nghỉ nhưng còn nằm trong
  // entry viết trước đó. Chỉ nhận tên mới thì entry cũ lặng lẽ tụt xuống khuôn 4 mục — cổng thành
  // thuế đúng lên cấp việc phổ biến nhất, và không ai đọc được vì sao.
  const required = /LÀM (LUÔN|THẲNG)/.test(tier) ? SECTIONS_LITE : SECTIONS;
  const missing = required.filter((s) => !headings.some((h) => h.startsWith(s)));

  if (missing.length) {
    // Fence lẻ (mở mà không đóng) nuốt hết phần còn lại ⇒ thông điệp sẽ nói "thiếu N mục" trong khi
    // chúng nằm ngay trước mắt. Markdown đó vốn đã hỏng nên đây không phải DENY oan, nhưng không
    // nói ra thì người viết đi sửa nhầm chỗ.
    const fenceHint = inFence
      ? `\n⚠️ Tệp có khối code MỞ mà chưa đóng — mọi thứ sau nó bị coi là code, nên các mục nằm sau đó không được tính. Kiểm lại dấu \`\`\` trước đã.`
      : "";
    return deny(
      `Entry changelog LÀ handoff cho QC VÀ là dấu vết duy nhất nằm trong git — thiếu ${missing.length} ` +
      `mục bắt buộc: ${missing.map((s) => `"${s}"`).join(" · ")}.${fenceHint}\n` +
      `Đủ bộ: ${required.map((s) => `### ${s}`).join(" · ")}\n` +
      `"Cách kiểm chứng": bước tái hiện đủ để người CHƯA làm task tự kiểm được.\n` +
      `"Vì sao": KẾT LUẬN 2–4 dòng — chốt hướng nào, BỎ hướng nào, đổi lại được gì. Đây là mục ` +
      `người đọc sau ba tháng cần nhất, và là mục không ai tự suy lại được từ diff.\n` +
      `"Nợ để lại": thứ cố ý để lại + ở đâu + trả nợ thì làm gì. Không nợ gì thì ghi "—" — ` +
      `mục phải CÓ MẶT, vì "không nợ" là một khẳng định chứ không phải mặc định.\n` +
      `Ba thứ KHÔNG viết vào đây: quá trình đi tới quyết định (phương án đã thăm dò, ngõ cụt — ` +
      `thuộc item agent-tasks) · bài học/escape note/mutation (⇒ docs/knowledge/) · bằng chứng máy ` +
      `chi tiết (⇒ ledger verify.md).`,
    );
  }
  process.exit(0);
});
'
exit 0
