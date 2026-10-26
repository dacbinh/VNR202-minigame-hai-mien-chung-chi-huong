# AI Vibecoding Specification --- Trận Chiến Hợp Sức Bắc--Nam

> **Vai trò của AI coding agent:** Hãy đóng vai trò kỹ sư phần mềm
> senior. Làm việc theo từng checkpoint nhỏ, có thể chạy và kiểm thử độc
> lập. Không triển khai toàn bộ dự án trong một lần. Sau mỗi checkpoint,
> chạy các kiểm tra liên quan, báo cáo kết quả và chờ xác nhận trước khi
> chuyển sang checkpoint tiếp theo.

## 1. Mục tiêu dự án

Xây dựng một game quiz multiplayer chạy trên trình duyệt, thời lượng mục
tiêu khoảng **10 phút**, bằng **React + Vite + TypeScript + Supabase**.

Hai đội cùng hướng tới một chiến thắng chung nhưng có vai trò khác nhau:

-   **Miền Nam:** đội trực tiếp chiến đấu. Chỉ đội Miền Nam có thanh
    tiến độ trận chiến. Người chơi dùng điểm chung của đội để mở khóa
    câu hỏi; trả lời đúng giúp tiến độ tăng; trả lời sai bị trừ điểm.
-   **Miền Bắc:** đội hỗ trợ liên tục. Không có thanh tiến độ hoàn thành
    riêng. Người chơi trả lời câu hỏi để kiếm điểm hỗ trợ; điểm thưởng
    được cộng tự động vào quỹ điểm chung của Miền Nam. Miền Bắc tiếp tục
    hỗ trợ cho đến khi trận chiến kết thúc.
-   **Admin:** tạo/quản lý phiên chơi, phân đội hoặc kiểm tra người
    chơi, bắt đầu/kết thúc trận và theo dõi tình trạng hai đội.
-   **Chiến thắng cuối:** hai đội cần đáp ứng điều kiện nhận chìa khóa
    của mình, trao đổi/nộp hai chìa khóa tại mục tiêu cuối để hoàn thành
    trận. Điều kiện nhận chìa khóa phải được cấu hình rõ ràng, không tự
    suy diễn thành thanh tiến độ cho Miền Bắc.

Hỗ trợ hai loại câu hỏi: 1. Trắc nghiệm nhiều lựa chọn. 2. Điền từ/cụm
từ vào chỗ trống.

Yêu cầu tối thiểu: ít nhất **3 người Miền Bắc + 3 người Miền Nam + 1
admin** trong một phiên. Thiết kế phải xử lý các thao tác đồng thời, đặc
biệt khi nhiều người cùng mở khóa hoặc trả lời một câu hỏi, gửi câu trả
lời sai cùng lúc, hoặc gửi lại request.

## 2. Quy tắc bắt buộc cho agent

### 2.1 Làm việc theo checkpoint

-   Đầu tiên kiểm tra repository, `package.json`, cấu trúc thư mục, các
    component/store/type hiện có, cấu hình Supabase và test hiện tại.
-   Không ghi đè hoặc tái tạo dự án nếu dự án đã tồn tại.
-   Giữ lại code đang hoạt động và tái sử dụng khi hợp lý.
-   Trước khi sửa, nêu ngắn gọn file nào sẽ thêm/sửa và vì sao.
-   Chỉ thực hiện **một checkpoint mỗi lần**. Không tự chuyển sang
    checkpoint kế tiếp.
-   Sau mỗi checkpoint: chạy lint/typecheck/test/build phù hợp; báo cáo
    file đã đổi, lệnh đã chạy, kết quả thực tế, vấn đề còn lại.
-   Nếu checkpoint thất bại, sửa lỗi trong checkpoint hiện tại trước khi
    tiếp tục.
-   Không tuyên bố test thành công nếu chưa thực sự chạy test.
-   Không tự thêm thư viện lớn nếu giải pháp hiện có đủ dùng. Kiểm tra
    package hiện có trước khi cài thêm.
-   Ưu tiên code đơn giản, dễ đọc, chia module theo trách nhiệm; tránh
    over-engineering, microservices, Redis hoặc backend server riêng khi
    chưa có nhu cầu.
