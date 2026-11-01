"""Prometheus metrics of the worker (default registry, served on :9000/metrics)."""

from prometheus_client import Counter, Gauge, Histogram

# Exposed as taskapp_worker_jobs_total; status is done | failed | retry | lost.
JOBS = Counter("taskapp_worker_jobs", "Jobs processed by outcome", ["type", "status"])
JOB_DURATION = Histogram(
    "taskapp_worker_job_duration_seconds", "Handler run time of successful jobs", ["type"]
)
# Refreshed at scrape time (health_server), so it is current even while the worker is busy.
QUEUE_DEPTH = Gauge("taskapp_worker_queue_depth", "Jobs waiting in the queue")
