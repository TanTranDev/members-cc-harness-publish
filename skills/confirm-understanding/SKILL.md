---
name: confirm-understanding
description: Use when a request has ANY unsettled decision that only the user can answer — the clarify loop of cấp CHỐT RỒI GIAO. Multi-round, one question per round, each with 2–4 options and a recommendation. Stops when the 7-field brief is complete. Triggers on any "làm X / fix Y / thêm Z / đổi W" where there is more than one reasonable reading of the desired behaviour.
---

# Vòng hỏi — chốt hiểu bằng nhiều vòng, mỗi vòng một câu

## Đây là gì

Skill này **là vòng hỏi của cấp `CHỐT RỒI GIAO`** (bộ luật §0 "Phân loại việc"), không phải một cổng
đứng trước mọi việc.

- **Cổng 1 = không** (không còn quyết định nào chưa chốt) ⇒ cấp **LÀM LUÔN** ⇒ **KHÔNG dùng skill
  này.** Nêu cách hiểu + giả định 2–3 dòng trong response cuối rồi làm luôn, không chờ round-trip.
- **Cổng 1 = có** ⇒ chạy skill này.
- Quá 4 vòng mà brief chưa đủ ⇒ **lên cấp `CHIA RỒI BÓC`**, mang theo mọi câu đã chốt, KHÔNG hỏi lại.

Nguyên tắc cốt lõi: **không giao subagent, không viết code cho tới khi brief đủ 7 mục.**

## Bước 0 — Tách *fact* khỏi *decision* (BẮT BUỘC, trước khi hỏi câu nào)

Tra được bằng filesystem / graph / tool ⇒ **fact** ⇒ **TỰ TRA, CẤM HỎI.**
Thuộc về ý muốn của user ⇒ **decision** ⇒ hỏi và chờ.

Mỗi câu hỏi thừa là một vòng chờ người — đắt hơn token. Cổng 2 (dung lượng) và trục rủi ro là *fact*;
chỉ Cổng 1 là *decision*.

## Điều kiện DỨT — brief đủ 7 mục

Không dứt vì "cảm thấy đã chắc". Dứt khi bảy mục dưới đây có nội dung thật (bộ luật §10):

| # | Mục | Đủ nghĩa là |
|---|---|---|
| 1 | Mục tiêu | việc này giải quyết vấn đề gì, cho ai |
| 2 | Phạm vi IN | cụ thể những gì phải làm |
| 3 | Phạm vi OUT | thứ dễ hiểu nhầm là thuộc việc này nhưng KHÔNG làm |
| 4 | Hành vi mong muốn | luồng chính + edge case user quan tâm |
| 5 | Có đụng backend không | gọi/đổi API/WS không, endpoint nào (mức user biết) |
| 6 | Ràng buộc | design có sẵn · deadline · thứ phải giữ nguyên |
| 7 | Tiêu chí hoàn thành | **đo được**, không cảm tính |

Mục 5 = "có" mà `docs-raw/` chưa có spec API ⇒ **DỪNG**, liệt kê CHÍNH XÁC thứ cần user nộp. Đó là
*fact bên ngoài*, vòng hỏi không giải được, và thiếu nó thì bạn sẽ bịa contract.

## Một vòng gồm gì

1. **Nói lại cách hiểu HIỆN TẠI** bằng lời của mình — không copy nguyên văn user. Ngắn.
2. **Nêu ĐÚNG MỘT điểm chưa chắc.** Một câu mỗi lượt, đi theo cây quyết định, giải phụ thuộc trước:
   hỏi chùm gây choáng, và câu trả lời đầu thường làm câu sau thành vô nghĩa.
3. **`AskUserQuestion` với 2–4 lựa chọn**, mỗi lựa chọn ghi rõ **được gì / mất gì**, **khuyến nghị đặt
   đầu**. Biến thẩm vấn thành **duyệt**: user gật hoặc sửa, không phải nghĩ từ số 0 — và nó ép bạn có
   lập trường, nên hiểu lầm lộ ra NGAY thay vì sau khi code xong.
