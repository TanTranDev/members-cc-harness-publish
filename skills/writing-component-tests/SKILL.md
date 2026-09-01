---
name: writing-component-tests
description: Dùng khi viết hoặc sửa test cho component UI ở stack mà renderer test KHÔNG chạy layout engine thật (React Native react-test-renderer/RNTL, web + jsdom) — quyết định assert gì, bỏ gì, và dùng pattern nào thay thế. Triggers — viết test cho component, .test.tsx, .spec.tsx, render test, TDD cho UI, test màu light dark, assert token trong test, test vô bổ, test tautology, change-detector test, bug remount, component nháy, state bị reset, mount-counter, test UI có cần không.
---

# writing-component-tests — assert gì ở tầng không có layout engine

Tầng component test trả lời được **ít hơn** trực giác nhiều. Skill này vạch ranh giới đó, và — quan
trọng hơn — đưa **thứ thay thế** cho những assert phải bỏ. Bỏ mà không thay là làm yếu lưới, không
phải dọn rác.

Bằng chứng nền: `git show v1.0.0` (design doc của bộ khung, không ship theo plugin).

---

## 0. Tiền đề — kiểm TRƯỚC, skill tự tắt nếu sai

**Câu hỏi**: renderer của tầng component test có chạy **layout engine thật** không?

**Phép thử một câu**: *"Muốn có `onLayout` thì phải tự `fireEvent.layout()` với số do chính mình bịa
ra?"*

- **Có** ⇒ renderer **không** có layout ⇒ **áp dụng skill này**.
- **Không** ⇒ nói ra *"stack này có layout engine thật, skill `cc-harness:writing-component-tests` không áp
  dụng"* rồi dừng. **Không được im lặng bỏ qua.**

