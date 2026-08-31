-- PULSE demo warehouse — staging layer
-- stg_payments: cleaned, typed payment rows.
--
-- This is the model the "Payments schema drift" demo scenario targets: the
-- CAST below is exactly what breaks when `amount` arrives as STRING instead of
-- DECIMAL, which is why the failure propagates as mode = BREAK.

with source as (

    select * from {{ source('raw', 'raw_payments') }}

),

renamed as (

    select
        charge_id                                as payment_id,
        order_id,
        customer_id,
        -- Contract: amount MUST be numeric. Schema drift here breaks
        -- fact_payments and everything downstream of it.
        cast(amount as decimal(12, 2))           as amount,
        upper(currency)                          as currency,
        status                                   as payment_status,
        cast(created_at as timestamp)            as created_at,
        cast(updated_at as timestamp)            as updated_at
    from source
    where charge_id is not null

)

select * from renamed
