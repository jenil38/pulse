-- PULSE demo warehouse — staging layer
-- stg_orders: deduplicated, typed order events.
--
-- Orders is the highest-blast-radius source in the topology: fact_orders fans
-- out to daily_revenue, customer_metrics, marketing_attribution and the demand
-- forecast model.

with source as (

    select * from {{ source('raw', 'raw_orders') }}

),

deduplicated as (

    -- CDC can replay events; keep the latest version of each order.
    select
        *,
        row_number() over (
            partition by order_id
            order by updated_at desc
        ) as _rn
    from source
    where order_id is not null

),

renamed as (

    select
        order_id,
        customer_id,
        cast(order_total as decimal(12, 2))      as order_total,
        cast(item_count as integer)              as item_count,
        lower(status)                            as order_status,
        cast(created_at as timestamp)            as created_at,
        cast(updated_at as timestamp)            as updated_at
    from deduplicated
    where _rn = 1

)

select * from renamed
