## 1. Contract tích hợp (BẤT BIẾN)

Mini-app sống trong hệ Module Federation: slug, container bundle, entry expose, AppRegistry name
và version các `shared` deps là **contract đã chốt với nền tảng** — bảng giá trị cụ thể xem
`PROJECT.md`.

> ⚠️ KHÔNG tự ý đổi bất kỳ giá trị contract nào. Đổi slug = phải sửa đồng bộ TẤT CẢ vị trí
> hardcode liệt kê trong PROJECT.md.
> ⚠️ Tự ý đổi version trong `rspack.config.mjs::shared` → MF runtime warn + duplicate copy. Cần
> đổi ⇒ ngừng và hỏi người phụ trách tích hợp.

Mini-app là **remote bundle**, không ship được native code ⇒ cần **native module mới** cũng là
đụng contract: phải có sẵn ở host. Ca thật đã suýt lọt: một task *"thêm bong bóng preview HTML"*
có Q1/Q2/Q3 đều bình thường nhưng WebView là native module.
