"""
PULSE — NOVA COMMERCE demo topology.

A synthetic e-commerce data platform used for the demo. All telemetry derived
from this topology is SIMULATION / DEMO data — there is no real external system.

The lineage is deliberately cross-wired so that a handful of nodes are genuine
single points of failure:

  * fact_orders feeds daily_revenue, customer_metrics, marketing_attribution
    and the demand-forecast ML model — so an Orders outage has a much larger
    blast radius than a Payments outage.
  * daily_revenue needs BOTH payments and orders, so either can make the
    Executive Revenue Dashboard untrustworthy.

Node id conventions:  src_ ing_ raw_ stg_ fact_ dim_ … dash_ ml_ bp_ team_
"""
from __future__ import annotations

from .graph import Asset, Dependency, DependencyGraph
from .states import Criticality as C
from .states import NodeType as T

# --------------------------------------------------------------------------- #
#  ASSETS
# --------------------------------------------------------------------------- #
_A = [
    # ---- Payments lineage -------------------------------------------------
    Asset("src_payments", "Stripe Payments API", T.SOURCE, "Payments", C.CRITICAL,
          "platform", "External payments processor; system of record for charges."),
    Asset("ing_payments", "Payments Ingestion", T.INGESTION, "Payments", C.HIGH,
          "data-eng", "Hourly extract of Stripe charges & refunds."),
    Asset("raw_payments", "raw_payments", T.RAW_TABLE, "Payments", C.MEDIUM,
          "data-eng", "Landed Stripe events, untyped."),
    Asset("stg_payments", "stg_payments", T.TRANSFORMATION, "Payments", C.MEDIUM,
          "analytics-eng", "Cleaned & typed payment rows; casts amount to DECIMAL."),
    Asset("fact_payments", "fact_payments", T.WAREHOUSE_TABLE, "Payments", C.HIGH,
          "analytics-eng", "Conformed payment fact grain = charge."),

    # ---- Orders lineage ---------------------------------------------------
    Asset("src_orders", "Orders API", T.SOURCE, "Commerce", C.CRITICAL,
          "platform", "Checkout / order-management service."),
    Asset("ing_orders", "Orders Ingestion", T.INGESTION, "Commerce", C.HIGH,
          "data-eng", "CDC stream of order lifecycle events."),
    Asset("raw_orders", "raw_orders", T.RAW_TABLE, "Commerce", C.MEDIUM,
          "data-eng", "Landed order events."),
    Asset("stg_orders", "stg_orders", T.TRANSFORMATION, "Commerce", C.MEDIUM,
          "analytics-eng", "Deduplicated, typed orders."),
    Asset("fact_orders", "fact_orders", T.WAREHOUSE_TABLE, "Commerce", C.CRITICAL,
          "analytics-eng", "Central order fact — feeds revenue, customers, marketing, ML."),

    # ---- Customers lineage ------------------------------------------------
    Asset("src_customers", "Customers Database", T.SOURCE, "Commerce", C.HIGH,
          "platform", "Postgres CDC of the customer table."),
    Asset("ing_customers", "Customers Ingestion", T.INGESTION, "Commerce", C.MEDIUM,
          "data-eng", "CDC replication of customer records."),
    Asset("raw_customers", "raw_customers", T.RAW_TABLE, "Commerce", C.LOW,
          "data-eng", "Landed customer rows."),
    Asset("stg_customers", "stg_customers", T.TRANSFORMATION, "Commerce", C.LOW,
          "analytics-eng", "Typed customers; validates customer_id not null."),
    Asset("dim_customers", "dim_customers", T.WAREHOUSE_TABLE, "Commerce", C.HIGH,
          "analytics-eng", "Customer dimension."),

    # ---- Inventory lineage ------------------------------------------------
    Asset("src_inventory", "Inventory System", T.SOURCE, "Inventory", C.HIGH,
          "platform", "Warehouse stock-keeping system."),
    Asset("ing_inventory", "Inventory Ingestion", T.INGESTION, "Inventory", C.MEDIUM,
          "data-eng", "Nightly stock-level snapshot."),
    Asset("raw_inventory", "raw_inventory", T.RAW_TABLE, "Inventory", C.LOW,
          "data-eng", "Landed stock snapshots."),
    Asset("stg_inventory", "stg_inventory", T.TRANSFORMATION, "Inventory", C.LOW,
          "analytics-eng", "Typed inventory levels."),
    Asset("fact_inventory", "fact_inventory", T.WAREHOUSE_TABLE, "Inventory", C.MEDIUM,
          "analytics-eng", "Stock-on-hand fact."),

    # ---- Marketing lineage ------------------------------------------------
    Asset("src_marketing", "Marketing API", T.SOURCE, "Marketing", C.MEDIUM,
          "platform", "Ad-spend & campaign performance feed."),
    Asset("ing_marketing", "Marketing Ingestion", T.INGESTION, "Marketing", C.LOW,
          "data-eng", "Daily campaign & spend pull."),
    Asset("raw_marketing", "raw_marketing", T.RAW_TABLE, "Marketing", C.LOW,
          "data-eng", "Landed campaign rows."),
    Asset("stg_marketing", "stg_marketing", T.TRANSFORMATION, "Marketing", C.LOW,
          "analytics-eng", "Typed spend by channel."),
    Asset("fact_marketing_spend", "fact_marketing_spend", T.WAREHOUSE_TABLE, "Marketing", C.MEDIUM,
          "analytics-eng", "Marketing spend fact."),

    # ---- Business data models --------------------------------------------
    Asset("daily_revenue", "daily_revenue", T.DATA_MODEL, "Analytics", C.CRITICAL,
          "analytics-eng", "Daily net revenue = payments reconciled with orders."),
    Asset("customer_metrics", "customer_metrics", T.DATA_MODEL, "Analytics", C.HIGH,
          "analytics-eng", "Per-customer order & value metrics."),
    Asset("marketing_attribution", "marketing_attribution", T.DATA_MODEL, "Analytics", C.MEDIUM,
          "analytics-eng", "Revenue attributed to marketing channels."),
    Asset("inventory_health", "inventory_health", T.DATA_MODEL, "Analytics", C.MEDIUM,
          "analytics-eng", "Stock coverage vs demand."),

    # ---- Consumers: dashboards & ML --------------------------------------
    Asset("dash_exec_revenue", "Executive Revenue Dashboard", T.DASHBOARD, "Analytics", C.CRITICAL,
          "analytics-eng", "Board-level revenue view."),
    Asset("dash_customer", "Customer Analytics Dashboard", T.DASHBOARD, "Analytics", C.HIGH,
          "growth", "Retention & LTV analysis."),
    Asset("dash_marketing", "Marketing Performance Dashboard", T.DASHBOARD, "Analytics", C.MEDIUM,
          "marketing", "Channel ROAS & spend."),
    Asset("dash_ops", "Operations Dashboard", T.DASHBOARD, "Analytics", C.HIGH,
          "operations", "Fulfilment & stock health."),
    Asset("ml_fraud", "Fraud Detection Model", T.ML_MODEL, "Analytics", C.HIGH,
          "data-science", "Scores charges for fraud risk."),
    Asset("ml_demand", "Demand Forecast Model", T.ML_MODEL, "Analytics", C.MEDIUM,
          "data-science", "Forecasts SKU demand for replenishment."),

    # ---- Business processes ----------------------------------------------
    Asset("bp_board_report", "Board Revenue Reporting", T.BUSINESS_PROCESS, "Business", C.CRITICAL,
          "finance", "Weekly revenue reporting to the board."),
    Asset("bp_replenishment", "Stock Replenishment", T.BUSINESS_PROCESS, "Business", C.HIGH,
          "operations", "Automated purchase-order generation."),
    Asset("bp_fraud_review", "Fraud Review Queue", T.BUSINESS_PROCESS, "Business", C.HIGH,
          "risk", "Manual review of flagged charges."),

    # ---- Teams ------------------------------------------------------------
    Asset("team_finance", "Finance Team", T.TEAM, "Business", C.CRITICAL,
          "finance", "Owns revenue reporting & reconciliation."),
    Asset("team_growth", "Growth Team", T.TEAM, "Business", C.HIGH,
          "growth", "Owns retention & acquisition."),
    Asset("team_marketing", "Marketing Team", T.TEAM, "Business", C.MEDIUM,
          "marketing", "Owns campaign spend decisions."),
    Asset("team_ops", "Operations Team", T.TEAM, "Business", C.HIGH,
          "operations", "Owns fulfilment & inventory."),
    Asset("team_risk", "Risk Team", T.TEAM, "Business", C.HIGH,
          "risk", "Owns fraud & chargebacks."),
]

