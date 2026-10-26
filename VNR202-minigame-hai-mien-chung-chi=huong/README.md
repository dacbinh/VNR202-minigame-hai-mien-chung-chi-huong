# Hợp sức Bắc - Nam

Ứng dụng demo frontend cho game quiz multiplayer theo checkpoint đã định nghĩa trong `ai_vibecode_game_spec.md`.

## Mục tiêu

- Miền Nam có tiến độ trận, điểm chung và mở khóa câu hỏi.
- Miền Bắc có điểm hỗ trợ và cộng thưởng vào quỹ của Miền Nam.
- Admin có quyền quản lý phiên và điều kiện chiến thắng.
- Supabase dùng cho dữ liệu thật, Realtime và RPC; frontend chỉ hiển thị trạng thái và không tự gán điểm.

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
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

> Không được commit `service_role` key, secret hay bất kỳ mã bí mật nào vào repository.

## Chạy local

```bash
npm run dev
```

## Kiểm tra

```bash
npm test
npm run lint
npm run build
```

## Cấu trúc chính

- `src/domain`: logic game thuần, không phụ thuộc UI.
- `src/lib/supabase.ts`: cấu hình client Supabase an toàn.
- `src/App.tsx`: shell giao diện và màn hình mock/demo.
- `supabase/migrations`: schema và quy tắc database.

## Ghi chú

- Các màn hình hiện tại đang là demo local và chỉ dùng placeholder khi chưa có dữ liệu thật.
- Dữ liệu câu hỏi, đáp án và hành vi multiplayer thực thi được ưu tiên qua Supabase/PostgreSQL function thay vì client-side fake logic.
- Các trạng thái UI được giữ bằng tiếng Việt để phù hợp với yêu cầu giao diện người dùng.
