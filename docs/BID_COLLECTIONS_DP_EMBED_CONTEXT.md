# Bid Collections ← Designer Pages: embedded “Add to Bid Package” context

Share this with the **Bid Collections** (`@dpwizards/bid-collections-ui` / BC app) repository so embedded and full-page flows stay aligned.

## Summary

Designer Pages (DP) opens Bid Collections **inside a modal lightbox** on the project page when the user chooses **Bulk Edit → Add to Bid Package** with specs selected. BC must be able to **read DP context** (project + selected `project_product_ids`) to drive a **DP-native** add/sync flow, while **CSV import remains fully available** on the same Import screen (two modes, not a replacement).

## How DP passes data today

### 1. React props (wrapper hosted in DP)

DP registers `BidCollectionsLightboxApp` in the project Webpack bundle and mounts it with **React on Rails**:

| Prop | Type | Description |
|------|------|-------------|
| `projectId` | string/number | DP `projects.id` |
| `firmId` | string/number | DP firm id (`DP.Handlers.Project.firm_id`) |
| `projectName` | string | Human-readable project name |
| `projectProductIds` | string[] | Selected spec line ids (`ProjectProduct` ids); may include sentinel values such as `"all"` per existing bulk patterns |

These are the **canonical** inputs for the embedded flow. BC may choose to read them by extending the public API of `BidCollectionsApp` (e.g. `dpEmbedContext` prop) instead of relying on globals long term.

### 2. Global bridge (current)

Until BC accepts explicit props, DP also sets:

```js
window.__DP_BID_COLLECTIONS_CONTEXT__ = {
  projectId: "<string>",
  firmId: "<string>",
  projectName: "<string>",
  projectProductIds: ["<id>", ...]
};
```

- Set when the lightbox mounts; cleared on unmount (same object reference guard).
- **BC should treat this as optional**: full-page `/bid_collections` load will not set it.

### 3. Routing / embedding

- Embedded app uses **`BidCollectionsApp`** with **`router="memory"`**, **`basename="/bid_collections"`**, **`initialPath="/import"`** so the user lands on **Import Package** first.
- DP rewrites BC client API calls to **`/bid_collections/api`** and adds CSRF for same-origin mutating requests (see DP `bidCollectionsFetchPatch.js`).

## Requirements for BC

### A. Consume DP context when present

When `window.__DP_BID_COLLECTIONS_CONTEXT__` is set (or when equivalent props are passed):

- Pre-fill or lock **DP project** context where the UI asks for project/package (align with `GET /api/v2/bid_collections/context` and package list/sync contracts on the DP side).
- Use **`projectProductIds`** as the authoritative selection for **hydration/sync** (e.g. call DP **`POST /api/v2/bid_collections/projects/:project_id/specs/batch`** via service-to-service auth — not browser — from BC backend if applicable).
- Show clear copy that specs are coming **from the current DP selection** (N specs).

### B. Keep CSV import as a first-class path

On **Import Package** (and any step flow):

- **Do not remove** CSV file pick, preview, create package, add to existing package, etc.
- Support **both**:
  1. **From Designer Pages** — selection + context from embed (primary for embedded lightbox).
  2. **From CSV** — existing behavior for manual/legacy and full-page use.

Practical UX patterns (BC choice):

- Tabs or radio: **“Use selected specs from project”** vs **“Upload CSV”**.
- Or: if embed context exists, default to DP mode and still show **“Import from CSV instead”** collapsing to the current CSV UI.

### C. Full-page vs embedded

| Context | `__DP_BID_COLLECTIONS_CONTEXT__` | Expected default |
|---------|----------------------------------|------------------|
| Full browser `/bid_collections` | Absent | Current behavior (often CSV / projects as today) |
| DP lightbox | Present | DP-aware import flow + CSV still available |

### D. Optional: formal props on `BidCollectionsApp`

Recommended evolution:

```tsx
<BidCollectionsApp
  router="memory"
  basename="/bid_collections"
  initialPath="/import"
  dpEmbedContext={{
    projectId,
    firmId,
    projectName,
    projectProductIds,
  }}
/>
```

When `dpEmbedContext` is `undefined`, behavior matches today’s standalone app.

## DP API reminders (for BC backend / docs)

- Bootstrap: **`GET /api/v2/bid_collections/context?firm_id=&project_id=`** (HMAC service auth). Bid Collections proxies this as **`GET /api/dp/context?firm_id=&project_id=`** for browser callers when using the HMAC proxy mode.
- Package list: **`GET /api/v2/bid_collections/projects/:project_id/bid_packages`** (`project_id` is DP project id).
- Spec hydration: **`POST /api/v2/bid_collections/projects/:project_id/specs/batch`** with `{ project_product_ids: [...] }` → `items` + `missing_ids`.

## Contact / code pointers in DP

- Lightbox + mount: `app/assets/javascripts/dp/projects/projects-handler.js` (`.edit-spec-bid-package`).
- React wrapper: `app/javascript/bundles/BidCollectionsApp/BidCollectionsLightboxApp.jsx`.
- Fetch rewrite + CSRF: `app/javascript/bundles/BidCollectionsApp/bidCollectionsFetchPatch.js`.
- Feature flag: `?show_bc=1` or `ENV["ENABLE_BID_COLLECTIONS"]=1` + meta `bid-collections-enabled`.

---

*This file is maintained in DP for handoff to the Bid Collections team; BC may mirror or link it from their repo.*
