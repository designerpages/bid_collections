# Bid Collections Scope Summary (Codex Build Log)

## Purpose
This document summarizes what has been implemented in the Bid Collections app so far, with emphasis on Award + Post-Award workflows and the current dashboard/comparison UX. It is intended as a handoff artifact for product/design review (e.g., Lovable).

## Product Intent (Current)
- Bid Collections is a bid intake + comparison workflow for designers.
- Award workflow selects a winning vendor and preserves decision context.
- Post-award workflow is intentionally lightweight (execution bridge, not a full submittal platform).
- Focus is on reducing email chaos, preserving decision memory, and keeping UX practical for small-to-mid teams.

## Implemented Scope

### 1) Import and Package Setup
- Import flow split into two modes:
  - `Create New Bid Package`
  - `Add to Existing Bid Package`
- Add-to-existing flow implemented end-to-end:
  - Project -> existing package -> CSV upload -> preview -> append
- Mode selector restyled as tab-like controls (less action-button feel).
- Added endpoint:
  - `POST /api/bid_packages/:id/import_rows`

### 2) Package Line Item Lifecycle
- Soft deactivate/reactivate for package products using `spec_items.active`.
- Added endpoints:
  - `PATCH /api/bid_packages/:id/spec_items/:spec_item_id/deactivate`
  - `PATCH /api/bid_packages/:id/spec_items/:spec_item_id/reactivate`
- Deactivated line items are excluded from:
  - Bidder entry views
  - Comparison views
  - Public read-only views

### 3) Bidder Input and Validation
- Lead Time supports:
  - Single value (`30`)
  - Range (`30-45`)
- Validation UX improved:
  - Invalid fields highlighted inline
  - Error/status line uses error styling
  - Frontend validation runs before save/submit
- Fixed server error in bidder save path (`active_spec_item_ids` NameError).

### 4) Comparison Table and Export
- Comparison supports per-cell BoD/Sub selection (vendor + row granularity).
- `Use` row filtering implemented and persisted per package.
- Comparison state persistence (per bid package) includes:
  - BoD/Sub selection state
  - Active/inactive (`Use`) row selection
  - View toggles (`Product`, `Brand`, `Lead Time`, `Notes`)
  - Comparison mode and responder sort
- Added reset behavior for comparison state.
- Export parity improvements:
  - Respects comparison mode (`none`, etc.)
  - Respects column/view toggles
  - Respects per-cell BoD/Sub and row `Use` filters
  - CSV and XLSX parity aligned

### 5) Award / Re-Award / Unaward
- Award capability implemented from comparison flow.
- Re-award supported with history retained.
- Unaward supported.
- Added legal/audit-friendly award event history (no destructive overwrite).
- Dashboard reflects awarded/not selected states and totals behavior.

#### Important Data Behavior Added
- Award action now carries comparison snapshot context:
  - excluded spec item IDs (`Use` off rows)
  - per-cell BoD/Sub selection map
- Snapshot stored on `bid_award_events.comparison_snapshot`.
- This makes award deterministic to the exact approved view at award time.

### 6) Dashboard UX Evolution
- Bid Package Dashboard now keeps selected/loaded package continuity.
- Bidders module substantially streamlined:
  - Snapshot information surfaced in-row (quoted counts, completion, BoD skipped, totals)
  - Inline password edit icon
  - Inline invite-link copy icon (bulk copy action removed)
  - Compare CTA integrated into dashboard flow
- Post-award behavior:
  - Winner-only view option plus `Show All`
  - Nonessential controls hidden when not relevant

### 7) Line Items + Approval Matrix (Post-Award Lite)
- Single shared line-items table pattern on dashboard.
- When awarded, table extends with requirement columns (approval matrix).
- Approval cells support:
  - N/A (gray), pending (red), approved (green + timestamp)
- Row-level visual signal:
  - Code/tag treatment indicates fully approved vs pending approvals.
- Added sort options for post-award line items:
  - `Code/Tag`
  - `Needs Attention (Most Pending)`
  - `Most Approved (Least Pending)`
- To reduce jarring reorder during active review:
  - Pending-based sort uses snapshot ordering
  - Manual refresh-sort icon added