-   Dùng TypeScript rõ ràng; tránh `any` nếu không thật sự cần.
-   Không nhồi toàn bộ logic vào `App.tsx` hoặc một store duy nhất.
-   Không tạo mock backend giả vờ là Supabase thật. Nếu cần chế độ local
    demo, phải ghi rõ là demo và tách khỏi chế độ multiplayer thật.

### 2.2 Nội dung và hình ảnh --- giới hạn nghiêm ngặt

-   **Không tạo, bịa, viết, sinh tự động hoặc seed bất kỳ câu hỏi thật
    nào.**
-   **Không tạo câu trả lời đúng, đáp án mẫu, giải thích đáp án, dữ liệu
    lịch sử/chính trị hoặc nội dung nhạy cảm.**
-   Không tự điền nội dung câu hỏi vào JSON, SQL seed, fixture, mock, UI
    hoặc tài liệu.
-   Dùng placeholder trung tính như
    `"[Nội dung câu hỏi sẽ được bổ sung sau]"`, `"[Lựa chọn A]"`,
    `"[Đáp án do quản trị viên cung cấp]"` chỉ khi cần minh họa cấu
    trúc. Không trình bày placeholder như câu hỏi thật.
-   Không tạo hoặc tải ảnh minh họa, ảnh nền, bản đồ, cờ, chân dung,
    biểu tượng lịch sử hay bất kỳ asset hình ảnh nào.
-   Nếu thiết kế cần background image, chỉ để chỗ trống và ghi chú rõ
    trong code/UI: `TODO: Người phát triển sẽ tự thêm ảnh nền tại đây.`
    Không dùng ảnh remote hoặc ảnh do AI sinh.
-   Có thể sử dụng icon UI đơn giản từ thư viện icon đã cài, nếu cần;
    không biến icon thành nội dung lịch sử hoặc chính trị.
-   Không tự tạo nội dung nhạy cảm. Chỉ xây dựng cơ chế nhập/quản lý nội
    dung do người dùng cung cấp sau này.

### 2.3 Ngôn ngữ giao diện

-   **Toàn bộ UI hiển thị cho người dùng phải bằng tiếng Việt**, bao gồm
    tiêu đề, nút, trạng thái, thông báo lỗi, loading, empty state, trang
    admin và màn hình kết thúc.
-   Tên biến, tên file, tên hàm và comment kỹ thuật có thể dùng tiếng
    Anh.
-   Không để text mặc định tiếng Anh từ thư viện xuất hiện trực tiếp
    trong UI.
-   Dùng dấu tiếng Việt chính xác, câu ngắn gọn, nhất quán.

## 3. Công nghệ và ranh giới kiến trúc

-   Frontend: React + Vite + TypeScript.
-   Backend/database: Supabase (PostgreSQL, Auth, Realtime, RPC).
-   Routing: dùng thư viện đang có; nếu chưa có, chọn giải pháp tối giản
    phù hợp.
-   Styling: ưu tiên CSS riêng trong file `.css`; **không dùng inline
    CSS hoặc embedded CSS**.
-   State frontend: tái sử dụng state management hiện có nếu phù hợp;
    nếu chưa có, dùng React state/context hoặc Zustand chỉ khi thực sự
    cần.
-   Test: dùng test runner hiện có; nếu chưa có, chọn cấu hình nhẹ tương
    thích với Vite.
-   Supabase browser client chỉ dùng publishable/anon key với RLS đúng
    cách.
-   Tuyệt đối không đặt `service_role` key hoặc secret trong biến
    `VITE_*`, code frontend hay repository.
-   Database là nguồn sự thật duy nhất cho điểm, tiến độ, trạng thái
    trận, lượt trả lời và chìa khóa.
-   Supabase Realtime chỉ dùng để thông báo thay đổi và đồng bộ UI;
    không xem event phía client là nguồn sự thật.
-   Các thao tác ảnh hưởng điểm/trạng thái phải được kiểm tra ở
    PostgreSQL function/RPC và thực hiện nguyên tử khi cần.
-   Không để client tự gửi điểm mới, tiến độ mới, quyền admin hoặc trạng
    thái chiến thắng để database tin tưởng.

## 4. Luật game cần giữ nhất quán

### 4.1 Miền Nam --- đội chính

