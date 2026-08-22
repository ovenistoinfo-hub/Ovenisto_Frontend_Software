# Ovenisto Frontend

Frontend client for the Ovenisto POS System (Vite + React + TypeScript).

## Documentation

- [`CLAUDE.md`](./CLAUDE.md) — frontend-specific dev quick-reference (e.g. the
  `SelfOrder.tsx` per-device `localStorage` reconciliation gotcha).
  It also carries the architecture overview — providers, API client, outlet
  scoping, real-time, environment and deployment — which previously lived in a
  workspace-level `../CLAUDE.md` outside both git repos and so never survived a
  fresh clone.
- The API this talks to is `Ovenisto-backend`; its own `CLAUDE.md` documents the
  server side of the same outlet-scoping model.
