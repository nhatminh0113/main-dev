from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator

from app.logging_setup import configure_logging
from app.middleware import RequestContextMiddleware
from app.routers import exports, features, health, labels, projects, tasks

# JSON logs on stdout for the app and uvicorn (uvicorn's dictConfig runs before this import).
configure_logging()

app = FastAPI(
    title="Task Manager API",
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
)

app.include_router(health.router)
app.include_router(projects.router)
app.include_router(labels.router)
app.include_router(tasks.router)
app.include_router(features.router)
app.include_router(exports.router)

# Prometheus metrics on /metrics (scraped in-cluster, not routed through the Ingress).
# Probe and scrape endpoints are excluded so they do not dominate request-rate graphs.
Instrumentator(
    excluded_handlers=["/metrics", "/api/healthz", "/api/readyz"],
).instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)

# Added last, so it is the outermost user middleware: X-Request-ID and the access log line.
app.add_middleware(RequestContextMiddleware)