-   Có một quỹ điểm chung cho cả đội Miền Nam.
-   Chỉ hiển thị **một thanh tiến độ trận chiến của Miền Nam**.
-   Mở khóa câu hỏi phải trừ điểm trong cùng một transaction với việc
    ghi nhận mở khóa.
-   Nếu hai người cùng mở khóa một câu hỏi chỉ được mở một lần, chỉ trừ
    điểm một lần.
-   Trả lời đúng: cập nhật tiến độ theo luật được cấu hình.
-   Trả lời sai: trừ điểm theo luật được cấu hình; một lần gửi không
    được áp dụng phạt nhiều lần.
-   Không cho điểm âm, trừ khi quy tắc sản phẩm được thay đổi rõ ràng.
-   Khi đạt điều kiện hoàn thành, đánh dấu Miền Nam hoàn tất và cấp chìa
    khóa theo điều kiện server-side.

### 4.2 Miền Bắc --- đội hỗ trợ

-   **Không có thanh tiến độ hoàn thành cho Miền Bắc.**
-   Có thể hiển thị tổng điểm hỗ trợ đã kiếm được, nhưng không hiển thị
    nó như phần trăm hoàn thành.
-   Điểm thưởng từ câu trả lời đúng được tính dựa trên thời gian trả lời
    theo công thức cấu hình phía server.
-   Điểm hỗ trợ được cộng tự động vào quỹ điểm chung của Miền Nam, không
    cần nút chuyển điểm thủ công.
-   Chỉ một lần gửi câu trả lời hợp lệ được nhận thưởng; request lặp
    không được cộng điểm lần nữa.
-   Miền Bắc tiếp tục trả lời câu hỏi và hỗ trợ cho đến khi trận chiến
    kết thúc.
-   Xác định điều kiện nhận chìa khóa Miền Bắc một cách rõ ràng, ví dụ
    admin cấu hình ngưỡng hỗ trợ hoặc số câu trả lời hợp lệ tối thiểu.
    Không tự thêm progress bar cho Miền Bắc.
-   Nếu chưa có quy tắc cuối cùng, để điều kiện này thành cấu hình rõ
    ràng hoặc TODO; không âm thầm tự đặt luật trong nhiều nơi của code.

### 4.3 Phiên chơi và chiến thắng

-   Thời lượng mặc định mục tiêu: 10 phút; admin có thể cấu hình nếu
    cần.
-   Các trạng thái phiên chơi nên rõ ràng, ví dụ `LOBBY`, `ACTIVE`,
    `COMPLETED`, `CANCELLED`. Chỉ thêm `PAUSED` nếu pause thực sự được
    triển khai.
-   Thời gian kết thúc và việc hết giờ phải được xác thực phía
    server/database.
-   Chỉ hoàn thành trận khi điều kiện của cả hai chìa khóa và hành động
    trao đổi/nộp chìa khóa hợp lệ đã được thỏa mãn.
-   Chỉ database function được phép đổi trạng thái trận sang
    `COMPLETED`.
-   Quy tắc khi hết giờ mà chưa thắng phải được thể hiện rõ; không tự
    tuyên bố chiến thắng.

### 4.4 Câu hỏi và bảo vệ đáp án

-   Hỗ trợ `multiple_choice` và `fill_blank`.
-   Không gửi trường đáp án đúng cho client khi tải câu hỏi.
-   Lưu đáp án trong vùng dữ liệu chỉ server/database function có quyền
    đọc.
-   Trắc nghiệm cần danh sách lựa chọn nhưng không gửi chỉ số đáp án
    đúng.
-   Điền từ cần quy tắc chuẩn hóa do admin cấu hình (ví dụ trim khoảng
    trắng, xử lý chữ hoa/thường). Không tự dùng fuzzy matching nếu chưa
    được yêu cầu.
-   Không tạo nội dung câu hỏi thật. Dùng cấu trúc rỗng hoặc placeholder
    trung tính cho đến khi chủ dự án cung cấp nội dung.

## 5. Thiết kế dữ liệu dự kiến

Trước khi tạo migration, agent phải đối chiếu với cấu trúc hiện có và đề
xuất schema tối thiểu. Có thể cần các bảng:

-   `profiles`: hồ sơ và vai trò ứng dụng.
-   `game_sessions`: mã phòng, trạng thái, thời điểm bắt đầu/kết thúc,
    cấu hình thời gian.
