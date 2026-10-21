from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator

from app.routers import health, labels, projects, tasks

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

# Prometheus metrics on /metrics (scraped in-cluster, not routed through the Ingress).
# Probe and scrape endpoints are excluded so they do not dominate request-rate graphs.
Instrumentator(
    excluded_handlers=["/metrics", "/api/healthz", "/api/readyz"],
).instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)
