# WP Travel Engine — Dev Zone

> **For development and debugging purposes only. Do not use on production sites.**

A visual database inspector for [WP Travel Engine](https://wptravelengine.com/) that lets you diagnose and inspect trip, booking, payment, and customer data directly from WP Admin — without touching phpMyAdmin or writing raw SQL queries.

## Intent

This plugin is being developed as an internal developer tool to support the WP Travel Engine team during active development and debugging. The goal is to provide a quick, centralized admin interface to inspect and search database records related to WP Travel Engine — covering trips, bookings, payments, customers, and raw DB queries — all without leaving the WordPress dashboard.

## Requirements

- WordPress 6.9+
- PHP 7.4+
- [WP Travel Engine](https://wptravelengine.com/) plugin (active)

## Installation

Since this plugin is not listed on the WordPress plugin directory, install it directly from this repository:

1. Click **Code → Download ZIP** on this page
2. In your WordPress admin, navigate to **Plugins → Add New → Upload Plugin**
3. Choose the downloaded `.zip` file and click **Install Now**
4. Click **Activate Plugin**

Once activated, navigate to **Tools → Dev Zone** in WP Admin.

## Tabs

| Tab | Description |
|-----|-------------|
| Overview | WP Travel Engine price categories, registered taxonomies with their terms, and all WTE-related options stored in the database |
| Trips | Browse and inspect all trip post data |
| Bookings | View booking records and their metadata |
| Payments | Inspect payment entries linked to bookings |
| Customers | View customer records |
| Logs | Browse the WordPress debug log with live-reload and line count |
| Query | Full table browser — select any DB table, apply column filters, paginate results, and copy cell values with a single click |

## Query Tab

The Query tab is a full interactive database browser:

- **Table list** — left sidebar lists all DB tables grouped by WP Travel Engine, WordPress core, and Other; filterable by name; collapsible
- **Query builder** — select a table to load its columns, add one or more column filters (`=`, `!=`, `LIKE`, `IS NULL`, etc.), set a row limit, and run the query
- **Results table** — click any cell to copy its value to the clipboard
- **Pagination** — navigate large result sets in pages

### Beautifier sidebar

A collapsible, resizable panel on the right edge of the Query tab for parsing raw serialized data:

- Paste PHP-serialized strings, JSON, Base64-encoded data, `var_dump()` output, or URL query strings
- Click **Beautify** to decode and render as an interactive tree with type badges (`string`, `int`, `float`, `bool`, `null`)
- The input and result persist across tab switches and are cleared only on page reload
- The sidebar can be collapsed, drag-resized, or maximized to full screen

## UI

- **Dark mode** — toggle via the ☀ button in the header; preference is saved across sessions
- **Status bar** — live loading/error notices float in the tab bar
- **Inline editing** — metadata values can be edited directly in the Trips, Bookings, Payments, and Customers tabs

## Warning

This plugin is **solely intended for development and debugging use**. It exposes raw database content in the WP Admin and is not hardened for use on public or production environments. Keep it deactivated or uninstalled on any live site.