-   `team_members`: người chơi, phiên chơi, đội.
-   `team_states`: điểm chung Miền Nam, tổng điểm hỗ trợ Miền Bắc nếu
    cần, trạng thái chìa khóa; **không có North progress**.
-   `questions`: metadata câu hỏi, đội sở hữu, loại câu hỏi, chi phí,
    điểm thưởng, trạng thái kích hoạt.
-   Bảng riêng hoặc schema riêng cho đáp án bí mật, không cho client
    đọc.
-   `question_unlocks` hoặc `question_claims`: ghi nhận câu hỏi đã mở
    khóa/được nhận.
-   `question_attempts`: người gửi, câu trả lời, kết quả, thời điểm và
    mã chống xử lý lặp.
-   `game_events` (tùy nhu cầu): lịch sử thao tác quan trọng phục vụ
    admin/debug.

Các ràng buộc nên được cân nhắc: - Một người chỉ tham gia một lần trong
cùng phiên. - Một team state cho mỗi đội trong mỗi phiên. - Unique
constraint cho câu hỏi chỉ được mở khóa một lần nếu luật yêu cầu. -
Idempotency/unique constraint để một attempt không thể phát thưởng hoặc
trừ điểm nhiều lần. - Foreign key, check constraint và index cho truy
vấn phổ biến. - Điểm và tiến độ phải được cập nhật trong transaction
cùng với attempt/unlock tương ứng.

Không cần tạo toàn bộ bảng nếu checkpoint hiện tại chưa cần đến. Mỗi
migration phải nhỏ, có thể review và chạy lại một cách an toàn theo quy
trình migration của Supabase.

## 6. An toàn khi có nhiều người thao tác đồng thời

Không giải quyết concurrency chỉ bằng disable nút ở frontend.

Các RPC quan trọng cần xử lý transaction và kiểm tra: - Người dùng đã
xác thực và là thành viên đúng phiên/đội. - Phiên đang hoạt động, chưa
hết hạn. - Câu hỏi thuộc đội phù hợp và đủ điều kiện. - Câu hỏi đã được
mở khóa/nhận/chấm hay chưa. - Số dư đủ để chi trả. - Request đã xử lý
chưa. - Cập nhật điểm, ghi attempt và ghi unlock phải thành công hoặc
rollback cùng nhau.

Dùng `SELECT ... FOR UPDATE`, unique constraint, hoặc câu lệnh update
nguyên tử tùy thao tác. Xử lý lỗi trùng unique constraint thành kết quả
nghiệp vụ rõ ràng, không làm hỏng phiên.

Các tình huống cần kiểm thử: 1. Hai người Miền Nam mở cùng một câu hỏi
cùng lúc. 2. Hai người Miền Nam gửi đáp án sai gần như đồng thời. 3.
Cùng một request trả lời được gửi lại. 4. Hai người trả lời đúng cùng
lúc. 5. Hai người Miền Bắc gửi đáp án và nhận thưởng cùng lúc. 6. Điểm
vừa đủ để mở khóa nhưng hai request cạnh tranh. 7. Request đến sau thời
điểm hết hạn. 8. Người không thuộc đội cố gửi đáp án hoặc gọi RPC. 9.
Người dùng thường cố truy cập chức năng admin. 10. Hai chìa khóa được
nộp gần như đồng thời.

## 7. UI tối thiểu

Các màn hình nên triển khai từng phần, không cần hiệu ứng phức tạp:

-   **Trang vào phòng:** nhập mã phòng/tên hiển thị hoặc đăng nhập theo
    phương án xác thực đã chọn.
-   **Phòng chờ:** danh sách người chơi, đội, trạng thái sẵn sàng; admin
    có thể bắt đầu.
-   **Màn hình Miền Nam:** điểm chung, thanh tiến độ trận chiến, câu hỏi
    đang mở khóa, lựa chọn/ô điền đáp án, feedback.
-   **Màn hình Miền Bắc:** điểm hỗ trợ đã kiếm, trạng thái hỗ trợ, câu
    hỏi, timer/feedback. Không có progress bar.
-   **Màn hình admin:** trạng thái phiên, danh sách người chơi, cấu hình
    thời gian và điểm, bắt đầu/kết thúc, trạng thái hai đội và chìa
    khóa.
