-- Order Statistics View
-- Aggregates order data by customer for reporting

SELECT
    c.id AS customer_id,
    c.name AS customer_name,
    COUNT(o.id) AS total_orders,
    COALESCE(SUM(o.total_amount), 0) AS total_amount,
    MAX(o.order_date) AS last_order_date
FROM customer c
LEFT JOIN jhi_order o ON o.customer_id = c.id
GROUP BY c.id, c.name
