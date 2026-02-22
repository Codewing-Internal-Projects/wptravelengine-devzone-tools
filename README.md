# WP Travel Engine — Dev Zone

A developer-only companion plugin for WP Travel Engine. Provides a visual database inspector and data editor directly in WP Admin — useful for diagnosing and fixing data issues without leaving the browser.

> **Not for production sites.** Keep this plugin active only in local/staging environments.

---

## Requirements

| Requirement | Version |
|---|---|
| PHP | 7.4+ |
| WordPress | 6.9+ |
| WP Travel Engine | any (must be active) |

---

## Installation

Run the following command from the **wp-travel-engine** core repository to compile and sync the plugin assets:

```bash
yarn grunt devzone
```
---

## Tabs

| Tab | What it does |
|---|---|
| **Overview** | Browse and edit all `wp_travel_engine_*` / `wptravelengine_*` WordPress options. Supports nested array editing via dot-notation paths. |
| **Trips** | List and inspect `trip` posts. View post fields, meta, and taxonomy terms. Edit meta values and core post fields (`post_title`, `post_status`, `post_date`). |
| **Bookings** | Same as Trips, for `booking` posts. |
| **Payments** | Same as Trips, for `wte-payments` posts. |
| **Customers** | Same as Trips, for `customer` posts. |
| **Query** | Browse any database table. Select a table, filter by column values, and paginate results. WTE-related tables are listed first. |

All tabs also include an **Unserialize** tool that decodes PHP-serialized, JSON, base64, and URL-encoded data — useful for inspecting raw meta values.

---
