# Restaurant Management System

This repository starts a restaurant management system with a lightweight Node server and a browser dashboard shell. It is intentionally small so the project can run immediately and evolve without first locking in a heavier framework.

The starter is currently configured for the restaurant name `Little`.

## What is included

- A lightweight HTTP API for dashboard, table, order, and menu data.
- A responsive operations dashboard with role-aware login for admin, cashier, and kitchen staff.
- Interactive order creation, kitchen ticket progression through `pending`, `preparing`, `ready`, `served`, and `completed`, and table turnover controls.
- Table management for add, edit, guest assignment, and occupied or free tracking.
- Partial payment capture with cash, transfer, and POS receipts.
- Stock item tracking with purchase history and live low-stock alerts.
- Kitchen queue prioritization with rush, normal, and low ticket ordering.
- A live notification feed for ready orders, low stock pressure, and unpaid ticket reminders.
- Cloudinary-backed menu image upload support.
- Brevo notification hooks for ready orders, low stock, and payment pending reminders when email settings are configured.
- Daily, weekly, and month-to-date reporting for sales, expenses, and gross profit.
- MongoDB-backed persistence with automatic bootstrap seeding for the first run.
- Project scope notes to keep the next implementation steps focused.
- A functional requirements baseline for `Little`.

## Quick start

```bash
npm.cmd start
```

Then open `http://localhost:3001`.

The API loads local configuration from `.env.local` or `.env`. Use [.env.example](c:/Users/User 1/Desktop/useenlittle/vscode/restaurant system/.env.example) as the template for MongoDB settings.

For Cloudinary uploads, set either `CLOUDINARY_URL` or the individual `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` values.

For Brevo email alerts, set `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, and `BREVO_ALERT_RECIPIENTS`.

On Windows, you can also run [start-local.cmd](c:/Users/User 1/Desktop/useenlittle/vscode/restaurant system/start-local.cmd) by double-clicking it or from `cmd`.

## Vercel deployment

The project includes [vercel.json](c:\Users\User 1\Desktop\useenlittle\vscode\restaurant system\vercel.json) and [api/index.js](c:\Users\User 1\Desktop\useenlittle\vscode\restaurant system\api\index.js) so Vercel can route both the static frontend and `/api/*` requests through the same Node handler.

Set these production environment variables in Vercel before the first deployment:

- `STORE_DRIVER=mongodb`
- `MONGODB_URI`
- `MONGODB_DB_NAME`
- `CLOUDINARY_URL` or the individual Cloudinary credentials
- `BREVO_API_KEY`
- `BREVO_SENDER_EMAIL`
- `BREVO_ALERT_RECIPIENTS`

## Demo accounts

- `admin` / `admin123`
- `cashier` / `cashier123`
- `kitchen` / `kitchen123`

## API endpoints

- `GET /api/health`
- `POST /api/auth/login`
- `GET /api/auth/session`
- `POST /api/auth/logout`
- `POST /api/uploads/menu-image`
- `GET /api/dashboard`
- `GET /api/kitchen/dashboard`
- `GET /api/reports/summary`
- `GET /api/tables`
- `POST /api/tables`
- `GET /api/orders`
- `GET /api/orders/:id/receipt?split=2`
- `GET /api/orders/:id/payment-receipt`
- `GET /api/menu`
- `GET /api/inventory`
- `GET /api/inventory/history`
- `POST /api/orders`
- `POST /api/orders/:id/payments`
- `PATCH /api/orders/:id/items`
- `PATCH /api/orders/:id/status`
- `PATCH /api/kitchen/orders/:id/status`
- `PATCH /api/kitchen/orders/:id/priority`
- `PATCH /api/tables/:id`
- `POST /api/menu`
- `PATCH /api/menu/:id`
- `DELETE /api/menu/:id`
- `POST /api/inventory/items`
- `PATCH /api/inventory/items/:id`
- `POST /api/inventory/purchases`
- `PATCH /api/tables/:id/status`
- `DELETE /api/tables/:id`

## Repository layout

- `apps/api`: Node server and in-memory mock operational data.
- `apps/web`: Static dashboard shell served by the API.
- `docs/project-scope.md`: Initial product and module definition.
- `docs/requirements.md`: Current functional requirements for the system.

## Suggested next steps

1. Move demo accounts and in-memory sessions into persistent staff records with hashed passwords.
2. Expand menu recipe management beyond the seeded defaults for more detailed stock depletion rules.
3. Add expenses beyond stock purchases, plus exportable finance reports.
4. Add staff scheduling, reservations, and customer history on top of the current core.
