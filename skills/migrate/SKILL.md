---
name: migrate
description: "Bước vào một dự án (đã dùng cc-harness hay chưa) và làm nó sẵn sàng: config · PROJECT.md · CLAUDE.md · cc-lock · agent-tasks · cbm, mặc định từ origin. Triggers: \"cài harness cho dự án\", \"vào dự án mới\", \"setup dự án\", \"migrate\", \"nâng cấp bộ khung\", \"doctor báo khoá đã bỏ\"."
---

# Vào một dự án — `cc-harness migrate`

**Không có chế độ.** User không biết source đang có gì; lệnh tự nhìn rồi quyết từng việc: tạo · giữ ·
bổ sung. Mọi mặc định lấy từ `git remote origin`: cc-lock khoá trên chính repo, agent-tasks claim và
board trên chính repo — đó là cách đã chạy thật và ổn, không cần repo phụ.

**Bạn (main agent) tự làm toàn bộ, KHÔNG spawn subagent để phỏng vấn** — user đang chat với bạn. Agent
`project-init` chỉ dùng khi user gọi đích danh muốn khai lại sâu.

## Bước 1 — Xem trước (máy)

```bash
cc-harness migrate            # không ghi gì; in kế hoạch: tạo gì · giữ gì · vì sao
```

Đọc ba dòng đầu (origin · host · nhánh chính) và bảng kế hoạch. Máy đã quyết:

| Thấy | Nghĩa |
|---|---|
| `host=… (github)` ⇒ `agent_tasks = off` | agent-tasks chỉ chạy với GitLab (Issues API). Nói cho user, không hỏi |
| `host=… (unknown)` ⇒ `agent_tasks = required` | máy **giả định GitLab tự host**. Hỏi user ĐÚNG MỘT câu nếu tên host không gợi GitLab |
| `origin: (KHÔNG có …)` | cc-lock/agent-tasks không suy được ⇒ hỏi user URL, hoặc `off` |
| `giữ <tệp>` | tệp có sẵn — không đụng. Muốn làm mới thì user tự xoá rồi chạy lại |

Trình cho user **≤ 10 dòng**: kế hoạch + điều máy chưa suy được. Chỉ `AskUserQuestion` cho thứ máy không
tra được (không có origin · host lạ · muốn tắt tích hợp nào).

## Bước 2 — Ghi (máy)

```bash
cc-harness migrate --yes
```

Lệnh sinh: `claude_config.json` (integrations theo host) · `PROJECT.md` · ba dòng `.gitignore` · quyền
`.claude/settings.json` · `CLAUDE.md` (bản ngắn, hoặc **thêm khối** `<!-- cc-harness:begin -->` vào tệp có
sẵn) · `cc-lock.config.json` (lockRepoUrl = origin SSH, projectKey auto) · `agent-tasks.config.json`
(boardUrl = origin HTTPS, claimRepoUrl = origin SSH) · `.git/agent-tasks.env` (quyền 600, `GITLAB_TOKEN=`
trống). Xong nó chạy `doctor`, `cc-lock status`, `tasks-cli verify` và in "Việc của NGƯỜI còn lại".

## Bước 3 — Điền thứ máy không suy được (bạn)

1. **`PROJECT.md`**: đọc source (graph nếu có, rồi Read) và điền mọi mục `(chưa khai)`: stack · lệnh
   dev/test/build · bản đồ tầng ↔ thư mục · quy ước tên · nợ kiến trúc. Thứ không suy được từ code
   (ai phụ trách tích hợp, contract với hệ ngoài) ⇒ hỏi user, một câu một lượt.
2. **`gate.commands`** trong `claude_config.json`: máy chỉ dò được từ manifest; xác nhận với user.
3. **Token**: nhắc user điền `GITLAB_TOKEN` vào `.git/agent-tasks.env` (hoặc `~/.agent-tasks/.env` dùng
   chung mọi dự án), rồi `tasks-cli verify` → `labels --apply` → `board --apply`. Bạn KHÔNG đọc, không
   điền token.
4. **Commit** các tệp máy đã liệt kê (không có `agent-tasks.env` — nó nằm trong `.git/`).

## Dự án ĐÃ dùng bản cũ — nâng bộ khung

`migrate` giữ nguyên `claude_config.json` có sẵn và chỉ gợi ý. Việc còn lại là khoá đã đổi nghĩa:

```bash
cc-harness doctor                # quyền · trust · tích hợp · export
cc-harness config --check        # khoá lạ · khoá đã bỏ (theo config-keys.md)
cc-harness rules --diff          # override nào còn áp được
```

| `doctor`/`config --check` nói | Làm gì |
|---|---|
| `⚠ <khoá>: đã BỎ ở v…` | theo `config-keys.md` |
| `✖ section "<§id>" không có trong bộ luật` | override trỏ mục đã dời — bảng ánh xạ dưới |
| `⚠ mục §0 thiếu annotation` | thêm lại `<!-- inject: core -->` vào tệp override |

### Override trỏ mục đã dời (v1.0.0 → v1.1.0)

| id cũ (§0/…) | id mới |
|---|---|
| `§0/skill-goi-bang-ten-co-namespace` | `§9` |
| `§0/cong-dau-vao-docs-raw-bat-buoc-truoc-khi` · `§0/tai-lieu-lam-viec-theo-task-docs-wip-loc` · `§0/tai-lieu-troubleshoot-sau-khi-fix-duoc-x` · `§0/changelog-dev-sau-khi-task-hoan-tat-bat` · `§0/spec-hanh-vi-specs-nguon-su-that-hanh-vi` | `§10` |
| `§0/quy-tac-subagents-agents` · `§0/ban-giao-cho-subagent-nap-tri-thuc-khong` · `§0/fan-out-song-song-nhieu-implementer-chay` | `§11` |
| `§0/verify-review-chong-lap-bat-buoc-cac-quy` | `§12` |
| `§0/chong-dam-chan-khi-nhieu-agents-nhieu-se` | `§13` |
| `§0/quy-tac-bat-buoc` · `§0/buoc-0-chot-hieu-yeu-cau-bat-buoc-truoc` · `§0/phan-loai-task-hai-dau-ra-khong-phai-mot` | **KHÔNG còn** — thay bằng `§0/phan-loai-viec` |

Tên hình dạng việc đã bỏ: `LÀM THẲNG` → **LÀM LUÔN** · `CHỐT RỒI LÀM` → **CHỐT RỒI GIAO** · `CHIA RỒI LÀM` /
`CHỐT, CHIA, RỒI LÀM` → **CHIA RỒI BÓC** · `SPIKE` → một bước trong brainstorming.

Còn override không map được ⇒ **HỎI user**, đừng gỡ: gỡ một override là gỡ một luật dự án đã cố ý khai.

## Xác nhận cuối

```bash
cc-harness doctor              # exit 0
cc-harness rules --diff        # 0 lỗi
cc-harness config --check      # 0 lỗi
```

Báo cho user một bảng: tệp đã tạo/giữ · integrations đã chọn và vì sao · việc còn lại của người (token ·
PROJECT.md · commit). Không kể quá trình.