4. **Văn xuôi trước câu hỏi ≤ ~15 dòng** (bộ luật §0 "Luật output"). CẤM diễn giải dài rồi mới hỏi;
   CẤM trình phương án bằng văn xuôi thay cho lựa chọn.

Sau mỗi vòng: cập nhật brief, đánh dấu mục nào vừa đủ. User sửa ⇒ xác nhận lại đúng điểm đã sửa.

## Khi brief đủ

1. Ghi brief vào **item của agent-tasks** (bộ luật §14). `agent_tasks` tắt ⇒ `docs/wip/<lô>/brief.md`.
2. **Giao subagent làm luôn** — bàn giao tự chứa (§11): quyết định đã chốt · tệp được đọc/sửa ·
   interface trích NGUYÊN VĂN · tiêu chí nghiệm thu.
3. **KHÔNG thêm một vòng duyệt brief.** Vòng hỏi cuối chính là duyệt: user vừa trả lời xong thì không
   có gì mới để duyệt. Dán brief ở dạng gọn vào response để user chặn sớm nếu lệch.
4. **KHÔNG viết plan doc, KHÔNG viết design doc** ở cấp này. Đổi hành vi quan sát được thì **vẫn sửa
   `specs/`** trong cùng diff — đó là tài liệu của SẢN PHẨM, không phải của quá trình.

**KHÔNG `/clear`, KHÔNG `/compact`** giữa vòng hỏi và lúc giao việc: bàn giao cần toàn bộ dòng suy
nghĩ của lúc chốt.

## Hai ngoại lệ (KHÔNG có ngoại lệ thứ ba)

1. **User chủ động ép bỏ qua khi gấp** ("gấp, làm luôn", "skip confirm", "khỏi hỏi"): ghi rõ một dòng
   *"bỏ vòng hỏi theo yêu cầu — tôi tự suy luận, có rủi ro lệch ý"*, vẫn nêu giả định ngắn trước khi
   làm để user chặn sớm.
2. **Cổng 1 = không** ⇒ cấp LÀM LUÔN, không dùng skill này (xem đầu tệp). Nhưng: có ≥ 2 cách hiểu khác
   nhau về **HÀNH VI** thì Cổng 1 = **có** ⇒ cấp đổi ⇒ quay lại đây. Trục rủi ro (chạm thứ đắt)
   **KHÔNG** làm mất ngoại lệ này — nó chỉ nâng mức cẩn thận, không đổi cấp.

**Ngoài hai ca trên: agent KHÔNG bao giờ tự bỏ qua hay tự nhận "đã hiểu rồi".**

## Red flags — DỪNG, quay lại vòng 1

- "Yêu cầu rõ quá rồi, code luôn cho nhanh."
- "Tôi hiểu rồi, khỏi nói lại."
- "Vừa làm vừa hiểu cũng được."
- "Hỏi lại phiền user."
- "Brief thiếu mục 3 với mục 7 nhưng chắc không sao."

## Rationalization table

| Lý do tự bịa | Thực tế |
|---|---|
| "Việc đơn giản, hiểu ngay" | Hiểu của bạn ≠ ý user. Nói lại 30 giây rẻ hơn làm lại. |
| "User mô tả kỹ rồi" | Mô tả kỹ vẫn có giả định ẩn (chiều, phạm vi, edge case). Nêu ra để chốt. |
| "Hỏi nhiều làm phiền" | Một lần chốt đầu < nhiều vòng sửa code sau. |
| "Gấp nên bỏ qua" | Chỉ USER được quyết "gấp → bỏ", không phải agent. |
| "Brief là giấy tờ, làm cho có" | Brief là bản ghi đi vào item cho team đọc lại, và là điều kiện dứt ĐO ĐƯỢC của vòng hỏi. Bỏ nó thì vòng hỏi không có điểm dừng. |
| "Còn một điểm chưa chắc nhưng hỏi vòng thứ 5 thì lâu" | Quá 4 vòng là tín hiệu việc PHỨC TẠP HƠN bạn tưởng ⇒ lên cấp CHIA RỒI BÓC, không phải hỏi thêm. |
