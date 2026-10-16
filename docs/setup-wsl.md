# Cài đặt môi trường dev trên Windows + WSL2

Ansible chỉ chạy trên Linux, nên mọi lệnh Ansible, Terraform, kubectl và helm đều chạy trong WSL2 (Ubuntu 24.04). Windows chỉ dùng cho editor (Kiro) và Docker Desktop.

## 1. Cài WSL2 + Ubuntu 24.04

Mở PowerShell bằng quyền Administrator:

```powershell
wsl --install -d Ubuntu-24.04
wsl --set-default Ubuntu-24.04
wsl --list --verbose     # cột VERSION phải là 2
```

Khởi động lại máy nếu được yêu cầu, sau đó mở "Ubuntu 24.04" từ Start menu để tạo user Linux.

Trong Ubuntu, cập nhật hệ thống:

```bash
sudo apt-get update && sudo apt-get upgrade -y
```

## 2. Docker Desktop và tích hợp WSL

1. Cài [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/), chọn backend WSL 2.
2. Mở Docker Desktop → Settings → Resources → WSL integration.
3. Bật "Enable integration with my default WSL distro" và bật công tắc cho `Ubuntu-24.04`.
4. Bấm "Apply & restart".

Kiểm tra trong Ubuntu:

```bash
which docker        # phải là /usr/bin/docker, KHÔNG phải /mnt/c/...
docker version      # có cả phần Client và Server
```

Nếu `which docker` trả về đường dẫn `/mnt/c/...` nghĩa là tích hợp WSL chưa bật.

**Nếu ổ C ít dung lượng**, chuyển dữ liệu Docker (image, volume) sang ổ khác: Docker Desktop → Settings → Resources → Advanced → **Disk image location** → chọn ví dụ `D:\Docker` → Apply & restart. Distro WSL cũng có thể chuyển bằng `wsl --manage Ubuntu-24.04 --move D:\WSL\Ubuntu` (chạy `wsl --shutdown` trước).

## 3. Cấu hình Git

```bash
git config --global user.name "Tên của bạn"
git config --global user.email "email-dang-ky-github@example.com"
git config --global init.defaultBranch main
```

## 4. Tạo SSH key

Key này dùng để đăng nhập VPS (Task 7) và có thể dùng cho GitHub.

```bash
ssh-keygen -t ed25519 -C "email-dang-ky-github@example.com"
# Nhấn Enter để lưu ở ~/.ssh/id_ed25519, nên đặt passphrase
cat ~/.ssh/id_ed25519.pub
```

Nếu muốn push bằng SSH: GitHub → Settings → SSH and GPG keys → New SSH key, dán nội dung file `.pub`. Kiểm tra bằng `ssh -T git@github.com`.

## 5. Clone repo vào filesystem của WSL

Clone vào thư mục trong home của Linux, ví dụ `~/projects`:

```bash
mkdir -p ~/projects && cd ~/projects
git clone git@github.com:<github-user>/<repo>.git taskapp
cd taskapp
```

Không clone vào `/mnt/c/...` hay `/mnt/d/...`:

- Truy cập ổ Windows từ WSL chậm hơn nhiều (npm install, pytest, docker build).
- Ổ Windows mount với quyền `777`. Ansible bỏ qua `ansible.cfg` nằm trong thư mục world-writable, và SSH từ chối private key có quyền quá rộng.

Để mở repo bằng Kiro: dùng đường dẫn `\\wsl.localhost\Ubuntu-24.04\home\<user>\projects\taskapp`.

## 6. Cài các công cụ CLI

Repo có sẵn script cài đặt. Phiên bản được pin ở đầu script và ghi lại trong `docs/MASTER_PLAN.md` mục 8.

```bash
bash scripts/setup-wsl-tools.sh
source ~/.bashrc
```

Script sẽ:

| Công cụ | Cách cài |
|---|---|
| pipx, unzip, python3-venv | `apt` (sẽ hỏi mật khẩu sudo) |
| Python 3.12 | có sẵn trong Ubuntu 24.04 |
| Ansible, ansible-lint | `pipx` (mỗi tool một virtualenv riêng) |
| Terraform, kubectl, Helm, tflint, kubeconform | tải binary chính thức vào `~/.local/bin`, kiểm tra SHA-256 |
| Node.js LTS | tải bản chính thức vào `~/.local/opt`, symlink vào `~/.local/bin` |

Script chạy lại nhiều lần được. Công cụ nào đã đúng phiên bản thì bỏ qua.

Lưu ý: WSL mặc định thêm `PATH` của Windows vào Linux, nên `npm` hoặc `docker` có thể trỏ nhầm sang bản Windows (`/mnt/c/...`). Script thêm `~/.local/bin` lên đầu `PATH` trong `~/.bashrc` để bản Linux luôn được ưu tiên.

## 7. Kiểm tra

Mở terminal Ubuntu mới và chạy:

```bash
ansible --version
terraform version
kubectl version --client
helm version
tflint --version
kubeconform -v
docker version
node --version
```

Tất cả các lệnh đều phải chạy được. Kiểm tra thêm để chắc chắn đang dùng bản Linux:

```bash
which node npm docker kubectl    # không có dòng nào bắt đầu bằng /mnt/
```

## Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| `The command 'docker' could not be found in this WSL 2 distro` | Bật WSL integration cho Ubuntu-24.04 trong Docker Desktop (mục 2). |
| `docker: Cannot connect to the Docker daemon` | Mở Docker Desktop và chờ trạng thái "Engine running". |
| `ansible: command not found` sau khi cài | Chạy `pipx ensurepath` rồi mở terminal mới. |
| `node` trả về phiên bản Windows | Chạy `source ~/.bashrc`, kiểm tra `echo $PATH` có `~/.local/bin` đứng đầu. |
| Ansible báo `Ansible is being run in a world writable directory` | Repo đang nằm trong `/mnt/...`. Clone lại vào `~/projects` (mục 5). |
