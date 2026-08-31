-- PULSE demo warehouse — marts layer
-- daily_revenue: the metric the Executive Revenue Dashboard is built on.
--
-- Depends on BOTH fact_payments and fact_orders, which is why a failure in
-- either lineage makes the Executive Revenue Dashboard untrustworthy. This
-- AND-dependency is the reason both sources register as single points of
-- failure in the resilience score.

{{ config(materialized='table') }}

with payments as (

    select
        date_trunc('day', created_at)            as revenue_date,
        sum(amount)                              as gross_revenue,
        sum(case when payment_status = 'refunded'
                 then amount else 0 end)         as refunded_amount,
        count(distinct payment_id)               as payment_count
    from {{ ref('fact_payments') }}
    where payment_status in ('succeeded', 'refunded')
    group by 1

),

orders as (

    select
        date_trunc('day', created_at)            as revenue_date,
        count(distinct order_id)                 as order_count,
        sum(item_count)                          as items_sold
    from {{ ref('fact_orders') }}
    where order_status not in ('cancelled', 'draft')
    group by 1

),

joined as (

    select
        coalesce(p.revenue_date, o.revenue_date)         as revenue_date,
        coalesce(p.gross_revenue, 0)                     as gross_revenue,
        coalesce(p.refunded_amount, 0)                   as refunded_amount,
        coalesce(p.gross_revenue, 0)
            - coalesce(p.refunded_amount, 0)             as net_revenue,
        coalesce(o.order_count, 0)                       as order_count,
        coalesce(o.items_sold, 0)                        as items_sold,
        case
            when coalesce(o.order_count, 0) > 0
            then (coalesce(p.gross_revenue, 0)
                  - coalesce(p.refunded_amount, 0)) / o.order_count
        end                                              as avg_order_value
    from payments p
    full outer join orders o
        on p.revenue_date = o.revenue_date

)

select * from joined
