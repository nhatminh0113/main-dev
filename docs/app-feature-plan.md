# Plan mở rộng ứng dụng Taskapp (tham khảo Todoist)

> Trạng thái: **đã duyệt 2026-10-16**: phạm vi P0 như mockup, đăng nhập phương án (b) Basic Auth ở Ingress, thêm `react-router` + `@tanstack/react-query`, màu nhấn indigo. Thực hiện dưới tên **Task 3B** trong `MASTER_PLAN.md`, làm trước Task 4.
> Mockup: [`docs/design/mockup-today.svg`](design/mockup-today.svg)

## 1. Bối cảnh

App hiện tại (Task 2–3) chỉ có một danh sách phẳng: thêm, đánh dấu xong, xóa. Đủ để chạy pipeline DevOps nhưng quá sơ sài khi demo. Mục tiêu là nâng app lên mức một trình quản lý công việc cá nhân dùng được hằng ngày, lấy cảm hứng từ Todoist, nhưng:

- Không làm tính năng nhóm/cộng tác, AI, đồng bộ lịch (quá lớn so với một phần phụ).
- Không sao chép thương hiệu Todoist (logo, màu đỏ chủ đạo). App có nhận diện riêng.
- Giữ nguyên kiến trúc đã chốt: React + FastAPI + PostgreSQL, gọi API qua `/api`, không ảnh hưởng tới Task 4–14.

## 2. Phân tích Todoist

