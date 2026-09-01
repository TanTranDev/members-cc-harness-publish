---
name: behavior-specs
description: Dùng khi task đụng hành vi quan sát được (UI/API/CLI/file state) và cần tạo/cập nhật spec hành vi trong specs/<capability>/spec.md, hoặc khi ledger cần khai mục SPEC (ADDED/MODIFIED/REMOVED/RENAMED), hoặc khi spec-check báo lỗi format/guard scenario-loss. Triggers — spec hành vi, behavior spec, sửa specs/, khai SPEC delta, spec-check fail, guard scenario-loss, allow-removals, skip_specs, npm run spec.
---

# behavior-specs — spec hành vi sống theo repo

Nguồn sự thật về hành vi **HIỆN TẠI** của từng capability, commit theo repo tại
`specs/<capability>/spec.md` — **LOCAL, gitignore, không bao giờ push** (bộ luật §10).
Gate: `cc-harness spec` — so với **bản nền** ở `<git-dir>/cc-harness/spec-snapshot/`, không so git HEAD.

## Khi nào áp dụng (và khi nào KHÔNG)

| Bản chất thay đổi | Nghĩa vụ spec |
|---|---|
| **Đụng hành vi quan sát được** | BẮT BUỘC: sửa `specs/<cap>/spec.md` TRONG CÙNG DIFF với code + khai mục `SPEC:` ở ledger |
| **KHÔNG đổi hành vi** (refactor/perf/move/văn xuôi) | Khai `SPEC: N/A — không đổi hành vi quan sát được` (skip_specs) |

Neo là **bản chất của thay đổi**, **KHÔNG** phải cỡ quy trình ⇒ áp cho **mọi cấp việc**, kể cả
`LÀM LUÔN`. **Không có diện miễn theo cỡ task** (trước v2.0 tầng S/F được miễn trắng — đó là lỗ: <!-- framework-check: allow-retired-term -->
task nhanh đổi hành vi thật thì `specs/` lặng lẽ sai). Task nhanh thường chỉ tốn 1–2 dòng spec.

Hành vi "quan sát được" = thấy từ NGOÀI: màn hình / response API / output CLI / trạng thái
file lưu lại. KHÔNG spec chi tiết bên trong (tên hàm/store/file/thuật toán) — đó là nguồn drift.

⚠️ **Đổi text/copy hiển thị KHÔNG tự động là `N/A`**: text người dùng thấy LÀ hành vi quan sát
được. Có scenario nào đang assert đúng chuỗi đó ⇒ phải cập nhật spec (MODIFIED); không scenario
nào nhắc tới ⇒ mới được khai `N/A`.

## Quy trình 3 bước (task đụng hành vi quan sát được)

1. **Trước khi code**: mở `specs/<cap>/spec.md` (chưa có ⇒ tạo mới theo format dưới,
   CHỈ phần hành vi task này đụng — KHÔNG backfill cả feature, ratchet).
2. **Trong cùng diff**: sửa requirement/scenario cho khớp hành vi MỚI, đồng thời với code.
3. **Gate cuối**: `npm run spec` (repo bộ khung: `node .claude/templates/spec-check.mjs`)
   xanh + khai mục `SPEC:` ở ledger `verify.md`.

## Format spec (bắt buộc)

    # <capability> — Spec hành vi

    ## Purpose
    <2–4 câu: capability cho ai, làm gì>

    ## Requirements

    ### Requirement: <tên hành vi>
    Hệ thống SHALL <phát biểu hành vi — PHẢI chứa SHALL hoặc MUST>

    #### Scenario: <tên tình huống>
    - **WHEN** <điều kiện/hành động>
    - **THEN** <kết quả quan sát được>

- Heading level là mã máy: `### Requirement:` đúng **3** dấu `#`, `#### Scenario:` đúng **4**.
  Sai level ⇒ ERROR (không im lặng như OpenSpec gốc).
- Mỗi requirement **≥ 1 scenario**; mỗi scenario có **WHEN** và **THEN**.
- 1 capability = 1 file kebab-case; requirement ≤ ~500 ký tự, file ≤ ~150 dòng (warning
  = tín hiệu tách capability). Thiếu `## Purpose` **hoặc Purpose < 50 ký tự** ⇒ warning.
- KHÔNG section `ADDED/MODIFIED/REMOVED/RENAMED` trong file spec (delta chỉ ở ledger + git diff).

### Ví dụ TỐT (hành vi quan sát được)

    ### Requirement: Gửi lại tin thất bại
    Hệ thống SHALL cho người dùng gửi lại một tin nhắn đã gửi thất bại.

    #### Scenario: Bấm gửi lại
    - **WHEN** người dùng bấm "gửi lại" trên một tin ở trạng thái lỗi
    - **THEN** tin chuyển sang trạng thái đang gửi và biến mất khỏi danh sách lỗi

### Ví dụ XẤU (chép implementation — CẤM)

    ### Requirement: retryMessage()
    `chatStore.retryMessage(id)` gọi `api.post('/messages')` rồi set `status='sending'`.

Sai vì: nêu tên hàm/store/endpoint nội bộ ⇒ spec drift theo mỗi lần refactor.

## Mục `SPEC:` trong ledger

Đặt cạnh RISK trong `docs/wip/<task>/verify.md`:

    SPEC:  <capability> <ADDED|MODIFIED|REMOVED|RENAMED> "<Requirement>" — <1 dòng tóm tắt>
    hoặc:  SPEC: N/A — không đổi hành vi quan sát được

Reviewer đối chiếu 3 chiều: diff `specs/` ↔ diff code ↔ khai báo SPEC. Thiếu mục SPEC (mọi task) ⇒
reviewer TỪ CHỐI (cùng luật với thiếu `RISK (khai)`). Diff xoá
requirement/scenario là **đổi hành vi quan sát được** ⇒ dấu hiệu số 1 ở bộ luật §12 ⇒ reviewer phải phán quyết TỪNG dòng
(cờ ⚠️ nghĩa "chưa loại trừ được"; cửa "có cần review model mạnh" là danh sách VÙNG ĐẮT ở CLAUDE.md).

## Khi guard scenario-loss CHẶN

`spec-check` so working-tree với `git show HEAD:` — requirement/scenario **biến mất** ⇒
ERROR liệt kê đích danh. Hai đường xử lý:

- **Vô tình** (không định xoá): khôi phục scenario/requirement bị mất.
- **Chủ đích** (đã khai REMOVED/RENAMED ở SPEC): chạy lại
  `node script/spec-check.mjs --allow-removals` (bộ khung:
  `node .claude/templates/spec-check.mjs --allow-removals`) — dòng lệnh này trong ledger
  là bằng chứng chủ đích cho reviewer.

Guard bỏ qua file chưa có trong HEAD (spec mới) — không chặn lần tạo đầu.

## Đọc thêm
- Bản 1 trang cho người đọc + cách truyền tham số cho validator: `specs/README.md`
  (skill này là bản canonical của format + luật thi hành).
- Bản nền của guard: `<git-dir>/cc-harness/spec-snapshot/` — ghi sau mỗi lượt `cc-harness spec` XANH.
