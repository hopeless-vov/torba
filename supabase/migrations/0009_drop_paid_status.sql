-- Drop the 'paid' order status.
--
-- Payment is tracked by `payment_method`, not by a workflow step, so "paid"
-- sat awkwardly between "new" and "sent": an order could be paid *and*
-- shipped, and the single status column could only say one of them. The
-- lifecycle is now strictly new → sent → done.
--
-- Any order still sitting on 'paid' has not shipped yet, so it goes back to
-- 'new'; the payment itself is not lost — it stays on `payment_method`.

update public.orders
   set status = 'new'
 where status = 'paid';

alter table public.orders
  drop constraint if exists orders_status_check;

alter table public.orders
  add constraint orders_status_check
  check (status in ('new', 'sent', 'done'));
