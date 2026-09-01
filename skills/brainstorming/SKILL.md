---
name: brainstorming
description: "Động cơ THIẾT KẾ của cấp CHIA RỒI BÓC cửa A — dùng khi vừa có quyết định thiết kế chưa chốt VỪA không làm nổi trong một lượt. Sinh 2–3 phương án kèm đánh đổi, cắt YAGNI, soi lưới tách biệt, trình theo mục để user duyệt từng mục, rồi chia thành item. Không dùng cho việc đã rõ hoặc vừa một lượt."
---

# Brainstorming — biến ý tưởng thành thiết kế đã chốt

Skill này là **động cơ THIẾT KẾ**, không phải bộ phân loại và không phải vòng hỏi.

<HARD-GATE>
KHÔNG viết code, KHÔNG scaffold, KHÔNG gọi skill implementation nào cho tới khi đã trình thiết kế và
user duyệt — **trong phạm vi skill này**. Thiết kế có thể ngắn; cổng duyệt thì không co lại.
</HARD-GATE>

## Ba vai, đừng làm lẫn việc của nhau

| Ai | Trả lời câu gì | Dứt khi |
|---|---|---|
| **§0 hai cổng** | *đi đường nào* | đã ra một cấp việc |
| **`cc-harness:confirm-understanding`** | *user MUỐN gì* (loại `decision`) | brief đủ 7 mục |
| **skill này** | *xây thế nào* (loại `option`) | một phương án đã chọn + đã qua lưới tách biệt |

Ranh giới kiểm được bằng đúng một câu: **ai SINH ra câu trả lời.** `decision` thì user đã có sẵn
trong đầu, bạn chỉ moi ra. `option` thì **không ai có sẵn** — bạn phải nghĩ ra rồi user chọn. Hỏi
user một `option` mà không kèm phương án là đẩy việc thiết kế sang họ.

## Khi nào KHÔNG dùng skill này

Chỉ chạy ở **CHIA RỒI BÓC cửa A** — có quyết định thiết kế chưa chốt VÀ không làm nổi trong một lượt.
Ba đường còn lại không đi qua đây:

| Tình huống | Đường đúng |
|---|---|
| Không còn gì chưa chốt, làm được trong một lượt | **LÀM LUÔN** — nêu giả định 2–3 dòng rồi làm |
| Có gì chưa chốt nhưng làm được trong một lượt | **CHỐT RỒI GIAO** — `cc-harness:confirm-understanding`, ≤ 4 vòng, dứt khi brief đủ 7 mục. KHÔNG thiết kế, KHÔNG plan |
| Không còn gì chưa chốt nhưng quá nhiều việc | **CHIA RỒI BÓC cửa B** — vào THẲNG bước chia. Không có gì để quyết thì đào yêu cầu là nghi lễ |

