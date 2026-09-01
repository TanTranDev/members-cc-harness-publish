---
name: changelog
description: Use when a non-trivial task (feature / bugfix / refactor) is completed and you need to record what was asked, how it was decided, and the result — or when the user asks to write/append a dev changelog entry. Triggers — "ghi changelog", "thêm changelog", "log this task", after finishing+verifying a task.
---

# Changelog (dev) — fragment per entry

## Overview

Mỗi task không-nhỏ-lẻ được ghi thành **MỘT FILE RIÊNG** (fragment, write-once) trong
`docs/releases/entries/` — không có file dùng chung, nên N session cùng ngày **không thể
conflict** khi cùng push. Đây là nhật ký "đã làm gì + chốt thế nào", per-project,
KHÁC `docs/knowledge/` (chỉ cho sự cố) và `docs/wip/` (nháp, không commit).

**File theo ngày `docs/releases/YYYYMMDD.md` là LEGACY — ĐÃ ĐÓNG BĂNG, cấm ghi thêm**
(hook `changelog-entry-gate` chặn). Chỉ đọc làm lịch sử.

> 🔒 **Bốn thứ dưới đây được ÉP BẰNG MÁY**, không phải lời khuyên — hook `changelog-entry-gate.sh`
> DENY ngay lúc ghi, kèm lý do đích danh: (1) không ghi vào file-theo-ngày legacy · (2) không ghi
> vào `changelog/entries/` (cấu trúc cũ) · (3) tên tệp đúng khuôn `YYYYMMDD-HHMMSS-<slug>.md` và
> khớp thư mục tháng · (4) có frontmatter + đủ mục bắt buộc (2 mục cho `LÀM LUÔN`, **6 mục** cho
> các cấp còn lại).
> Cổng **không** chấm chất lượng nội dung — "Cách kiểm chứng" viết có dùng được không thì chỉ người
> đọc và `code-reviewer` biết. Cổng chỉ đảm bảo **mục đó tồn tại**.

## Quy ước file

- Đường dẫn: `docs/releases/entries/<YYYYMM>/<YYYYMMDD-HHMMSS>-<slug>.md`
  - `date +%Y%m` → folder tháng (tự tạo nếu chưa có) · `date +%Y%m%d-%H%M%S` → prefix.
  - `<slug>`: kebab-case ngắn từ tiêu đề task (vd `20260718-153042-activity-row-pm.md`).
  - Đụng tên (hiếm): thêm hậu tố `-2`.
- **Write-once**: chỉ TẠO file mới. CẤM Edit entry đã tồn tại (kể cả của chính mình sau
  khi đã push). Cùng task làm tiếp ⇒ file MỚI, title cũ + "(đợt 2)". Đính chính entry
  chưa push của chính session ⇒ được sửa file mình vừa tạo.
- Ai ghi: cấp CHỐT RỒI GIAO / CHIA RỒI BÓC ⇒ agent `changelog-writer`; **LÀM LUÔN** mà đáng ghi ⇒ main agent
  TỰ Write fragment 5 dòng (không spawn subagent cho 5 dòng).

## Format 1 entry (6 mục BẮT BUỘC — không mục nào được bỏ; riêng `LÀM LUÔN` xem cuối mục)

```markdown
---
title: <Tiêu đề task ngắn>
date: YYYY-MM-DD HH:MM
tier: <cấp việc> + <mức cẩn thận>   # vd: LÀM LUÔN · CHỐT RỒI GIAO + CHẶT
scope: features/<feature-chính>        # giúp lọc entry theo feature
commit: <hash>                          # bỏ dòng nếu chưa commit
pending: visual                         # CHỈ khi task UI còn Quan sát L1-pending
---

### Đã đổi gì (QC test cái này)
<HÀNH VI QUAN SÁT ĐƯỢC đã đổi — người kiểm nhìn thấy khác biệt ở đâu: màn hình nào,
lệnh nào, exit code nào, file nào sinh ra. KHÔNG kể quá trình quyết định.>

### Vì sao
<KẾT LUẬN 2–4 dòng: chốt hướng nào · BỎ hướng nào · đổi lại được gì. KHÔNG kể quá trình
thăm dò. Đây là mục người đọc sau ba tháng cần nhất và là mục KHÔNG ai suy lại được từ
diff — diff nói code làm gì, không nói vì sao không làm cách khác.>

### Cách kiểm chứng
<bước tái hiện · lệnh chạy · dữ liệu mẫu · kết quả mong đợi. Đủ để người CHƯA làm task
này tự kiểm được, không phải hỏi lại.>

### Rủi ro cần soi kỹ
<vùng đã chạm dễ vỡ · edge case chưa test · thứ chỉ hỏng ở môi trường thật (device,
bundle publish, đa-session). Đây là chỗ QC nên dồn sức.>

### Nợ để lại
<thứ CỐ Ý để lại chưa đúng/chưa đủ · ở đâu (đường dẫn) · trả nợ thì phải làm gì.
Không nợ gì thì ghi `—`. Mục phải CÓ MẶT: "không nợ" là một khẳng định, không phải mặc định.>

### Bằng chứng gate
<typecheck/lint/test/structure/spec + exit · quan sát L-mức nếu task UI · commit>
```