| Stack | Có layout ở tầng component test? |
|---|---|
| React Native + `react-test-renderer` / RNTL | ❌ **Không** |
| Web + jsdom / happy-dom | ❌ Không (`getBoundingClientRect` chưa implement — jsdom #3621) |
| Flutter widget test | ✅ Có (`tester.getSize()` assert kích thước thật) |
| Android Espresso · iOS XCUITest | ✅ Có (chạy trên device/binary thật) |
| Web + browser thật (Playwright) | ✅ Có |

⚠️ **"FE/Mobile" là nhãn SAI cho ranh giới này.** Flutter là Mobile nhưng widget test assert được
kích thước thật. Điều kiện là **năng lực renderer**, không phải loại dự án.

⚠️ **React Native docs KHÔNG BAO GIỜ nói tường minh điều này.** Docs chỉ ghi *"do not take into
account any iOS, Android, or other platform code"*. Hệ quả quan trọng nhất — "không chạy Yoga" —
sống bằng folklore. Đây là lý do một team giỏi vẫn có thể tưởng 8.000 test xanh nói được điều gì đó
về layout.

---

## 1. Tiêu chí trung tâm — một câu, không cần công cụ nào

> **Test chỉ nên phải sửa khi có behavior change.**
> — *Software Engineering at Google*, ch.12: *"the one case when we expect to have to make updates
> to the system's existing tests"*

**Tự kiểm trước mỗi assert**:

> *"Đổi hằng số / token mà KHÔNG đổi hành vi nào người dùng thấy — assert này có phải sửa không?"*
> **Có ⇒ assert sai bản chất.**

Ca thật: đổi accent của design system ⇒ **497 assert** phải sửa, trong khi hành vi quan sát được
**không đổi** một chút nào. Cả lớp assert đó sai bản chất, không phải sai chi tiết.

Định nghĩa kèm theo, cùng nguồn — **brittle test**: *"fails in the face of an unrelated change to
production code that does not introduce any real bugs."*

---

## 2. Cái bẫy HAI ĐẦU — sửa một đầu sẽ rơi vào đầu kia

| Hình dạng | Bệnh | Hậu quả |
|---|---|---|
| `expect(style.color).toBe(tokens.color.ink)` | **tautology** | Code và test cùng đọc **một nguồn** ⇒ **không bao giờ đỏ vì lý do đúng** |
| `expect(style.width).toBe(28)` | **change-detector** | **Đỏ oan** mỗi lần đổi token, dù không có bug nào |

Hai lỗi này **đối nghịch nhau**, nên chữa cái này bằng cái kia là đi vòng tròn: nguyên tắc DAMP
(*"a little duplication is OK in tests"*) đẩy về phía change-detector; bản năng DRY đẩy về phía
tautology.

⇒ **Thứ đáng assert không phải GIÁ TRỊ. Là QUAN HỆ và HÀNH VI quan sát được.**

⚠️ Điều khiến lớp lỗi này sống dai: **assert tautology qua được code review** vì trông đủ nghi thức
— có lời gọi, có expected, có actual. Reviewer hiếm khi hỏi câu duy nhất phá được nó:
***"expected đến từ đâu?"***

---

## 3. Tầng này trả lời được gì

| ✅ TRẢ LỜI ĐƯỢC | ❌ KHÔNG trả lời được — **đừng cố assert** |
|---|---|
| Wiring — prop/callback có tới đích không | Trông có đúng không |
| Nhánh nào được render | Có bị **clip / phủ / tràn / lệch** không |
| **Danh tính cây** — có remount/unmount không | Khoảng trắng, canh lề, **tương phản thật** |
| Chuỗi event → state → hệ quả quan sát được | Animation có mượt không |
| **Bất biến QUAN HỆ** (A ≠ B, A ≤ B) | **Giá trị tuyệt đối** chép từ token |

Cột phải là ranh giới **cứng, về nguyên lý** — không phải "khó" mà là "không có dữ liệu để trả lời".
Với chúng, luật là **chuyển sang bằng chứng mắt** (CLAUDE.md §0 "Quan sát"), **không** cố diễn đạt
bằng assert.

---

## 4. Hai pattern thay thế

### 4.1 Assert QUAN HỆ thay assert giá trị

```ts
// ❌ tautology — code viết tokens.color.ink, test assert tokens.color.ink
expect(flatten(node.props.style).color).toBe(lightTokens.color.neutral.ink);

// ✅ quan hệ — ghim đúng thứ đang canh: HAI NHÁNH PHẢI KHÁC NHAU
expect(colorOf(unreadRow)).not.toBe(colorOf(readRow));

// ✅ bất biến số học từ token — chạy trong .test.ts, KHÔNG render gì
expect(paddingXTight + channelAvatar + overhang * 2).toBeLessThanOrEqual(LIST_PEEK_WIDTH);
```

Khuôn thứ ba là **khuôn đáng nhân bản nhất**: nó là unit test logic thuần, không render, và đã được
chứng minh không rỗng bằng mutation (đổi `overhang * 2` → `overhang * 1` ⇒ đỏ).

Nguyên tắc rút gọn: **đang canh một NHÁNH thì assert sự KHÁC BIỆT giữa hai nhánh, đừng assert giá
trị của một nhánh.**

### 4.2 Mount-counter — bắt bug "danh tính cây"

**Lớp bug**: `cond ? <View><Leading/><Badge/></View> : <Leading/>` — đổi **element type ở cùng vị
trí cây** ⇒ React **remount** ⇒ state nội bộ của con (ảnh đã tải, animation đang chạy, input chưa
commit) **bị reset**. Triệu chứng: avatar nháy về chữ viết tắt mỗi lần đổi nhánh.

Đây là **hành vi được đặc tả**, React docs có hẳn mục *"Different components at the same position
reset state"*: *"it's the position in the UI tree—not in the JSX markup—that matters to React"*.
Cách sửa được document sẵn: `key` prop, hoặc render ở vị trí khác. **Không phải góc khuất của React
— chỉ là không ai nghĩ tới.**

```tsx
let mounts = 0;
const Probe: React.FC = () => {
  useEffect(() => { mounts += 1; }, []);
  return null;
};

// render → đi ĐÚNG đường người dùng đi để đổi nhánh → assert
expect(mounts).toBe(1);   // remount ⇒ 2 ⇒ đỏ
```

Chi phí ≈ **0**: hạ tầng test hiện có, không native, không simulator, không flaky, chạy CI headless.

⚠️ **Ưu tiên assert theo TRIỆU CHỨNG, không theo cấu trúc code.** Ghim *"ảnh không bị ẩn lại"* tốt
hơn đếm mount — đếm mount sẽ đỏ **cả khi refactor cây vô hại**, tức tự biến thành change-detector.
Mount-counter chỉ dùng khi triệu chứng không quan sát được trực tiếp.

⚠️ **Không có lint rule nào bắt lớp bug này.** Đã tra `eslint-plugin-react`, `eslint-react`, bộ rule
chính thức của React. `react/no-unstable-nested-components` và `react-hooks/static-components` bắt
ca *định nghĩa component lồng nhau* — **khác cơ chế**, điểm mù đúng ngay ca này. Nên nó phải sống
bằng pattern + câu hỏi review, không bằng máy.

---

## 5. Bẫy của chính pattern quan hệ

Cặp light/dark assert một token **giống nhau ở hai mode** (vd accent không đổi theo mode) ⇒ **mutant
tương đương, chứng minh 0** — dù trông như đang phủ hai nhánh. Đã gặp thật.

**Bắt buộc tự kiểm**: *hai nhánh có khác nhau ở **ĐÚNG thứ** đang assert không?*

- Không ⇒ đổi thứ được assert sang thứ thật sự khác nhau giữa hai nhánh;
- Hoặc thêm **probe** đọc trạng thái hiệu lực (vd `effectiveMode`) để chứng minh ca thứ hai thực sự
  là nhánh thứ hai, chứ không phải cùng một nhánh chạy hai lần.

Nguyên tắc chung: **một assert chỉ có giá trị khi tồn tại một thay đổi SAI THẬT làm nó đỏ.** Không
nghĩ ra được thay đổi đó ⇒ assert không bảo vệ gì.

---

## 6. Ghi chú cho agent — đây là xu hướng ĐO ĐƯỢC, không phải rủi ro lý thuyết

Nghiên cứu trên test do LLM sinh (TestPilot, JavaScript/npm): **median chỉ 61,4%** test chứa
*non-trivial assertion* — assertion phụ thuộc ít nhất một hàm của module đang test. Tức **~39%
assertion do LLM sinh không hề phụ thuộc vào thứ đang được test**. Và bỏ toàn bộ test trivial đi thì
coverage chỉ giảm median **7,5%** ⇒ chúng là **nhiễu**, không mang độ phủ.

Nghiên cứu thứ hai (TOSEM 2026, 20.505 suite từ 4 LLM): test do LLM sinh **nhất quán** mang smell
*Assertion Roulette* và *Magic Number Test*.

⇒ Khi bạn — một agent — viết test, xu hướng mặc định của chính bạn là sinh ra đúng lớp assert mà
skill này đang cấm. Đọc lại §1 trước khi gõ assert đầu tiên.

---

## Red flags — dừng lại, quay về §1

| Ý nghĩ | Thực tế |
|---|---|
| "Assert màu cho chắc, không thừa đâu" | Thừa **hoặc** brittle. Không có đường thứ ba — xem §2 |
| "Component này đụng theme nên phải có test light + dark" | Chỉ khi có **nhánh thật** theo mode. Đọc token rồi tự đổi màu ⇒ token đã có lưới riêng |
| "Thêm assert kích thước để chắc layout đúng" | Renderer **không có** layout. Assert đó chứng minh khai báo, không chứng minh hiển thị — §0 |
| "Snapshot cho nhanh" | Snapshot là change-detector quy mô lớn: đỏ với mọi refactor, không nói được cái gì hỏng |
| "Test này khó nghĩ, viết assert tồn tại vậy" | `toBeDefined()` trên thứ kiểu đã chứng minh khác `undefined` là assert rỗng |
| "Đổi token xong test đỏ, sửa test cho xanh" | Test đỏ **oan** là triệu chứng của change-detector. Sửa **assert**, đừng sửa **giá trị mong đợi** |

---

## Checklist trước khi coi test là xong

- [ ] §0 đã kiểm: renderer thật sự không có layout engine
- [ ] Mỗi assert vượt được câu hỏi §1: *đổi hằng số mà không đổi hành vi thì nó có phải sửa không?*
- [ ] Không assert **giá trị tuyệt đối** (cả token lẫn số trần) khi không có nhánh đứng sau
- [ ] Assert canh nhánh viết dạng **quan hệ** (`not.toBe`, `toBeLessThanOrEqual`), không dạng giá trị
- [ ] Cặp hai nhánh **khác nhau ở đúng thứ được assert** (§5)
- [ ] Diff có ternary đổi element type ⇒ đã cân nhắc **remount**, có test hoặc có `key`
- [ ] Không assert nào đang cố trả lời "trông thế nào" (§3 cột phải)
- [ ] Với mỗi assert: **nghĩ ra được** một thay đổi sai thật làm nó đỏ