Todoist xoay quanh 4 ý tưởng: **ghi nhanh** (gõ ngôn ngữ tự nhiên), **sắp xếp** (dự án, nhãn, mức ưu tiên), **tập trung** (xem Hôm nay / Sắp tới / bộ lọc) và **lên lịch** (ngày hết hạn, lặp lại). Nguồn: [trang chủ Todoist](https://www.todoist.com/), [cách sắp xếp mặc định](https://www.todoist.com/help/todoist/features/default-sorting-order-in-todoist-mqmgerY7), [mức ưu tiên](https://www.todoist.com/help/todoist/features/set-a-priority-in-todoist-Wy82Jp), [sections](https://www.todoist.com/inspiration/todoist-sections).

| Tính năng Todoist | Giá trị với người dùng | Độ khó | Quyết định |
|---|---|---|---|
| Hộp thư đến (Inbox) | Chỗ ghi nhanh khi chưa biết xếp vào đâu | Thấp | **P0** |
| Dự án có màu | Chia việc theo mảng | Thấp | **P0** |
| Mức ưu tiên P1–P4 | Biết việc nào làm trước | Thấp | **P0** |
| Ngày hết hạn, quá hạn | Cốt lõi của lên lịch | Trung bình | **P0** |
| View Hôm nay (gồm quá hạn) | Màn hình dùng nhiều nhất | Trung bình | **P0** |
| View Sắp tới (7 ngày, nhóm theo ngày) | Lên kế hoạch tuần | Trung bình | **P0** |
| Nhãn (labels) | Phân loại chéo dự án | Trung bình | **P0** |
| Thêm nhanh bằng ngôn ngữ tự nhiên | Điểm "ma thuật" của Todoist | Cao | **P0** (tiếng Việt + tiếng Anh) |
| Mô tả, công việc con (subtask) | Chia nhỏ việc lớn | Trung bình | **P0** (1 cấp) |
| Hoàn thành có Hoàn tác | Tránh bấm nhầm | Thấp | **P0** |
| Tìm kiếm | Tìm lại việc cũ | Thấp | **P0** |
| Xem việc đã hoàn thành | Thấy tiến độ | Thấp | **P0** |
| Phím tắt (q, /, ?) | Thao tác nhanh | Thấp | **P0** |
| Smart sort (ngày → ưu tiên → ngày tạo) | Danh sách tự có thứ tự hợp lý | Thấp | **P0** |
| Sections trong dự án | Chia giai đoạn trong dự án | Trung bình | P1 |
| Kéo thả sắp xếp | Sắp thủ công | Cao | P1 |
| Việc lặp lại ("mỗi thứ 2") | Thói quen, việc định kỳ | Cao | P1 |
| Board (Kanban) | Cách nhìn khác | Trung bình | P1 |
| Giờ hết hạn, nhắc nhở, thông báo | Nhắc đúng lúc | Cao, cần worker | Ngoài phạm vi |
| Cộng tác, chia sẻ, bình luận | Làm nhóm | Rất cao | Ngoài phạm vi |
| Đăng nhập, nhiều người dùng | Riêng tư | Cao | Xem mục 9 |
| AI Assist, template, đồng bộ lịch | | Rất cao | Ngoài phạm vi |

P0 = làm trong Task 3B. P1 = làm nếu còn thời gian, sau khi Task 14 xong.

## 3. Trải nghiệm người dùng

### 3.1. Bố cục

- **Sidebar trái (272px)**: logo, nút "Thêm công việc", Tìm kiếm, Hộp thư đến, Hôm nay, Sắp tới, Đã hoàn thành, danh sách Dự án (chấm màu + số việc), danh sách Nhãn. Trên mobile (< 768px) sidebar thành ngăn kéo trượt, có nút mở.
- **Vùng chính (tối đa 800px, căn giữa)**: tiêu đề view, phụ đề (ngày, số việc), danh sách việc nhóm theo phần (Quá hạn / từng ngày / theo dự án).
- **Dòng công việc**: vòng tròn hoàn thành mang màu ưu tiên, tiêu đề, mô tả 1 dòng, hàng meta (ngày hết hạn có màu theo trạng thái, số subtask `1/3`, nhãn, dự án ở bên phải). Hover hiện nút Sửa, Lên lịch, Thêm (⋯).
- **Thêm nhanh**: ô soạn ngay trong danh sách hoặc hộp thoại (phím `q`). Khi gõ, phần nhận diện được (ngày, `p1`, `#dự-án`, `@nhãn`) được tô màu và hiện thành chip, có nút × để bỏ.
- **Chi tiết công việc**: hộp thoại (`<dialog>`) chỉnh tiêu đề, mô tả, ngày, ưu tiên, dự án, nhãn, danh sách subtask.
- **Toast**: "Đã hoàn thành … · Hoàn tác" trong 5 giây.

Xem mockup màn hình Hôm nay: [`docs/design/mockup-today.svg`](design/mockup-today.svg).

### 3.2. Thêm nhanh bằng ngôn ngữ tự nhiên

Bộ phân tích chạy phía client (hàm thuần, test kỹ), không phụ thuộc thư viện:

| Gõ | Hiểu là |
|---|---|
| `hôm nay`, `nay`, `today` | ngày hiện tại |
| `mai`, `ngày mai`, `tomorrow` | +1 ngày |
| `ngày kia`, `mốt` | +2 ngày |
| `thứ 2` … `thứ 7`, `chủ nhật`, `cn`, `mon` … `sun` | ngày gần nhất sắp tới có thứ đó |
| `tuần sau`, `next week` | thứ Hai tuần sau |
| `20/10`, `20/10/2026`, `2026-10-20` | ngày cụ thể (dạng ngày/tháng) |
| `p1` … `p4` | mức ưu tiên |
| `#Tên-dự-án` | dự án (so khớp không phân biệt dấu, hoa thường) |
| `@nhãn` | nhãn, tạo mới nếu chưa có |

Phần còn lại là tiêu đề. Bộ phân tích chỉ khớp nguyên từ (không khớp "mai" trong "maika"). Vẫn có trường hợp nhập nhằng như "Họp với Mai" (Mai là tên người), nên mọi phần được nhận diện đều hiện thành chip có nút × để người dùng bỏ, giống cách Todoist làm.

### 3.3. Phím tắt

| Phím | Hành động |
|---|---|
| `q` | Thêm nhanh |
| `/` | Tìm kiếm |
| `g` rồi `i` / `t` / `u` | Đi tới Hộp thư đến / Hôm nay / Sắp tới |
| `?` | Bảng phím tắt |
| `Esc` | Đóng hộp thoại |

Phím tắt không kích hoạt khi đang gõ trong ô nhập.

## 4. Ngôn ngữ thiết kế

Giữ hướng CSS thuần + design tokens đã chốt ở Task 3, nâng cấp cho giống một sản phẩm thật.

| Token | Giá trị | Ghi chú |
|---|---|---|
| Màu nhấn | Indigo `#5b5bd6` (chữ trên nền nhạt `#4a4ac4`) | Khác màu đỏ của Todoist. Chữ trắng trên nền nhấn: tương phản 5.4:1 |
| P1 / P2 / P3 / P4 | `#d1453b` / `#eb8909` / `#246fe0` / xám | Theo quy ước màu ưu tiên của Todoist |
| Ngày: hôm nay / quá hạn / sắp tới | `#058527` / `#c0392b` / `#692fc2` | Mọi màu chữ đạt ≥ 4.5:1 trên nền trắng |
| Chữ / chữ phụ | `#202020` / `#666666` | Placeholder dùng `#757575` (4.6:1) |
| Nền sidebar / nền chính | `#f8f7f4` / `#ffffff` | Chế độ tối có bộ token riêng |
| Font | System UI stack, 14px nội dung, 24px tiêu đề | Không tải font ngoài |
| Khoảng cách | Thang 4px (4, 8, 12, 16, 24, 32) | |
| Bo góc | 6px (control), 10px (hộp thoại, ô soạn) | |
| Chuyển động | 120–200ms, tắt khi `prefers-reduced-motion` | Hoàn thành có hiệu ứng vòng tròn |

Icon: bộ SVG tự vẽ (~20 icon) dạng component, nét 1.6px, không thêm thư viện icon.

Tổ chức CSS: `tokens.css` (biến toàn cục, sáng/tối) + **CSS Modules** cho từng component (Vite hỗ trợ sẵn), tránh xung đột tên class khi app lớn lên.

## 5. Kiến trúc kỹ thuật

### 5.1. Mô hình dữ liệu (migration `0002`)

```
projects   id, name (1–120), color, is_inbox, position, created_at
labels     id, name (1–60, unique không phân biệt hoa thường), color, created_at
tasks      id, project_id → projects (CASCADE), parent_id → tasks (CASCADE, chỉ 1 cấp),
           title (1–500), description (≤ 5000), priority (1–4, 1 = cao nhất),
           due_date (date, null được), done, completed_at, position,
           created_at, updated_at
task_labels  task_id → tasks, label_id → labels  (khóa chính kép, CASCADE)
```

- Migration tạo sẵn dự án "Hộp thư đến" (`is_inbox = true`, không xóa được) và chuyển các task cũ vào đó. Có `downgrade`.
- Index: `(project_id, done)`, `(due_date) WHERE NOT done`, `(parent_id)`.
- `due_date` là kiểu `date` (không giờ), nên không có lỗi lệch múi giờ giữa server và trình duyệt.

### 5.2. API

| Method | Endpoint | Ghi chú |
|---|---|---|
| GET/POST | `/api/projects` | GET kèm `open_count` để hiện trên sidebar |
| PATCH/DELETE | `/api/projects/{id}` | Xóa Inbox → `409 Conflict` |
| GET/POST | `/api/labels` | GET kèm `open_count` |
| PATCH/DELETE | `/api/labels/{id}` | |
| GET | `/api/tasks` | Lọc: `project_id`, `label_id`, `done`, `due_from`, `due_to`, `no_due`, `q` (tìm kiếm), `parent_id`. Phân trang `limit`/`offset` cho view Đã hoàn thành |
| POST | `/api/tasks` | `{"title"}` vẫn chạy được, mặc định vào Inbox (giữ tương thích smoke test Task 4) |
| GET/PATCH/DELETE | `/api/tasks/{id}` | PATCH nhận `label_ids` để gán nhãn |

- "Hôm nay" = `done=false&due_to=<hôm nay>` (gồm cả quá hạn). "Sắp tới" = `due_from=<mai>&due_to=<+7 ngày>`. Ngày "hôm nay" do **trình duyệt** tính theo múi giờ người dùng rồi gửi lên, server không đoán múi giờ.
- Sắp xếp phía server theo smart sort của Todoist: ngày hết hạn (null xuống cuối) → ưu tiên → vị trí → ngày tạo.
- Đánh dấu task cha hoàn thành thì các subtask cũng hoàn thành. Hoàn tác thì chỉ mở lại task cha.

### 5.3. Frontend

| Hạng mục | Lựa chọn | Lý do |
|---|---|---|
| Định tuyến | `react-router` (thêm mới) | URL riêng cho từng view (`/today`, `/project/3`…), nút Back hoạt động, chia sẻ link được. nginx đã có SPA fallback (Task 4) |
| Dữ liệu từ server | `@tanstack/react-query` (thêm mới) | Cache, tự làm mới, **cập nhật lạc quan** (tick hoàn thành phản hồi ngay, lỗi thì tự quay lại), hoàn tác dễ |
| Ngày tháng | `Intl.DateTimeFormat` + hàm tự viết | Đủ cho định dạng tiếng Việt, không cần date-fns |
| Hộp thoại | `<dialog>` native | Có sẵn focus trap, Esc, accessibility |
| Icon | SVG tự vẽ | Không thêm dependency |

Chỉ thêm 2 thư viện runtime, đều phổ biến và được duy trì tích cực. Phiên bản sẽ pin chính xác và ghi vào mục 8 của MASTER_PLAN.

Cấu trúc thư mục dự kiến:

```
src/
  api/            client.ts, tasks.ts, projects.ts, labels.ts, queries.ts (hooks react-query)
  lib/            dates.ts, quickAddParser.ts, sort.ts, shortcuts.ts
  components/     TaskItem, TaskList, QuickAdd, TaskDialog, Toast, pickers/, icons/
  layout/         AppShell, Sidebar
  views/          InboxView, TodayView, UpcomingView, ProjectView, LabelView, CompletedView, SearchView
  styles/         tokens.css, global.css
```

## 6. Các bước thực hiện

Mỗi bước kết thúc bằng lint + test pass và một commit trên `develop`.

| Bước | Nội dung | Tiêu chí xong |
|---|---|---|
| **B1. Backend** | Migration 0002, model, API projects/labels/tasks mở rộng, lọc, smart sort, subtask | pytest pass, coverage ≥ 80%, `alembic upgrade`/`downgrade` chạy được, `POST /api/tasks {"title"}` vẫn chạy |
| **B2. Nền frontend** | Router, react-query, tokens + CSS Modules, icon, AppShell, Sidebar responsive, chế độ tối | Điều hướng được giữa các view, sidebar có số đếm, mobile mở/đóng được ngăn kéo |
| **B3. Danh sách việc** | TaskItem, các view Inbox/Hôm nay/Sắp tới/Dự án/Nhãn/Đã xong/Tìm kiếm, hoàn thành lạc quan + Hoàn tác | Test component cho từng view, hoàn thành rồi hoàn tác đúng |
| **B4. Thêm nhanh và chi tiết** | Parser ngôn ngữ tự nhiên, QuickAdd có chip, TaskDialog, picker ngày/ưu tiên/dự án/nhãn, subtask | Parser có ≥ 40 test case (tiếng Việt, tiếng Anh, trường hợp biên), thêm và sửa đủ thuộc tính |
| **B5. Hoàn thiện** | Phím tắt, trạng thái trống có minh họa, skeleton khi tải, hiệu ứng, rà soát accessibility và tương phản | `npm run lint`/`test`/`build` pass, dùng được hoàn toàn bằng bàn phím, kiểm tra cả sáng/tối, desktop/mobile |

Ước lượng: B1 và B4 lớn nhất. Tổng cỡ 5 phiên làm việc.

## 7. Kiểm thử

- **Backend**: pytest trên PostgreSQL thật như Task 2. Thêm test cho lọc theo ngày, smart sort, cascade khi xóa dự án, không xóa được Inbox, subtask hoàn thành theo cha, nhãn trùng tên.
- **Frontend**: Vitest + Testing Library. Parser và hàm ngày tháng test dạng bảng (cố định "hôm nay" bằng fake timers). Component test có mock `fetch` như hiện tại.
- **Thủ công**: chạy với backend thật, thử trên Chrome desktop và chế độ mobile của DevTools, bật chế độ tối, chỉ dùng bàn phím.
- Không thêm Playwright ở bước này để CI (Task 5) nhẹ. Có thể bổ sung ở P1.

## 8. Ảnh hưởng tới các task DevOps

- **Task 4–6** không đổi: vẫn 3 thành phần (frontend, backend, postgres). Entrypoint backend vẫn chạy `alembic upgrade head`, nên migration 0002 tự áp dụng khi deploy.
- **Smoke test** vẫn dùng `POST /api/tasks {"title"}` và `GET /api/tasks/{id}`: còn tương thích.
- **Tài nguyên**: không đáng kể. Bundle frontend tăng khoảng 40–60 KB gzip.
- **Demo (Task 14)** có nội dung hấp dẫn hơn: ví dụ deploy tính năng mới lên staging rồi duyệt lên prod.

## 9. Quyết định đã chốt

| Câu hỏi | Quyết định |
|---|---|
| Phạm vi | P0 như mục 2 và mockup. P1 để sau Task 14 |
| Đăng nhập | (b) **Basic Auth ở Ingress** bằng Traefik `Middleware` (`basicAuth`), thông tin đăng nhập nằm trong Secret do pipeline tạo. Thực hiện ở Task 6 (chart) và Task 10/11 (secret). Endpoint `/api/healthz` cho smoke test vẫn cần đi qua auth, nên smoke test sẽ gửi kèm thông tin đăng nhập |
| Thư viện mới | `react-router`, `@tanstack/react-query` |
| Màu nhấn | Indigo `#5b5bd6` như mockup |

## 10. Bổ sung: Lịch tuần dạng thời khóa biểu (đã duyệt phương án A, đã làm)

Mockup: [`docs/design/mockup-week.svg`](design/mockup-week.svg)

**Bố cục:** view mới `/week` ("Lịch tuần" trên sidebar). 7 cột Thứ Hai → Chủ Nhật, hàng "Cả ngày" cho việc chỉ có ngày, bên dưới là các khung giờ (mặc định 07:00–22:00, cuộn được). Cột hôm nay được tô nền, có đường đỏ báo giờ hiện tại. Nút ‹ › để chuyển tuần, "Tuần này" để quay về.

**Khối công việc:** màu nền theo dự án, vòng tròn theo mức ưu tiên, cao theo thời lượng. Bấm vào khối để mở chi tiết, tick ngay trên khối để hoàn thành. Bấm vào ô trống để thêm việc vào đúng ngày giờ đó.

**Thay đổi cần có:**

| Phần | Nội dung |
|---|---|
| Backend | Migration 0004: thêm `due_time` (kiểu `time`, có thể null) và `duration_minutes` (15–720, mặc định 60). Smart sort xếp thêm theo giờ. Thêm giờ thì bắt buộc phải có ngày |
| Thêm nhanh | Nhận diện giờ: `9h`, `9h30`, `14:30`, `lúc 9h`, `9am`, `2pm`. Thời lượng: `trong 2 tiếng`, `trong 90 phút`, `for 2h` |
| Picker ngày | Thêm ô chọn giờ và thời lượng |
| Dòng công việc | Hiện giờ cạnh ngày, ví dụ "Hôm nay 09:00" |
| Mobile | Mặc định hiện 1 ngày, vuốt hoặc bấm ‹ › để đổi ngày. Có nút chuyển sang 3 ngày |
| Accessibility | Mỗi khối là một nút có tên đầy đủ ("Viết Helm chart, Thứ Sáu 09:00 – 11:00, Đồ án DevOps"), dùng Tab để đi qua. Ô giờ trống chỉ là lối tắt cho chuột. Người dùng bàn phím thêm việc qua nút "+" ở đầu mỗi cột ngày, gõ giờ trong thêm nhanh (ví dụ "14h"). Màn Sắp tới vẫn là dạng danh sách thay thế. *(Đã thay cho ý tưởng `role="grid"` với phím mũi tên, vì 168 ô trống không mang lại thêm thông tin cho trình đọc màn hình)* |
| Việc trùng giờ | Xếp so le như Google Calendar: mỗi việc bắt đầu ở cột của nó nhưng rộng hơn phần chia (×1,7), việc sau đè lên trên. Khối hẹp hoặc thấp tự rút gọn nội dung (CSS container queries) |

**Ngoài phạm vi (P1):** kéo thả khối để đổi giờ, kéo cạnh dưới để đổi thời lượng, việc lặp lại hằng tuần.
