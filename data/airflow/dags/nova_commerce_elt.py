"""
PULSE demo — NOVA COMMERCE ELT DAG.

Orchestrates the pipeline that the PULSE topology models: extract each source,
land it raw, run dbt staging + marts, then run data-quality checks and publish
asset health back to the PULSE API.

The DAG structure intentionally mirrors `backend/app/engine/topology.py` — the
digital twin and the real orchestration describe the same system.

NOTE: this is a demo DAG over synthetic data. It is included to show the
orchestration shape; it does not connect to real external systems.
"""
from __future__ import annotations

from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.empty import EmptyOperator
from airflow.operators.python import PythonOperator

DEFAULT_ARGS = {
    "owner": "data-eng",
    "retries": 2,
    "retry_delay": timedelta(minutes=5),
    "depends_on_past": False,
}

SOURCES = ["payments", "orders", "customers", "inventory", "marketing"]

# Which staging models each source feeds (mirrors the PULSE dependency graph).
STAGING = {
    "payments": "stg_payments",
    "orders": "stg_orders",
    "customers": "stg_customers",
    "inventory": "stg_inventory",
    "marketing": "stg_marketing",
}

FACTS = {
    "payments": "fact_payments",
    "orders": "fact_orders",
    "customers": "dim_customers",
    "inventory": "fact_inventory",
    "marketing": "fact_marketing_spend",
}


def _extract(source: str, **_) -> None:
    """Pull a source into the raw layer. (Demo: synthetic generator.)"""
    print(f"[extract] {source} -> raw_{source}")


def _run_dbt(select: str, **_) -> None:
    """Run a dbt selector. In a real deployment: `dbt run --select <select>`."""
    print(f"[dbt run] --select {select}")


def _test_dbt(select: str, **_) -> None:
    """Run dbt tests — these encode the same contracts PULSE simulates."""
    print(f"[dbt test] --select {select}")


def _publish_health(**_) -> None:
    """Publish run outcomes to the PULSE API as asset health telemetry."""
    print("[pulse] publishing pipeline run health -> /api/health")


with DAG(
    dag_id="nova_commerce_elt",
    description="NOVA COMMERCE ELT — the pipeline PULSE models as a digital twin",
    default_args=DEFAULT_ARGS,
    start_date=datetime(2026, 1, 1),
    schedule="0 * * * *",  # hourly
    catchup=False,
    max_active_runs=1,
    tags=["pulse", "demo", "elt"],
) as dag:

    start = EmptyOperator(task_id="start")
    raw_ready = EmptyOperator(task_id="raw_layer_ready")
    staging_ready = EmptyOperator(task_id="staging_ready")
    marts_ready = EmptyOperator(task_id="marts_ready")

    publish = PythonOperator(
        task_id="publish_asset_health",
        python_callable=_publish_health,
    )

    end = EmptyOperator(task_id="end")

    for source in SOURCES:
        extract = PythonOperator(
            task_id=f"extract_{source}",
            python_callable=_extract,
            op_kwargs={"source": source},
        )
        stage = PythonOperator(
            task_id=f"dbt_run_{STAGING[source]}",
            python_callable=_run_dbt,
            op_kwargs={"select": STAGING[source]},
        )
        stage_test = PythonOperator(
            task_id=f"dbt_test_{STAGING[source]}",
            python_callable=_test_dbt,
            op_kwargs={"select": STAGING[source]},
        )
        fact = PythonOperator(
            task_id=f"dbt_run_{FACTS[source]}",
            python_callable=_run_dbt,
            op_kwargs={"select": FACTS[source]},
        )

        start >> extract >> raw_ready >> stage >> stage_test >> fact >> staging_ready

    # Business models depend on the conformed facts above.
    for model in ["daily_revenue", "customer_metrics",
                  "marketing_attribution", "inventory_health"]:
        build = PythonOperator(
            task_id=f"dbt_run_{model}",
            python_callable=_run_dbt,
            op_kwargs={"select": model},
        )
        test = PythonOperator(
            task_id=f"dbt_test_{model}",
            python_callable=_test_dbt,
            op_kwargs={"select": model},
        )
        staging_ready >> build >> test >> marts_ready

    marts_ready >> publish >> end
