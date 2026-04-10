# Project Scope

## Product goal

Build a restaurant management system that helps operators run front-of-house, kitchen, cashier, and inventory workflows from one place.

Detailed functional requirements are maintained in `docs/requirements.md`.

## Core modules

### 1. Table and reservation management

- Track table status in real time.
- Add and edit tables as the floor layout changes.
- Assign guests, party size, notes, and servers to dine-in tables.
- Assign servers to tables and reservations.
- View seat capacity and service timing.

### 2. Order workflow

- Capture dine-in, takeaway, and delivery orders.
- Move orders through placed, preparing, ready, and completed states.
- Support cashier-side billing, split receipts, partial payments, and unpaid balance tracking.
- Surface kitchen timing and service delays.

### 3. Menu and inventory

- Maintain menu items, pricing, categories, and availability.
- Track low-stock ingredients and reorder thresholds.
- Flag 86'd items before the cashier or wait staff submit orders.

### 4. Billing and reporting

- Track ticket totals, revenue, average spend, and payment status.
- Surface ready-order, low-stock, and unpaid-balance alerts in the live dashboard.
- Expose shift and business-day metrics for managers.
- Generate daily, weekly, and month-to-date sales, expense, and gross-profit reports.

### 5. Staff operations

- Assign roles such as admin, cashier, and kitchen.
- Track active staff on shift.
- Restrict menu, inventory, kitchen, cashier, and reporting actions by role.

## Phase 1 target

Start with an operations dashboard that combines:

- live table status
- active orders
- menu availability
- stock alerts
- kitchen prioritization
- high-level daily metrics
- manager reporting

## Initial architecture

- `apps/api`: Node HTTP API with in-memory data and static file serving.
- `apps/web`: Browser dashboard shell for the operations overview.

This keeps the first iteration simple while preserving a clean seam for future migration to a database-backed API and a richer frontend stack.