# --------------------------------------------------------------------------- #
#  DEPENDENCIES  (upstream -> downstream)
# --------------------------------------------------------------------------- #
_D = [
    # Payments
    ("src_payments", "ing_payments"), ("ing_payments", "raw_payments"),
    ("raw_payments", "stg_payments"), ("stg_payments", "fact_payments"),
    # Orders
    ("src_orders", "ing_orders"), ("ing_orders", "raw_orders"),
    ("raw_orders", "stg_orders"), ("stg_orders", "fact_orders"),
    # Customers
    ("src_customers", "ing_customers"), ("ing_customers", "raw_customers"),
    ("raw_customers", "stg_customers"), ("stg_customers", "dim_customers"),
    # Inventory
    ("src_inventory", "ing_inventory"), ("ing_inventory", "raw_inventory"),
    ("raw_inventory", "stg_inventory"), ("stg_inventory", "fact_inventory"),
    # Marketing
    ("src_marketing", "ing_marketing"), ("ing_marketing", "raw_marketing"),
    ("raw_marketing", "stg_marketing"), ("stg_marketing", "fact_marketing_spend"),

    # Models (cross-wired — the interesting part)
    ("fact_payments", "daily_revenue"), ("fact_orders", "daily_revenue"),
    ("fact_orders", "customer_metrics"), ("dim_customers", "customer_metrics"),
    ("fact_orders", "marketing_attribution"), ("fact_marketing_spend", "marketing_attribution"),
    ("fact_inventory", "inventory_health"), ("fact_orders", "inventory_health"),

    # Consumers
    ("daily_revenue", "dash_exec_revenue"),
    ("customer_metrics", "dash_customer"),
    ("marketing_attribution", "dash_marketing"),
    ("inventory_health", "dash_ops"),
    ("fact_payments", "ml_fraud"), ("dim_customers", "ml_fraud"),
    ("fact_orders", "ml_demand"), ("fact_inventory", "ml_demand"),

    # Business processes
    ("dash_exec_revenue", "bp_board_report"),
    ("ml_demand", "bp_replenishment"), ("dash_ops", "bp_replenishment"),
    ("ml_fraud", "bp_fraud_review"),

    # Teams
    ("bp_board_report", "team_finance"), ("dash_exec_revenue", "team_finance"),
    ("dash_customer", "team_growth"),
    ("dash_marketing", "team_marketing"),
    ("dash_ops", "team_ops"), ("bp_replenishment", "team_ops"),
    ("bp_fraud_review", "team_risk"),
]

ORGANIZATION = "NOVA COMMERCE"
SYSTEMS = ["Payments", "Commerce", "Inventory", "Marketing", "Analytics", "Business"]


def build_topology() -> DependencyGraph:
    """Return a fresh NOVA COMMERCE dependency graph."""
    deps = [Dependency(u, d) for (u, d) in _D]
    return DependencyGraph(_A, deps)


def asset_list() -> list[Asset]:
    return list(_A)
