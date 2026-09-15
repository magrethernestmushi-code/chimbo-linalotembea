# Chimbo Linalotembea — Online Catalog & Ordering

Browsable online catalog with 44 products (each with multiple price/size
options) across 5 categories, a customer ordering flow (no online payment —
orders are confirmed by phone), and an admin panel for managing products and
viewing orders.

## Running locally
```bash
npm install
ADMIN_USERNAME=admin ADMIN_PASSWORD=choose-a-password npm start
```
Visit `http://localhost:3000` for the store and `http://localhost:3000/admin` for admin.

## Environment variables (set these on Render)
- `ADMIN_USERNAME`, `ADMIN_PASSWORD` — admin login (always set a real password)
- `SESSION_SECRET` — random string so logins survive restarts
- `DATA_DIR` — where live products/orders are stored (see below)

## Data persistence
Products and orders are JSON files that reset on redeploy unless you attach a
Render Disk and set `DATA_DIR` to its mount path (e.g. `/var/data`).

## Deploying on Render
- Runtime: Node · Build: `npm install` · Start: `npm start`
