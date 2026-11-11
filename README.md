# Tiny Days · Nhật ký bé

Dùng tại **https://our-tinydays.web.app**

Web app miễn phí để cả nhà cùng ghi cữ bú (sữa công thức, sữa mẹ), hút sữa, thay tã, giấc ngủ, cân đo và tiêm chủng của bé. Mỗi người dùng điện thoại của mình, dữ liệu đồng bộ ngay.

## Dùng thế nào

1. Mở app, đăng nhập bằng **Google** hoặc nhận **link đăng nhập qua email** (không cần mật khẩu).
2. Bấm **Tạo nhật ký mới cho bé**: nhập tên bé, ngày giờ sinh, bé trai hay bé gái, và bạn là gì của bé (Ba, Mẹ, Ông, Bà, Bảo mẫu, Khác).
3. Vào **Cài đặt › Thành viên › Sao chép link mời**, gửi cho người nhà.
4. Người nhà mở link, đăng nhập, bấm **Xin tham gia**. Bạn thấy yêu cầu ở thẻ đầu tab Hôm nay và trong Cài đặt, bấm **Duyệt**.

Chỉ người đã được duyệt mới xem và ghi được nhật ký. Link mời bị lộ cũng không sao, vì vẫn phải được duyệt. Muốn link cũ hết hiệu lực, bấm **Đổi link mời**.

**Chủ nhật ký** sửa được hồ sơ bé, duyệt và xóa thành viên, đặt người khác làm chủ, đổi link mời và xóa cả nhật ký. **Thành viên** ghi và sửa mọi mục, sửa tên gọi của mình và tự rời nhật ký. Một nhật ký có thể có nhiều chủ (ví dụ cả ba và mẹ).

Mỗi nhật ký dành cho một bé. Có hai bé thì tạo hai nhật ký, đổi qua lại ở **Cài đặt › Đổi nhật ký**.

## Cài ra màn hình chính

- **Android (Chrome):** menu ⋮ › **Thêm vào màn hình chính**.
- **iPhone (Safari):** nút Chia sẻ › **Thêm vào MH chính**. Lần đầu mở biểu tượng mới cần đăng nhập lại. Nếu đăng nhập bằng email trên app đã cài: giữ tay vào link trong email, chọn **Sao chép**, rồi dán vào ô **Dán link đăng nhập** trong app.

## Các tab

- **Hôm nay**: nút ghi nhanh (Sữa CT, Sữa mẹ, Hút sữa, Tã ị, Tã ướt, Ngủ/Thức dậy), giờ cữ tiếp theo, sữa cộng dồn so với mục tiêu theo cân nặng, nhắc vitamin D3, mũi tiêm và lịch khám sắp tới.
- **Lịch sử**: xem, sửa, thêm mục theo từng ngày.
- **Việc**: danh sách việc dùng chung, thêm bằng giọng nói (🎤) nếu trình duyệt hỗ trợ.
- **Biểu đồ**: tổng sữa, số lần thay tã, sữa hút được trong 7 ngày.
- **Sức khỏe**: lịch tái khám, biểu đồ tăng trưởng so với chuẩn WHO 0–24 tháng (theo giới tính của bé), lịch tiêm tham khảo theo chương trình TCMR và vắc xin dịch vụ ở Việt Nam.
- **Bài viết**: bài tham khảo trong thư mục [posts/](posts/).
- **Cài đặt**: thành viên, hồ sơ bé, giao diện sáng/tối, tài khoản, quyền riêng tư.

Giờ nhắc cữ bú = giờ cữ trước + ml cữ trước ÷ (cân nặng × hệ số ml/kg/ngày ÷ 24 giờ). Hệ số mặc định 150, mỗi nhà sửa được trên thẻ Sữa cộng dồn hoặc Cài đặt › Hồ sơ bé (100–200); chưa có cân nặng hoặc ml thì nhắc sau 2 tiếng. Biểu đồ, lịch tiêm và giờ nhắc **chỉ để tham khảo**, hãy theo chỉ định của bác sĩ.

## Quyền riêng tư

- App lưu: email đăng nhập, tên gọi và quan hệ với bé của từng thành viên, hồ sơ bé (tên, ngày giờ sinh, giới tính) và những gì cả nhà ghi.
- Dữ liệu nằm trên Google Firebase (Firestore, khu vực `asia-southeast1`). Quyền đọc/ghi được kiểm tra ở máy chủ bằng [firestore.rules](firestore.rules): chỉ thành viên đã duyệt của nhật ký đó.
- Không quảng cáo, không bán dữ liệu, không phân tích hành vi.
- Xóa bất cứ lúc nào: **Cài đặt › Tài khoản** có Rời nhật ký, Xóa toàn bộ nhật ký (chủ) và Xóa tài khoản.

## Tự chạy một bản riêng

Mã nguồn là HTML/CSS/JS thuần, không cần build.

### Xem thử trên máy (không cần Firebase)

```
npx serve .
```

Khi `js/firebase-config.js` để trống, app chạy **chế độ thử**: dữ liệu chỉ nằm trên trình duyệt đang mở. Không mở thẳng `index.html` vì trình duyệt chặn ES module.

### Đưa lên Firebase

1. Tạo project ở [Firebase Console](https://console.firebase.google.com) (không cần Google Analytics).
2. **Build › Authentication › Get started › Sign-in method**: bật **Google**, và bật **Email/Password** với tùy chọn **Email link (passwordless sign-in)**.
3. **Build › Firestore Database › Create database**: chọn `asia-southeast1`, **production mode**.
4. **Project settings › General › Your apps**: đăng ký web app `</>`, chép `apiKey`, `projectId`, `appId` vào [js/firebase-config.js](js/firebase-config.js). Đặt `authDomain` là `<project-id>.web.app` (cùng tên miền với app, để đăng nhập Google chạy được trên iPhone).
5. Deploy:

   ```
   npx firebase-tools login
   npx firebase-tools deploy --only hosting,firestore --project <project-id>
   ```

   Lệnh này đẩy app, rules và index (`firestore.indexes.json`, cần cho việc tìm nhật ký của mình).
6. Nên bật thêm **App Check** (reCAPTCHA) cho Authentication và Firestore, và đặt **budget alert** trong Google Cloud Billing.

Gói miễn phí (Spark) giới hạn số email đăng nhập gửi mỗi ngày. Nhiều người dùng thì cần gói Blaze (trả theo dùng, có budget alert).

### Sao lưu và khôi phục

1. `npm install`
2. **Project settings › Service accounts › Generate new private key**, lưu thành `~/.nhat-ky-be/service-account.json` (để ngoài repo). Key có toàn quyền với database. Có thể chỉ chỗ khác bằng `GOOGLE_APPLICATION_CREDENTIALS`.
3. `familyId` là 20 ký tự ngay sau `#join=` trong link mời (trước dấu chấm).

```
npm run backup -- <familyId>
npm run restore -- backups/nkb-2026-11-05-0900.json          # chỉ in kế hoạch
npm run restore -- backups/nkb-2026-11-05-0900.json --yes    # ghi thật
```

### Bài viết

Thêm file `.md` vào `posts/`, đặt tên `YYYY-MM-DD-ten-bai.md` để có ngày. Lệnh deploy tự tạo lại `posts/index.json`; khi xem thử trên máy, chạy `npm run posts`.

### Kiểm thử

```
npm test             # hàm thuần (node:test)
npm run test:rules   # firestore.rules trên emulator, cần npm install và Java 11+
```

## Giấy phép

[MIT](LICENSE)
