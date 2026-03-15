# Changelog

## [v1.1.0] - 2026-03-15

- Refactored tools into a class hierarchy with shared AJAX routing
- Added inline cell editor for result tables
- Refactored JS into focused ES modules
- Improved DB Search sidebar with resize handle, maximize button, and collapsible filters
- Shared template for post-type tabs (Trips, Bookings, Payments, Customers)
- Fixed: Beautifier maximize + toggle — clicking the collapse toggle while maximized now restores to normal view instead of also collapsing the sidebar
- Improved: AJAX notice consistency — all AJAX actions now show a global status bar notice before the request fires and clear it on completion
  - Beautifier (Beautify / Var Dump): both buttons disabled during request, status shows "Processing…", clears on success, timed error on failure
  - DB Search execute action: error and network-failure notices now auto-hide after 3 seconds
  - Overview option toggle: status bar shows "Loading…" while fetching and clears on completion or error

## [v1.0.0] - initial release

- Overview, Trips, Bookings, Payments, Customers, and DB Search tabs
- PHP serialized / JSON / Base64 / var_dump beautifier sidebar
- DB table browser with column filters and pagination
- Dark mode support
