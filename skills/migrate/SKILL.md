---
name: migrate
description: "Dùng khi một dự án cần nâng bộ khung cc-harness lên bản mới, hoặc khi config của dự án còn khai khoá đã bỏ. Trigger: 'nâng cấp bộ khung', 'config này còn dùng được không', 'doctor báo khoá risk đã bỏ', 'cc-harness đổi gì ở bản mới'. Chẩn đoán bằng máy trước, chỉ hỏi người thứ máy không tra được."
---

# Nâng bộ khung cho một dự án

Bộ khung **sống trong plugin**, không có bản copy nào trong repo dự án. Nên "nâng cấp" ở đây chỉ có
hai việc: cập nhật plugin, và sửa những khoá config đã đổi nghĩa.

Dự án **chưa có** `claude_config.json` ⇒ đây không phải việc của skill này. Dùng agent
`project-init` (đọc source → phỏng vấn → khai config + `PROJECT.md`).

## Bước 1 — Chẩn đoán bằng máy

```bash
claude plugin install cc-harness@members-cc-harness   # lấy bản mới nhất
cc-harness doctor                                     # cổng setup: quyền · trust · tích hợp · export
cc-harness config --check                             # khoá nào lạ, khoá nào đã bỏ
cc-harness rules --diff                               # override nào còn áp được
cc-harness rules --index                              # bảng mục hiện tại
```

Ba dấu hiệu cần xử, theo thứ tự:

| `doctor`/`config --check` nói | Nghĩa | Làm gì |
|---|---|---|
| `⚠ <khoá>: đã BỎ ở v…` | config còn khai một cơ chế không còn tồn tại | theo `config-keys.md` |
| `✖ section "<§id>" không có trong bộ luật` | override trỏ mục đã dời hoặc đổi tên | theo bảng ánh xạ dưới |
| `⚠ mục §0 thiếu annotation` | dự án `replace` mục LÕI mà mất dòng `<!-- inject: core -->` | thêm lại dòng đó vào tệp override |

## Bước 2 — Override trỏ mục đã dời

`rules.overrides` bám theo `§id`. Id đổi ⇒ override nhận `section-not-found`. Lỗi này **nhìn thấy
được** (`cc-harness rules --diff` in ra, kèm gợi ý id gần nhất), nhưng vẫn phải sửa: override không áp
nghĩa là luật của dự án không có hiệu lực.

### v1.0.0 → v1.1.0

§0 bị **xé**: nó từng chứa toàn bộ quy trình (62 KB), nay chỉ còn phần LÕI được bơm mỗi phiên.

| id cũ (§0/…) | id mới |
|---|---|
| `§0/skill-goi-bang-ten-co-namespace` | `§9` |
| `§0/cong-dau-vao-docs-raw-bat-buoc-truoc-khi` · `§0/tai-lieu-lam-viec-theo-task-docs-wip-loc` · `§0/tai-lieu-troubleshoot-sau-khi-fix-duoc-x` · `§0/changelog-dev-sau-khi-task-hoan-tat-bat` · `§0/spec-hanh-vi-specs-nguon-su-that-hanh-vi` | `§10` |
| `§0/quy-tac-subagents-agents` · `§0/ban-giao-cho-subagent-nap-tri-thuc-khong` · `§0/fan-out-song-song-nhieu-implementer-chay` | `§11` |
| `§0/verify-review-chong-lap-bat-buoc-cac-quy` | `§12` |
| `§0/chong-dam-chan-khi-nhieu-agents-nhieu-se` | `§13` |
| `§0/quy-tac-bat-buoc` · `§0/buoc-0-chot-hieu-yeu-cau-bat-buoc-truoc` · `§0/phan-loai-task-hai-dau-ra-khong-phai-mot` | **KHÔNG còn** — thay bằng `§0/phan-loai-viec` (hai cổng, ba cấp) |

Mục MỚI ở v1.1.0: `§0/cong-cung` · `§0/phan-loai-viec` · `§0/luat-output` · `§0/nguon-su-that` (đều
thuộc LÕI) và `§14` (agent-tasks).

⚠️ **Năm tên hình dạng việc đã BỎ** — `LÀM THẲNG` · `CHIA RỒI LÀM` · `CHỐT RỒI LÀM` ·
`CHỐT, CHIA, RỒI LÀM` · `SPIKE`. Tệp override nào của dự án còn nhắc chúng thì đang nói về một hệ
không còn tồn tại:

| Tên cũ | Cấp mới |
|---|---|
| `LÀM THẲNG` | **LÀM LUÔN** |
| `CHỐT RỒI LÀM` | **CHỐT RỒI GIAO** |
| `CHIA RỒI LÀM` | **CHIA RỒI BÓC** (vào thẳng bước chia, không brainstorming) |
| `CHỐT, CHIA, RỒI LÀM` | **CHIA RỒI BÓC** (đủ pha) |
| `SPIKE` | một **bước** trong pha brainstorming của CHIA RỒI BÓC |

## Bước 3 — Xác nhận

```bash
cc-harness rules --diff        # 0 lỗi, và override nào cũng phải xuất hiện ở đây
cc-harness config --check      # 0 lỗi, 0 cảnh báo khoá-đã-bỏ
cc-harness doctor              # exit 0
```

Còn một override không áp được mà bạn chưa biết map sang đâu ⇒ **HỎI user**, đừng gỡ nó: gỡ một
override là gỡ một luật mà dự án đã cố ý khai.

## Chi tiết khoá config

`config-keys.md` — khoá nào mới, khoá nào đã bỏ, và bỏ vì sao.