-   **Màn hình kết thúc:** trạng thái thắng/thua/hết giờ và kết quả
    chung.
-   **Trạng thái hệ thống:** loading, mất kết nối, gửi câu trả lời, câu
    hỏi đã được người khác xử lý, không đủ điểm, phiên đã kết thúc.

Nếu cần background, để một vùng trống có class CSS và comment TODO để
chủ dự án tự chèn ảnh sau. Không sinh asset hoặc tải ảnh.

## 8. Quy trình thực hiện --- checkpoint bắt buộc

### Checkpoint 0 --- Khảo sát repository

**Công việc** - Đọc `package.json`, cấu trúc `src`, các type, store,
router, CSS và test hiện có. - Kiểm tra cấu hình Supabase đã có hay
chưa; không in secrets ra log. - Chạy các lệnh kiểm tra hiện có để ghi
nhận baseline. - Đưa ra kế hoạch ngắn gọn dựa trên code thật, không dựa
vào giả định.

**Kiểm thử/tiêu chí đạt** - App hiện tại build được hoặc ghi rõ lỗi
baseline. - Có báo cáo cấu trúc hiện tại và kế hoạch thay đổi. - Không
sửa code nghiệp vụ ở checkpoint này.

**Dừng và chờ xác nhận.**

### Checkpoint 1 --- Khung ứng dụng và điều hướng

**Công việc** - Thiết lập hoặc chỉnh cấu trúc trang tối thiểu. - Tạo các
route/page cần thiết bằng nội dung placeholder tiếng Việt. - Thêm layout
dùng CSS riêng, responsive cơ bản. - Để placeholder cho background,
không tạo ảnh.

**Kiểm thử/tiêu chí đạt** - `npm run build` thành công. - Các route
chính mở được. - Không có câu hỏi hoặc đáp án thật. - Giao diện không có
text tiếng Anh hiển thị cho người dùng.

**Dừng và chờ xác nhận.**

### Checkpoint 2 --- TypeScript domain model và luật game thuần

**Công việc** - Định nghĩa type cho session, team, question type, answer
attempt, team state, key state và kết quả action. - Tạo các hàm thuần
cho tính điểm, chuẩn hóa câu trả lời, tính tiến độ Miền Nam và kiểm tra
điều kiện giao diện. - Không gọi Supabase trong hàm thuần. - Không thêm
North completion progress. - Chọn công thức thưởng theo thời gian có thể
cấu hình; không rải magic number trong component.

**Kiểm thử/tiêu chí đạt** - Unit test cho điểm thưởng ở đầu/cuối thời
gian, đáp án đúng/sai, chuẩn hóa đáp án và giới hạn điểm. - Test đảm bảo
tiến độ chỉ dành cho Miền Nam. - Test đảm bảo request lặp không được mô
hình hóa như phần thưởng mới. - Typecheck/test thành công.

**Dừng và chờ xác nhận.**

### Checkpoint 3 --- Supabase client và cấu hình môi trường

**Công việc** - Tạo client dùng biến môi trường theo quy ước Vite. -
Thêm `.env.example` chỉ chứa placeholder. - Kiểm tra cấu hình thiếu và
hiển thị thông báo tiếng Việt phù hợp. - Không ghi key bí mật vào
frontend hoặc commit.

**Kiểm thử/tiêu chí đạt** - App xử lý rõ ràng khi chưa cấu hình
Supabase. - Không có `service_role` key trong mã frontend. -
Typecheck/build thành công.

**Dừng và chờ xác nhận.**

### Checkpoint 4 --- Migration schema và RLS

**Công việc** - Tạo migration cho các bảng cần thiết ở phiên bản đầu. -
Thêm foreign key, unique constraint, check constraint và index cần
thiết. - Thiết lập RLS cho từng bảng exposed. - Phân biệt dữ liệu câu
hỏi công khai và đáp án bí mật. - Định nghĩa cách xác minh admin bằng cơ
chế đáng tin cậy; người dùng không được tự nâng quyền. - Không thêm seed
câu hỏi thật hoặc seed đáp án.

