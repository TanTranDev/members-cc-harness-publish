---
name: custom-claude-config-mode
description: Chuyển công tắc quality/balance/usage cho bộ khung điều phối model (per-clone). Dùng khi user gõ /custom-claude-config-mode [quality|balance|usage], hoặc nói "đổi sang mode tiết kiệm / usage / balance / quality", "bật tiết kiệm usage", "về baseline chất lượng", "xem/đổi config-mode". quality = baseline CLAUDE.md §0 (mặc định). balance = mức giữa — model như quality nhưng ngân sách spawn siết như usage. usage = hạ model subagent xuống tier rẻ (delta). Triggers on: config-mode, mode tiết kiệm, usage mode, balance mode, quality mode, tiết kiệm token/usage, đổi routing model.
---

# custom-claude-config-mode — công tắc quality/balance/usage

Chuyển clone hiện tại giữa 3 chế độ điều phối model. State per-clone tại
`<git-dir>/config-mode-local.json` (không commit, giống `cc-lock-local.json`). Nguồn
sự thật: lệnh `cc-harness policy` (resolver 3 tầng: plugin defaults ← claude_config.json ← clone).

- **quality** (mặc định, khi KHÔNG có state file): bảng model §0 của bộ luật nguyên trạng
  (nghiêng chất lượng — 7/11 agent Opus).
- **balance**: mức giữa, và hôm nay nó **KHÔNG phải bản sao của `quality`** — hai trục đi
  hai đường: **model routing y hệt `quality`** (chưa hạ tier vai nào), nhưng **ngân sách
  spawn đã siết bằng `usage`**. Số cụ thể KHÔNG chép vào đây — đọc
  `policy/defaults.json` của plugin, hoặc khối `⚙️ POLICY` hook bơm đầu phiên. Tinh chỉnh
  thật chốt ở lô 4.
- **usage**: delta hạ model subagent xuống tier rẻ để tiết kiệm usage/token.

## Quy trình (agent thực hiện)

### 1. Xác định mode đích
- **Có arg** `quality`, `balance` hoặc `usage` (từ `/custom-claude-config-mode <arg>` hoặc
  câu nói rõ ý) ⇒ dùng luôn, KHÔNG hỏi.
- **Không arg / mơ hồ** ⇒ `AskUserQuestion` đúng 3 lựa chọn (mỗi lựa chọn nêu ĐƯỢC/MẤT):
  - "quality — baseline CLAUDE.md §0 (mặc định). Được: chất lượng cao nhất, subagent thả ga. Mất: usage/token cao nhất."
  - "balance — mức giữa. Được: model y hệt quality (không hạ tier vai nào). Mất: ngân sách spawn siết bằng usage, subagent hết thả ga."
  - "usage — tiết kiệm. Được: usage/token thấp nhất. Mất: subagent chạy model tier rẻ ở khúc gõ giữa (bất biến an toàn vẫn giữ)."
  Có thể kèm dòng phụ: mode hiện hành đọc bằng `cc-harness policy --mode`.

### 2. Set mode qua CLI
```bash
cc-harness policy --set-mode <mode>
```
(về quality có thể dùng `set quality` hoặc `off` — cả hai đều cho quality; `off` xoá hẳn file.)

### 3. In xác nhận + bảng delta + nhắc
In cho user:

1. **Xác nhận**: "config-mode giờ là **<mode>** cho clone này (state: `<git-dir>/config-mode-local.json`)."

2. **Bảng DELTA** — chỉ in khi đặt `usage`. Đặt `quality` thì nói "về baseline CLAUDE.md §0,
   không delta"; đặt `balance` thì nói "model giữ nguyên như `quality`, nhưng ngân sách spawn
   siết bằng `usage`" — CẤM bịa số, trỏ user đọc khối `⚙️ POLICY` đầu phiên:

   | Agent | usage (delta trên baseline) |
   |---|---|
   | implementer | Sonnet mặc định; Opus CHỈ khi vùng đắt / contract / escalate 2-fail |
   | planner | Sonnet cho plan lặp-pattern ("bản sao thứ N"); Opus khi vùng đắt / thiết kế mới |
   | debugger | Sonnet cho bug tái hiện được + vùng quen; Opus khi bug lạ / đa hệ |
   | explorer | Haiku |
   | Tie-break "phân vân" | model RẺ — TRỪ vùng đắt/contract (vẫn mạnh) |
   | Review / verifier / changelog-writer | GIỮ NGUYÊN |

3. **Ba nhắc bắt buộc**:
   - **(a) Model main không tự đổi được**: skill chỉ chỉnh routing subagent. Nếu phiên
     hiện tại thuần cơ học, gợi ý USER tự gõ `/model sonnet` cho main (agent không đổi
     model phiên của chính nó được) — đây là biến usage lớn nhất.
   - **(b) Áp NGAY, không cần restart**: phiên hiện tại tuân bảng delta vừa in kể từ lời
     điều phối subagent kế tiếp (SessionStart hook chỉ để nhắc lại ở phiên mới).
   - **(c) Bất biến an toàn KHÔNG đổi ở mọi mode**: sàn Opus + inherit cho review
     vùng đắt; cấm hạ model cho bước đụng contract/logic phức tạp; 3-strikes; thang máy
     escalate 2-fail LUÔN được phép (guard bỏ qua spawn có chữ "ESCALATE" trong prompt).

### 4. Nhắc về guard (CHỈ khi đặt usage — `balance`/`quality` guard không soi)
PreToolUse guard `config-mode-agent-guard.sh` thoát sớm ở mọi mode khác `usage`, nên đặt
`balance` KHÔNG bật cảnh báo nào. Ở `usage` nó đang ở **WARN-mode**: spawn
implementer/planner/debugger bằng Opus/inherit/rỗng sẽ nhận systemMessage cảnh báo
(KHÔNG chặn). Cố ý spawn mạnh đúng ngoại lệ (vùng đắt/contract/escalate) ⇒ nêu lý do
rồi tiếp tục bình thường.

## Ghi chú
- Mở clone/worktree MỚI ⇒ về `quality` mặc định (an toàn mặc định, không phải bug).
- Design đầy đủ: `git show v1.0.0` (design doc của bộ khung, không ship theo plugin); mode thứ ba +
  nguồn số: `git show v1.0.0` (design doc của bộ khung, không ship theo plugin).
