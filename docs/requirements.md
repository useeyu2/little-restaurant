# Little Functional Requirements

This document captures the current functional baseline for the `Little` restaurant management system.

## 1. Order Management

- Provide a point-of-sale interface for dine-in, takeout, and delivery orders.
- Support table assignment during order creation and service updates.
- Allow staff to add items, remove items, and change item quantities on active orders.
- Track order status through `pending`, `preparing`, `ready`, `served`, and `completed`.
- Generate bills and receipt previews, including equal split previews when needed.
- Allow staff to modify or cancel orders with the correct permissions.
- Support split billing for shared tables or partial checkouts.
- Support multiple payment methods for a single bill or order.
- Record partial payments across `cash`, `transfer`, and `pos`.
- Track paid totals, unpaid balances, and payment status on each order.
- Generate payment receipts that show all captured payments and the remaining balance.

## 2. Menu Management

- Add, edit, and remove menu items.
- Organize items into categories.
- Manage pricing and item modifiers such as toppings, portions, or sizes.
- Mark items as available or unavailable in real time.
- Support menu item images when available.
- Support seasonal menus and time-based menu availability.

## 3. Table and Reservation Management

- Provide a visual floor plan for table operations.
- Add new tables and manage existing tables.
- Show real-time table status including `available`, `occupied`, `reserved`, and `cleaning`.
- Assign guests to tables with customer name, party size, notes, and server handoff.
- Track occupied and free tables as service changes.

## 4. Kitchen Display System

- Show a real-time order queue for kitchen staff.
- Prioritize tickets by `rush`, `normal`, and `low`.
- Allow kitchen staff to update order status from `pending` to `preparing` and `ready`.
- Track ticket timing to highlight delays and service bottlenecks.

## 5. Inventory Management

- Track ingredient and stock item quantities.
- Track raw materials as named stock items with units, supplier context, and reorder levels.
- Reduce stock automatically when menu items enter preparation.
- Trigger low-stock alerts when levels fall below thresholds.
- Manage supplier information.
- Add stock purchases and increase on-hand inventory from purchasing activity.
- View stock history covering purchases, usage deductions, and manual adjustments.
- Record waste, spoilage, and stock adjustments.

## 6. Staff Management

- Provide login and logout for restaurant staff.
- Enforce role-based access control for `admin`, `cashier`, and `kitchen` users.
- Allow admins to manage menu, inventory, kitchen board, and reports.
- Allow cashiers to manage orders, tables, receipts, and payments.
- Allow kitchen staff to view the kitchen queue and update ticket priority and kitchen status only.

## 7. Reporting and Analytics

- Generate daily, weekly, and monthly sales reports.
- Show best-selling menu items.
- Track purchase expense totals from stock restocking.
- Calculate gross profit as sales minus stock purchase expense.
- Report inventory usage and stock movement.

## 8. Notification System

- Alert front-of-house staff when an order is ready.
- Surface low-stock alerts prominently during service.
- Remind staff about open orders with unpaid balances.

## 9. Customer Management

- Maintain guest profiles.
- Support loyalty programs or reward balances.
- Preserve customer order history.
- Collect customer feedback and ratings.

## 10. Non-Functional Requirements

### Performance

- Keep normal API responses under two seconds.
- Handle multiple staff sessions at the same time.

### Security

- Require authenticated login for protected actions.
- Encrypt stored passwords when moving beyond demo users.
- Enforce role-based access across admin, cashier, and kitchen workflows.

### Usability

- Keep the interface simple and usable during live service.
- Support mobile-responsive layouts for phones and tablets.

### Scalability

- Leave room for more users, branches, and higher order volume over time.

### Reliability

- Provide daily or automatic backup coverage for production data.
- Reduce risk of data loss through durable persistence and operational recovery steps.

## Notes

- This document currently covers functional requirements only.
- Non-functional requirements, data models, and integration requirements should be captured separately as the project is refined.
