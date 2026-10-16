# Task Manager – DevOps trên VPS (k3s + IaC + GitHub Actions)

Đồ án xây dựng quy trình DevOps hoàn chỉnh cho một ứng dụng full-stack đơn giản:

- Ứng dụng: React (Vite + TypeScript) + FastAPI (Python 3.12) + PostgreSQL.
- Hạ tầng dạng code: Ansible (cấu hình VPS, cài k3s, runner) và Terraform (tài nguyên trong cluster).
- CI/CD: GitHub Actions, image trên GHCR, deploy bằng Helm lên k3s.
- Hai môi trường: `staging` (nhánh `develop`) và `prod` (nhánh `main`, có duyệt thủ công).
- HTTPS bằng cert-manager + Let's Encrypt, monitoring bằng Prometheus + Grafana.

## Tài liệu

- [Kế hoạch tổng thể (MASTER_PLAN)](docs/MASTER_PLAN.md)
- [Cài đặt môi trường dev trên WSL2](docs/setup-wsl.md)

## Cấu trúc thư mục

| Thư mục | Nội dung |
|---|---|
| `app/backend` | API FastAPI |
| `app/frontend` | Giao diện React |
| `helm/taskapp` | Helm chart của ứng dụng |
| `infra/ansible` | Playbook và role cấu hình VPS |
| `infra/terraform` | Tài nguyên nền tảng trên cluster |
| `scripts` | Script tiện ích (cài tool, smoke test, tunnel, load test) |
| `.github/workflows` | Pipeline CI/CD |
| `docs` | Tài liệu dự án |

## Chạy cả stack bằng Docker Compose

```bash
cp .env.example .env
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 16)/" .env
docker compose up -d --build
docker compose ps                         # 3 service đều "healthy"
scripts/smoke-test.sh http://localhost:8080
```

Mở http://localhost:8080 (API docs: http://localhost:8080/api/docs). Dừng: `docker compose down` (thêm `-v` để xóa cả dữ liệu).

## Chạy backend local (trong WSL)

```bash
# PostgreSQL cho test (cổng 5433)
docker run -d --name taskapp-test-db -p 5433:5432 \
  -e POSTGRES_USER=taskapp -e POSTGRES_PASSWORD=taskapp -e POSTGRES_DB=taskapp_test \
  postgres:18.6-alpine

cd app/backend
python3 -m venv ~/.venvs/taskapp-backend
~/.venvs/taskapp-backend/bin/pip install -r requirements-dev.txt
source ~/.venvs/taskapp-backend/bin/activate

ruff check . && ruff format --check .
pytest                     # yêu cầu coverage >= 80%

# Chạy API: http://localhost:8000/api/docs
export DATABASE_URL=postgresql+psycopg://taskapp:taskapp@localhost:5433/taskapp_test
alembic upgrade head
uvicorn app.main:app --reload
```

## Chạy frontend local (trong WSL)

```bash
cd app/frontend
npm ci
npm run lint
npm test -- --run
npm run build
npm run dev        # http://localhost:5173, /api được proxy tới http://localhost:8000
```

## Nhánh

- `develop`: tích hợp, tự động deploy lên staging.
- `main`: phát hành, deploy lên prod sau khi được duyệt.
