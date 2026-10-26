# Hợp sức Bắc - Nam

Ứng dụng React/Vite cho game quiz Bắc - Nam. Supabase lưu ngân hàng câu hỏi; Supabase Realtime Broadcast chuyển trạng thái phòng giữa chủ phòng và người chơi.

## Mục tiêu

- Miền Nam có tiến độ trận, điểm chung và mở khóa câu hỏi.
- Miền Bắc có điểm hỗ trợ và cộng thưởng vào quỹ của Miền Nam.
- Chủ phòng tạo mã phòng và giữ trạng thái trận trong trình duyệt của mình.
- Người chơi xác thực mã bằng cách kết nối tới kênh Realtime đang mở, sau đó chọn đội.
- Câu hỏi và đáp án được tải từ `question_bank` và `question_bank_answers` vào trình duyệt chủ phòng. Chủ phòng kiểm tra đáp án ngay khi nhận bài; FSM cộng điểm tự động và chỉ gửi kết quả/điểm qua Realtime.

## Cài đặt nhanh

1. Cài đặt dependency:

```bash
npm install
```

2. Tạo file `.env.local` dựa trên `.env.example`:

```bash
cp .env.example .env.local
```

3. Điền giá trị Supabase thực tế:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-publishable-or-anon-key
```

> Vite chỉ nhúng chính xác `SUPABASE_URL` và `SUPABASE_ANON_KEY`; không dùng hoặc đưa `service_role` key vào cấu hình frontend.

## Chạy local

```bash
npm run dev
```

## Cấu hình dữ liệu

1. Liên kết Supabase project, sau đó áp dụng migrations:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

2. Bật Realtime trong Supabase. Không cần bật đăng nhập ẩn danh cho luồng phòng hiện tại.
3. Thêm câu hỏi vào `question_bank` và đặt `is_active` thành `true`; thêm đáp án khớp chính xác với nội dung một lựa chọn vào `question_bank_answers`. Cấu hình `duration_seconds` và `points` cho câu hỏi.

**Chế độ demo không an toàn cho phát hành công khai:** migration `20261026_0006_demo_answer_key_access.sql` cho phép browser client đọc đáp án để hỗ trợ host không đăng nhập. Không broadcast answer key, nhưng người chơi có thể tự đọc bảng đáp án bằng publishable key. Trước khi dùng cạnh tranh/thật, thay bước chấm đáp án này bằng Edge Function/RPC được bảo vệ bằng xác thực admin.

Phòng và roster chỉ tồn tại khi trang chủ phòng còn kết nối. Nếu chủ phòng tải lại trang hoặc đóng trình duyệt, phiên đang chạy kết thúc; database không lưu mã phòng, người chơi, điểm hoặc trạng thái trận. Kênh dùng mã phòng làm tên, nên mã không phải cơ chế xác thực cho dữ liệu nhạy cảm.

## Kiểm tra

```bash
npm test
npm run lint
npm run build
```

## Cấu trúc chính

- `src/domain`: logic game thuần, không phụ thuộc UI.
- `src/lib/supabase.ts`: cấu hình client Supabase.
- `src/lib/roomService.ts`: tải câu hỏi và gửi thông điệp phòng qua Realtime Broadcast.
- `src/App.tsx`: giao diện; chủ phòng là nguồn trạng thái tạm thời cho roster và điều khiển trận.
- `supabase/migrations`: schema câu hỏi và quyền truy cập.

## Ghi chú

- Chưa có câu hỏi mẫu hoặc nội dung được seed; ngân hàng rỗng sẽ khóa nút bắt đầu.
- Điểm và trạng thái chỉ tồn tại trong trình duyệt chủ phòng; không lưu qua lần tải lại.
- Các trạng thái UI được giữ bằng tiếng Việt.
