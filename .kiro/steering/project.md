# Quy ước dự án DevOps (k3s + IaC + GitHub Actions)

Kế hoạch đầy đủ: #[[file:docs/MASTER_PLAN.md]]

## Quy trình làm việc
- Đầu mỗi phiên: đọc `docs/MASTER_PLAN.md`, tìm task đầu tiên chưa xong ở mục "Tiến độ" và làm tiếp task đó.
- Làm đúng thứ tự task. Không bỏ qua task trước, không mở rộng phạm vi khi chưa hỏi người dùng.
- Bước có nhãn **[Bạn]**: hướng dẫn người dùng từng bước rồi chờ xác nhận.
- Chỉ đánh dấu `[x]` khi mọi tiêu chí hoàn thành của task đều đạt. Cập nhật cả checklist trong task lẫn mục "Tiến độ".
- Quyết định quan trọng, phiên bản đã pin và mọi sai lệch so với plan đều ghi vào mục "Nhật ký quyết định".
- Kích hoạt skill liên quan trong `.kiro/skills/` theo bảng ở mục 9 của plan. Khi skill mâu thuẫn với plan thì plan thắng.

## Quy ước kỹ thuật
- Pin phiên bản cụ thể cho mọi thứ: image, Helm chart, Terraform provider, k3s, thư viện. Không dùng `latest`.
- Không commit secret, IP thật của VPS, kubeconfig, `.env`, `terraform.tfvars`, file vault chưa mã hóa.
- Repo public: job `runs-on: [self-hosted, vps]` chỉ được chạy khi `push` lên `develop`/`main`, không bao giờ chạy khi có `pull_request` hoặc `pull_request_target`.
- Action bên thứ ba pin theo commit SHA. Mỗi workflow và job đặt `permissions` tối thiểu.
- Ansible phải idempotent (chạy lần 2 cho `changed=0`). Cấu hình sshd phải validate bằng `sshd -t`. Mở port 22 trước khi bật UFW.
- Terraform: chạy `fmt` và `validate` trước khi apply. `plan` sau khi apply phải "No changes".
- Ansible, Terraform, kubectl và helm chạy trong WSL2, không chạy trong PowerShell.
- Không tự chạy script trong `.kiro/skills/*/scripts/` lên VPS.
- Mỗi task phải có test hoặc bước kiểm chứng chạy được trước khi báo hoàn thành.

## Dung lượng ổ đĩa (máy dev)
- Ổ C của người dùng gần đầy. Mọi dữ liệu phát sinh (file tạm, ảnh chụp kiểm tra, cache, image Docker, backup) phải lưu ở ổ D.
- File tạm phía Windows để trong `D:\ĐỒ ÁN II\kiro-tmp\` (ngoài repo) và xóa sau khi dùng. Không dùng `$env:TEMP` (nằm trên ổ C).
- Distro WSL `Ubuntu-24.04` nằm ở `D:\WSL\Ubuntu`, nên `~`, `/tmp`, venv, cache npm/pip trong WSL đã ở ổ D.
- Dữ liệu Docker Desktop (Disk image location) phải ở ổ D. Không cài thêm gì vào ổ C.

## Ngôn ngữ
- Tài liệu (`docs/`, README) và giao tiếp với người dùng: tiếng Việt.
- Code, tên biến, commit message: tiếng Anh.