**Kiểm thử/tiêu chí đạt** - Migration chạy được theo workflow của
Supabase. - Kiểm tra quyền đọc/ghi của player, admin và người chưa xác
thực. - Client không đọc được đáp án bí mật. - Player không thể tự cập
nhật điểm, tiến độ, chìa khóa hoặc trạng thái trận. - Không đưa secret
vào migration hoặc log.

**Dừng và chờ xác nhận.**

### Checkpoint 5 --- Phòng chờ và thành viên đội

**Công việc** - Xây dựng tạo/tham gia phiên, hiển thị mã phòng và danh
sách thành viên. - Giới hạn vai trò và số lượng theo cấu hình cần thiết;
đảm bảo tối thiểu 3 người mỗi đội có thể tham gia cùng một admin. - Chỉ
admin được bắt đầu hoặc kết thúc phiên. - Xác định cách xử lý người
refresh/reconnect mà không tạo thành viên trùng.

**Kiểm thử/tiêu chí đạt** - Có thể tham gia bằng nhiều browser
session. - Người ngoài phiên không đọc được dữ liệu riêng. - Không tạo
thành viên trùng khi refresh hoặc retry. - Các trạng thái lobby hiển thị
bằng tiếng Việt.

**Dừng và chờ xác nhận.**

### Checkpoint 6 --- RPC mở khóa câu hỏi Miền Nam

**Công việc** - Triển khai RPC kiểm tra thành viên, trạng thái phiên,
quyền truy cập câu hỏi và số dư. - Trừ điểm và ghi nhận unlock trong
cùng transaction. - Xử lý hai người mở cùng câu hỏi và số dư không đủ. -
UI chỉ gọi RPC; không tự trừ điểm ở client.

**Kiểm thử/tiêu chí đạt** - Hai request đồng thời chỉ tạo một unlock và
một lần trừ điểm. - Không thể chi vượt số dư. - Retry không trừ thêm
điểm. - Có unit/integration test cho các trường hợp cạnh tranh.

**Dừng và chờ xác nhận.**

### Checkpoint 7 --- RPC trả lời và chấm điểm

**Công việc** - Hỗ trợ cả trắc nghiệm và điền từ. - Chấm đáp án phía
server/database. - Ghi attempt, tính điểm/phạt và cập nhật tiến độ trong
cùng transaction. - Dùng idempotency/unique constraint để chống
replay. - Chỉ trả kết quả cần thiết cho client; không trả đáp án đúng
hoặc dữ liệu bí mật.

**Kiểm thử/tiêu chí đạt** - Câu trả lời đúng/sai cho ra kết quả và điểm
đúng quy tắc. - Request lặp không cộng/trừ điểm lần nữa. - Hai người trả
lời cùng câu hỏi tuân theo luật claim đã chọn. - Test chuẩn hóa điền
từ. - Không có câu hỏi/đáp án thật trong fixture.

**Dừng và chờ xác nhận.**

### Checkpoint 8 --- Điểm hỗ trợ Miền Bắc

**Công việc** - Tạo luồng câu hỏi hỗ trợ cho Miền Bắc. - Tính thưởng
theo thời gian ở phía server/database. - Cộng thưởng vào quỹ điểm chung
Miền Nam tự động và nguyên tử. - Hiển thị điểm hỗ trợ và feedback; tuyệt
đối không thêm thanh tiến độ Miền Bắc. - Chống nhận thưởng hai lần khi
retry hoặc submit đồng thời.

**Kiểm thử/tiêu chí đạt** - Trả lời đúng tạo đúng số điểm hỗ trợ và tăng
quỹ điểm Miền Nam đúng một lần. - Trả lời sai không tạo thưởng đúng. -
Submit trùng không tạo thưởng trùng. - North UI không hiển thị
completion percentage/progress bar.

**Dừng và chờ xác nhận.**

### Checkpoint 9 --- Supabase Realtime và reconnect

**Công việc** - Subscribe các thay đổi cần thiết: điểm Miền Nam, tiến độ
Miền Nam, lượt mở khóa, trạng thái phiên và trạng thái chìa khóa. - Khi
nhận event, cập nhật UI hoặc refetch trạng thái có thẩm quyền. - Xử lý
unsubscribe khi component unmount và reconnect/refetch khi mất kết nối.