### 8) Comparison Navigation & Layout
- Comparison removed from primary top nav in favor of dashboard-driven `Compare`.
- Compare opens scoped by selected dashboard package.
- Comparison view moved toward focused/fullscreen layout.
- Added close action back to dashboard.

### 9) Winner Vendor Experience (Bidder-Side)
- Winner status displayed as `winner`.
- Winner view now reuses same line-item table (no separate duplicate table).
- In winner mode:
  - Only active rows included
  - Only award-approved BoD/Sub selection shown
  - Editing fields removed for clarity
  - `Extended Price` retained
  - Per-row file upload retained
- Post-award upload discoverability improved:
  - General files shown in table with file names + timestamps
  - Per-row files shown compactly as `N file(s) · View`
  - `View` opens modal with file names + timestamps

## Current Rules and UX Decisions

### Awarded Mode Locking
- Locked:
  - `Use` row activation control
  - BoD/Sub cell toggles
- Still available:
  - View toggles and top-level comparison view controls
  - Sort/export controls

### Totals
- Pre-award dashboard can show ranges where applicable.
- Post-award dashboard totals show precise currency values.

## Audit/History
- Award history is retained and superseded (never hard-deleted).
- Re-award and unaward actions are tracked as events.
- Post-award actions and approvals retain timestamps.

## Technical Additions (Recent)

### Migrations
- Recent engine-safe migration names use the `bid_collections_` prefix.
- Examples:
  - `20260226163000_bid_collections_add_active_to_spec_items.rb`
  - `20260226170000_bid_collections_change_lead_time_days_to_string.rb`
  - `20260301000500_bid_collections_add_comparison_snapshot_to_bid_award_events.rb`

### Local Dev / Legacy Runtime Notes (Ruby 2.4.5 + Rails 5.2)
- This repo targets Ruby `2.4.5` and Rails `5.2.8.x`; avoid Rails 7+ APIs (e.g. `primary_abstract_class`, `enum :field`, `Struct keyword_init`).
- The frontend target is React `17.x`; keep host-app embedding expectations aligned with that version line.
- MySQL FK types must match exactly; some environments use integer PKs (legacy) while newer Rails defaults to bigint. Migrations should reference the actual PK type when creating FKs.
- Import flow prerequisites:
  - A `Project` must exist/selected before CSV preview can run.
  - Designer Pages CSV rows may omit `Code`/SKU; import defaults `sku` from `spec_item_id` so inserts satisfy `spec_items.sku NOT NULL`.

### Key Endpoints Added/Extended
- `POST /api/bid_packages/:id/import_rows`
- `PATCH /api/bid_packages/:id/spec_items/:spec_item_id/deactivate`
- `PATCH /api/bid_packages/:id/spec_items/:spec_item_id/reactivate`
- Award endpoints extended to include comparison snapshot context:
  - `POST /api/bid_packages/:id/award`
  - `PATCH /api/bid_packages/:id/change_award`
  - `PATCH /api/bid_packages/:id/clear_award`

## Known Open Design Opportunities (Frontend)
- Standardize dense-table visual hierarchy (spacing, typography, emphasis).
- Improve icon language consistency (actions, state hints, upload/file affordances).
- Refine row-state badges/dots to improve scanability at high row counts.
- Harmonize modal patterns (award, remove award, file list) with one visual system.
- Improve progressive disclosure for complex controls (advanced comparison settings).
- Explore sticky controls/header behavior for very large tables.

## Suggested “Next Design Pass” Prompts for Lovable
- Redesign dashboard information hierarchy with 3 goals:
  1) Faster winner identification
  2) Faster “what is pending approval” scan
  3) Lower cognitive load in dense tables
- Propose a consistent state system (pending/approved/lost/winner/no activity/disabled) using color + icon + label.
- Propose compact table interaction patterns for:
  - Per-row actions
  - File visibility
  - Sort/filter discoverability
- Create mobile and desktop variants for:
  - Dashboard
  - Comparison
  - Winner vendor view

## Definition of Done (Current Slice)
- Award decisions are now tied to specific comparison state (Use + BoD/Sub).
- Winner experience reflects awarded decision context instead of editable bid-entry context.
- Post-award file interactions are visible and usable without inflating table row heights.
