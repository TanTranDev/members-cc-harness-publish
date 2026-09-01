# Khoá của `claude_config.json`

Khoá nào mới, khoá nào đã bỏ, và bỏ vì sao. Kiểm bằng `cc-harness config --check`.

## Khoá của `claude_config.json` — đổi ở v1.1.0

| Khoá | Trạng thái | Làm gì |
|---|---|---|
| `risk` (`hot_zones`, `fan_in_warn`) | **ĐÃ BỎ** | Gỡ khỏi config. Danh sách single-writer chuyển sang `cc-lock.config.json` của plugin cc-lock; "có cần review không" nay là phán đoán theo THỨ DIFF ĐÃ LÀM (§12). `cc-harness doctor` và `config --check` WARN nếu còn khai |
| `review` (`confirm`, `soft_cap`) | **MỚI** | `confirm: "on"` ⇒ user chốt mỗi việc có vào luồng review không (mặc định dự án mới); `"off"` ⇒ agent tự đánh giá. `soft_cap` (mặc định 3) là trần MỀM số vòng review, hết trần thì trình user tiếp/dừng |

Lệnh `cc-harness risk` đã bị xoá cùng cơ chế nó phục vụ. Script CI nào còn gọi nó sẽ nhận exit 2 —
đó là ồn có chủ đích, không phải hồi quy.

## Khoá hiện có, đầy đủ

| Khoá | Ai đọc | Vai |
|---|---|---|
| `project` (`name`, `src_dir`, `aliases`) | máy | định danh + cây mã nguồn cho `structure` |
| `gate.commands` | máy | `cc-harness gate` chạy ĐÚNG mảng này, theo thứ tự |
| `structure` (`max_loc`, `shared_features`, `baseline`) | máy | 4 luật kiến trúc §2, ratchet theo baseline |
| `review` (`confirm`, `soft_cap`) | máy + agent | có vào luồng review không, và ai chốt (§12) |
| `skills` (`required`, `hints`) | agent | skill riêng của stack — đường TỔNG QUÁT, không chỉ UI |
| `design_system` (`ds-web`, `ds-mobile`) | agent | đường TƯƠNG THÍCH cho hai bề mặt UI |
| `rules.overrides` | máy | tuỳ biến bộ luật theo mục (`replace`/`append`/`remove`) |
| `observe` | máy | đích + cách lấy bằng chứng quan sát |
| `integrations` (`cc_lock`, `cbm`, `rtk`, `agent_tasks`) | máy + agent | `required`/`optional`/`off` |
| `policy.mode` | máy | `quality` · `balance` · `usage` |

Khoá lạ ⇒ WARN "gõ sai, hay thừa?". Khoá đã BỎ ⇒ WARN riêng nói nó chết vì sao và thay bằng gì —
hai ca khác nhau, cố ý không gộp: người khai một khoá đã bỏ sẽ đi sửa chính tả nếu chỉ nhận WARN chung.