**Kiểm thử/tiêu chí đạt** - Thay đổi từ browser này xuất hiện ở browser
khác. - UI không cộng điểm hai lần chỉ vì nhận event trùng. - Khi
reconnect, UI khớp với database. - Hiển thị trạng thái mất kết nối bằng
tiếng Việt.

**Dừng và chờ xác nhận.**

### Checkpoint 10 --- Admin và điều kiện chiến thắng

**Công việc** - Xây dựng giao diện admin để bắt đầu/kết thúc phiên, xem
người chơi và theo dõi điểm/tiến độ. - Cho phép cấu hình thời lượng và
các tham số điểm cần thiết. - Xây dựng điều kiện nhận chìa khóa của từng
đội theo luật đã thống nhất. - Triển khai RPC nộp/trao đổi chìa khóa và
kết thúc trận theo transaction. - Không cho client tự set `COMPLETED`.

**Kiểm thử/tiêu chí đạt** - Player không gọi được admin action. - Không
thể nhận chìa khóa khi chưa đủ điều kiện. - Không thể kết thúc trận nếu
thiếu chìa khóa hợp lệ. - Hai request nộp chìa khóa đồng thời không tạo
trạng thái không nhất quán. - Hết giờ được xử lý theo luật đã xác định.

**Dừng và chờ xác nhận.**

### Checkpoint 11 --- Kiểm thử tích hợp và hoàn thiện

**Công việc** - Kiểm thử một phiên hoàn chỉnh từ lobby đến kết thúc. -
Chạy các test cạnh tranh được liệt kê trong phần 6. - Kiểm tra
responsive, loading, empty/error states, mất kết nối và refresh. - Kiểm
tra toàn bộ UI hiển thị tiếng Việt. - Kiểm tra lại repository để chắc
chắn không có câu hỏi/đáp án thật, ảnh được tự sinh hoặc secrets bị
commit. - Viết hướng dẫn chạy local và cấu hình Supabase.

**Kiểm thử/tiêu chí đạt** - Build, typecheck, lint và test hiện có đều
pass; ghi rõ lệnh nào không tồn tại thay vì giả vờ đã chạy. - Không còn
lỗi nghiêm trọng trong luồng game chính. - Có hướng dẫn setup rõ ràng và
danh sách cấu hình còn thiếu. - Tóm tắt những gì hoàn thành, những gì
chưa làm và các quyết định cần chủ dự án xác nhận.

**Dừng và chờ xác nhận.**

## 9. Quy ước code

-   Tách domain logic, Supabase access, UI component và page.
-   Đặt tên có ý nghĩa; component tập trung vào hiển thị và tương tác.
-   Không duplicate scoring logic ở frontend và database.
    Database/server là nơi quyết định kết quả thật; frontend chỉ có thể
    hiển thị preview.
-   Dùng enum/string union cho trạng thái và loại câu hỏi.
-   Chuẩn hóa và kiểm tra dữ liệu đầu vào.
-   Dùng CSS riêng, tránh inline style.
-   Không thêm animation phức tạp trước khi gameplay hoạt động.
-   Không làm tính năng ngoài phạm vi chỉ vì thấy tiện.
-   Không thay đổi dependency hoặc cấu trúc lớn mà không giải thích lý
    do.

## 10. Cách agent phải phản hồi sau mỗi checkpoint

Dùng định dạng ngắn gọn:

1.  **Checkpoint:** tên và mục tiêu.
2.  **Đã thực hiện:** danh sách file thêm/sửa.
3.  **Kiểm thử:** lệnh thực sự đã chạy và kết quả.
4.  **Còn thiếu/rủi ro:** vấn đề chưa giải quyết.
5.  **Tiếp theo:** checkpoint kế tiếp sẽ làm gì, nhưng chưa thực hiện.

Kết thúc phản hồi bằng câu hỏi xác nhận có tiếp tục checkpoint kế tiếp
hay không.

------------------------------------------------------------------------

## Lệnh khởi động cho AI coding agent

Bắt đầu với **Checkpoint 0 בלבד**: khảo sát repository hiện tại, đọc các
file cấu hình và code liên quan, chạy kiểm tra baseline nếu có, rồi báo
cáo kế hoạch. Không chỉnh sửa code cho đến khi hoàn tất báo cáo
Checkpoint 0. Không tạo câu hỏi, đáp án, hình ảnh hoặc nội dung nhạy
cảm.