Entry của LÀM LUÔN rút gọn: frontmatter + "Đã đổi gì" 1–2 dòng + "Bằng chứng gate" 2–3 dòng.

> ⚠️ **Entry này là HANDOFF CHO QC, và là dấu vết DUY NHẤT nằm trong git.** Ba thứ **KHÔNG** viết
> vào đây: quá trình ĐI TỚI quyết định — phương án đã thăm dò, ngõ cụt (⇒ item của agent-tasks;
> mục "Vì sao" chỉ nhận KẾT LUẬN) · bài học, rubric, escape note, bảng mutation
> (⇒ `docs/knowledge/`) · bằng chứng máy chi tiết (⇒ ledger `verify.md`).
> Trộn chúng vào làm QC phải lội qua chuyện của dev, còn dev phải lục hàng chục entry để
> tìm một rubric — cả hai bên đều khó dùng.

## Vì sao có mục "Vì sao" và "Nợ để lại"

Fragment là **thứ duy nhất nằm trong git**. Item của agent-tasks giữ bản đầy đủ hơn (`tradeoff`,
`debt`, spec_delta máy đọc được), nhưng nó chỉ tồn tại khi dự án bật tracker, và không ai clone
tracker về máy. Ba tháng sau, người mở repo đọc được **đúng** những gì nằm trong git.

| Câu người hỏi sau ba tháng | Trả lời được từ | Diff có nói không |
|---|---|---|
| *code này làm gì* | diff | ✅ |
| *vì sao không làm cách khác* | **mục "Vì sao"** | ❌ không bao giờ |
| *chỗ này còn nợ gì* | **mục "Nợ để lại"** | ❌ |

`cc-harness changelog --last N` gộp lại được, nên hai mục này cũng là nguyên liệu cho bản recap
N ngày của `agent-tasks:task-recap` — nó đọc `docs/releases/entries/` như một trong ba nguồn.

## Đọc lại

- `npm run changelog` — gộp fragment hôm nay, mới nhất trước.
- `npm run changelog 20260717` — theo ngày · `npm run changelog -- --last 20` — N entry
  gần nhất (kèm scope để user điều phối session).

## Common mistakes

- Ghi vào `docs/releases/YYYYMMDD.md` (file theo ngày) — SAI, cơ chế cũ đã đóng băng; luôn
  tạo fragment mới trong `docs/releases/entries/<YYYYMM>/`.
- Edit entry đã tồn tại để "cập nhật" — SAI, write-once; làm tiếp ⇒ file mới "(đợt 2)".
- Tên file thiếu giờ-phút-giây hoặc dùng gạch ngang trong phần ngày — SAI, đúng dạng
  `YYYYMMDD-HHMMSS-<slug>.md`.
- Bỏ một trong **6 mục** vì "không áp dụng" — SAI, cổng chặn. Không có gì để viết vẫn phải có mục,
  và viết thẳng lý do (vd *"Không có rủi ro nào ngoài phạm vi đã nêu"*) — chính câu đó là thông tin
  QC cần. Thứ được phép bỏ là **dòng frontmatter tuỳ chọn** (`commit` khi chưa commit, `pending` khi
  không pending), và entry `LÀM LUÔN` thì chỉ cần 2 mục (xem khối 🔒 ở trên).
- Để placeholder/"TBD" trong một mục — SAI. Mục phải có nội dung thật.
- Ghi entry cho fix nhỏ lẻ (typo/style đơn lẻ) — KHÔNG cần.
- Spawn changelog-writer cho task LÀM LUÔN — KHÔNG, main tự ghi 5 dòng rẻ hơn spawn.