> **Hai chỗ CỐ Ý lệch bản gốc `superpowers`, không phải sót.** Ai merge bản upstream mới đọc kỹ hai
> mục này trước khi "sửa lại cho đúng gốc":
>
> 1. **Bản gốc có bộ phân loại RIÊNG** (Spike / Bounded / Architectural). Bộ khung này bỏ nó, vì sau
>    khi §0 đã định tuyến thì ba đường co lại còn một: *Spike* đã là một BƯỚC của cửa A; *Bounded*
>    theo đúng định nghĩa của nó (*"thay đổi có phạm vi rõ vào code đã có"*) thì Cổng 1 = không hoặc
>    vừa một lượt ⇒ **không bao giờ vào được cửa A**. Giữ một bảng ba dòng mà hai dòng không đạt
>    được là trọng lượng chết.
> 2. **Bản gốc đòi approval ở MỌI đường**, kể cả việc nhỏ nhất (*"thứ co giãn theo độ đơn giản là
>    artifact, không bao giờ là approval"*). Bộ khung này giữ **LÀM LUÔN không chờ round-trip**: nêu
>    giả định 2–3 dòng rồi làm, vì diff nhỏ nên sửa rẻ và user đọc dòng giả định lúc nào cũng được.
>    Lập luận của bản gốc đúng ở chỗ *việc đơn giản là nơi giả định chưa soi gây phí nhiều nhất* —
>    nên bộ khung trả bằng hai thứ khác: dòng giả định BẮT BUỘC, và luật leo cấp khi lộ ≥ 2 cách hiểu
>    về hành vi. Trong phạm vi SKILL này thì HARD-GATE ở trên vẫn áp đủ.

## Checklist

Tạo một task cho từng mục, làm theo thứ tự.

1. **Đọc bối cảnh** — tệp, `PROJECT.md`, commit gần đây, pattern đang có.
2. **Đánh giá phạm vi TRƯỚC khi hỏi chi tiết** — yêu cầu tả nhiều hệ con độc lập (*"nền tảng có chat,
   lưu file, billing, analytics"*) ⇒ nói ra NGAY và chia trước. Đừng tiêu câu hỏi để tinh chỉnh chi
   tiết của một thứ đang cần chia.
3. **Hỏi làm rõ** — một câu mỗi lượt, ưu tiên multiple choice; mục tiêu là *mục đích · ràng buộc ·
   tiêu chí thành công*. Đây là phần chồng với `cc-harness:confirm-understanding`: brief 7 mục chưa đủ thì lấp
   ở đây, đừng chạy lại cả skill kia.
4. **Mời visual companion ĐÚNG LÚC** — không mời trước. Xem mục cuối.
5. **Sinh 2–3 PHƯƠNG ÁN** kèm đánh đổi + khuyến nghị. Mục dưới.
6. **Cắt YAGNI** trên MỌI phương án, trước khi trình. Mục dưới.
7. **Soi lưới tách biệt** cho từng đơn vị mới. Mục dưới.
8. **Trình thiết kế theo MỤC**, duyệt từng mục. Mục dưới.
9. **Ghi thiết kế đã chốt** vào **item của agent-tasks**. Mục dưới.
10. **Tự soi lại thiết kế** — 4 phép kiểm ở mục dưới.
11. **Chia thành item** — `parent` · `depends-on` · thứ tự bóc, đúng MỘT tầng (bộ luật §11). Mỗi item
    **quay lại hai cổng của §0**; đa số ra LÀM LUÔN.

## Sinh phương án — phần không ai làm thay được

- **2–3 phương án THẬT KHÁC NHAU.** Ba biến thể của cùng một cách không phải ba phương án; nó là một
  phương án với ba lần gõ khác nhau. Khác nhau ở chỗ *đánh đổi* khác nhau.
- **Mỗi phương án nêu đánh đổi bằng NGÔN NGỮ CỦA MIỀN**: cái gì khoá lại (schema, API, thứ tự
  migration), cái gì chậm đi, cái gì thêm phụ thuộc, cái gì khó rollback, cái gì khó test.
- **Khuyến nghị ĐẶT ĐẦU, kèm lý do.** Trình ba phương án ngang hàng rồi hỏi "anh chọn cái nào" là
  đẩy việc quyết định kỹ thuật cho người không đọc code.
- **Không có phương án thứ hai đáng nêu** ⇒ nói thẳng: *"chỉ có một cách hợp lý, vì <lý do>"*. Bịa ra
  một phương án tồi để trông có vẻ đã cân nhắc là làm hỏng chính phép cân nhắc.
- Phương án nào cũng **phải đi qua YAGNI và lưới tách biệt trước khi trình**, không phải sau.

## YAGNI — cắt trước khi viết

Gỡ khỏi MỌI phương án thứ **chưa có người dùng THẬT**: cờ cấu hình "để sau này linh hoạt", abstraction
cho ca thứ hai chưa tồn tại, tham số chưa ai truyền, nhánh cho môi trường dự án không nhắm tới. Đó là
nợ chưa vay mà đã trả lãi — phải đọc, phải test, phải giữ đúng ở mọi lần sửa sau.

Phân biệt với làm dở: YAGNI cắt thứ **chưa ai cần**, không cắt thứ **cần mà khó**. Xử lý lỗi, biên, và
ca thất bại của luồng ĐANG làm thì không phải YAGNI — chúng là chính việc. Chi tiết: bộ luật §6.

## Lưới tách biệt

Với mỗi đơn vị mới trong thiết kế, trả lời được sáu câu ở bộ luật §2 ("Lưới tách biệt"): làm MỘT việc
gì (không dùng chữ "và") · dùng thế nào · phụ thuộc gì · hiểu được mà không đọc ruột không · đổi ruột
mà không phá người gọi không · test độc lập được không.

Câu nào không trả lời được thì ranh giới còn hở — sửa THIẾT KẾ, đừng để lại cho lúc implement.

## Làm trong codebase có sẵn

Theo pattern đang có, kể cả khi bạn thích cách khác. Sửa thứ đang **vướng** công việc này (tệp phình,
ranh giới mờ) — nhưng **CẤM refactor không liên quan**: thấy chỗ khác dở thì tạo item mới. Ranh giới
hỏi bằng một câu: *"không sửa chỗ này thì việc đang làm có làm được sạch không?"* Chi tiết: §6.

## Trình thiết kế theo MỤC

- Mỗi mục **co giãn theo độ phức tạp của nó**: vài câu nếu đơn giản, tối đa ~200–300 từ nếu nhiều
  nút thắt. Một mục dài đều nhau ở mọi chỗ là dấu hiệu chưa hiểu chỗ nào khó.
- **Hỏi sau TỪNG mục** *"tới đây trông đúng chưa?"* — không dồn cả thiết kế rồi hỏi một lần. Sai ở
  mục 1 mà phát hiện ở mục 5 là làm lại bốn mục.
- Phủ đủ: kiến trúc · các thành phần · luồng dữ liệu · xử lý lỗi · cách test.
- Chỗ nào không thông thì **quay lại hỏi**, đừng trình tiếp cho xong.

## Ghi thiết kế đã chốt — KHÔNG lên remote

Đây là chỗ bộ khung lệch bản gốc nhiều nhất, và là chỗ dễ làm sai nhất.

| `integrations.agent_tasks` | Ghi vào đâu |
|---|---|
| BẬT | **item của agent-tasks**: `task_intake` với `brief` chứa thiết kế đã chốt; `task_attach_docs` đính spec/ledger sau |
| TẮT | `docs/wip/<lô>/design.md` — **local, gitignore, KHÔNG BAO GIỜ push** |

**Bản gốc ghi `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` và COMMIT. Bộ khung này CẤM.**
Lý do: md mô tả HIỆN TẠI thì outdate nhanh khi làm nhanh, và một thiết kế outdate trên remote **tệ hơn
không có thiết kế** — người sau tin nó rồi làm theo một hợp đồng không còn đúng. Sự thật dùng chung là
**code + item của tracker**. Lằn ranh đầy đủ (mô tả HIỆN TẠI vs ghi QUÁ KHỨ): bộ luật §10.

Cùng luật đó áp cho `specs/<capability>/spec.md`: local, gitignore, guard so với bản nền ở
`<git-dir>/cc-harness/spec-snapshot/` chứ không so git HEAD.

## Tự soi lại thiết kế

Sau khi ghi, đọc lại bằng mắt lạ — bốn phép, sửa tại chỗ, không cần soi vòng hai:

1. **Chỗ bỏ trống**: còn "TBD", "TODO", mục viết dở, yêu cầu mơ hồ? Sửa.
2. **Tự mâu thuẫn**: hai mục nói ngược nhau? Kiến trúc có khớp mô tả tính năng?
3. **Phạm vi**: đủ gọn cho một lô, hay còn cần chia nữa?
4. **Nước đôi**: câu nào đọc được theo hai nghĩa? Chọn một và viết rõ.

## Nguyên tắc

- **Một câu hỏi mỗi lượt.** Hỏi chùm gây choáng, và câu trả lời đầu thường làm câu sau vô nghĩa.
- **Mỗi câu hỏi kèm khuyến nghị.** Biến thẩm vấn thành duyệt.
- **KHÔNG `/clear`, KHÔNG `/compact`** giữa pha chốt thiết kế và pha chia item — chia cần toàn bộ dòng
  suy nghĩ của lúc chốt.
- **Ratchet MỘT CHIỀU.** Phức tạp lộ ra giữa đường ⇒ DỪNG, nói ra, leo lên. Không hạ giữa đường.
- **Không kể quá trình.** Response chỉ có thiết kế và lựa chọn — không nhắc tên skill, tên cấp việc,
  tên mục luật (bộ luật §0 "Luật output").

## Red flags

| Nghĩ thế này | Thực tế |
|---|---|
| "Việc này đơn giản, khỏi cần thiết kế" | Đơn giản nghĩa là thiết kế NGẮN, không phải không có. Hai câu rồi xin duyệt. |
| "Gọi nó là việc nhỏ để khỏi thiết kế" | Vươn tay lấy một cái nhãn để bỏ việc CHÍNH LÀ sự do dở — chọn đường nặng hơn. |
| "Thiết kế hiển nhiên rồi, tôi làm luôn trong lúc anh đọc" | Cổng là chỗ DUYỆT, không phải độ dài thiết kế. Trình rồi DỪNG tới khi nghe "được". |
| "Tôi hiểu loại app này nên nó nhỏ" | Nhỏ hay không đo bằng REPO, không bằng độ quen của bạn. Dự án mới không có luồng sẵn để sửa. |
| "Prototype chạy được rồi, giữ code luôn" | Prototype vứt đi cho ra một CÂU TRẢ LỜI. Giữ code là một yêu cầu MỚI — phân loại lại. |
| "Nó phình ra nhưng gần xong rồi, khỏi phân loại lại" | Phức tạp lộ ra giữa đường thì leo cấp. Dừng và nói ra. |
| "Đã duyệt thiết kế thì các item con khỏi duyệt" | Mỗi item quay lại hai cổng và có cổng duyệt riêng của cấp nó. |
| "Viết design doc rồi commit cho team đọc" | **CẤM.** Nó outdate trong tuần, rồi thành hợp đồng sai mà cả team tin. Vào item. |
| "Ba biến thể của cùng một cách là ba phương án" | Ba phương án khác nhau ở ĐÁNH ĐỔI, không ở cách gõ. |
| "Nêu một phương án tồi cho đủ ba" | Làm hỏng chính phép cân nhắc. Chỉ có một cách hợp lý thì nói thẳng thế. |

## Visual Companion

Công cụ trong browser để trình mockup, sơ đồ, phương án bằng hình. Là **một tool, không phải một
mode**: user đồng ý nghĩa là nó có sẵn cho câu hỏi cần hình, KHÔNG nghĩa mọi câu hỏi đi qua browser.

**Mời ĐÚNG LÚC, tuyệt đối không mời trước.** Chờ tới lần đầu có một câu hỏi mà **nhìn thì hiểu nhanh
hơn đọc** — một câu hỏi về mockup/layout/sơ đồ thật, không phải chỉ là *chủ đề* UI. Lúc đó mới mời,
và lời mời phải là **một message RIÊNG**, không kèm câu hỏi hay nội dung nào khác:

> "Phần này có lẽ dễ hơn nếu tôi cho anh xem — tôi dựng được mockup, sơ đồ, so sánh trong một tab
> browser. Nó còn mới và tốn token. Anh muốn không? Tôi mở giúp."

Chờ trả lời. Đồng ý ⇒ chạy server với `--open`. Từ chối ⇒ tiếp tục bằng text và **không mời lại** trừ
khi user tự nhắc.

**Quyết định theo TỪNG câu hỏi**, kể cả sau khi đã đồng ý. Phép thử: *user hiểu nhanh hơn khi NHÌN
hay khi ĐỌC?*

- **Browser**: mockup · wireframe · so sánh layout · sơ đồ kiến trúc · thiết kế cạnh nhau.
- **Terminal**: câu hỏi về yêu cầu · lựa chọn khái niệm · danh sách đánh đổi · A/B/C/D bằng chữ ·
  quyết định phạm vi.

Câu hỏi về chủ đề UI **không tự động** là câu hỏi cần hình. *"'Cá tính' ở đây nghĩa là gì?"* là câu
hỏi khái niệm ⇒ terminal. *"Layout wizard nào tốt hơn?"* ⇒ browser.

Đồng ý rồi thì đọc hướng dẫn chi tiết trước khi làm: `skills/brainstorming/visual-companion.md`.
