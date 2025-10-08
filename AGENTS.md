# Repository Guidelines

## Project Structure & Module Organization

- The SvelteKit app lives in `src/routes`, with `(main)` grouping site pages, plus feature folders like `token-terms`, `legal`, and `login`.
- Shared UI, services, and stores live in `src/lib`, organized into `components/`, `services/`, `stores/`, `utils/`, and `abi/` for contract bindings; `index.ts` files re-export module surfaces.
- Integration and regression specs sit in `src/e2e`; place fixtures in `src/e2e/shims`.
- Static assets are served from `static`, while build tooling is in `vite.config.ts`, `tailwind.config.js`, and environment defaults in `.env.example`.

## Build, Test, and Development Commands

- `npm run dev` — start the Vite dev server on `localhost:5173` with hot reload.
- `npm run build` / `npm run preview` — create and smoke-test the production bundle.
- `npm run check` — sync SvelteKit and run TypeScript + Svelte diagnostics; use `check:watch` while iterating on types.
- `npm run lint` — apply ESLint rules; resolve warnings before raising a PR.
- `npm run format` — run Prettier with the Svelte plugin; run after structural changes.
- `npm run test` — execute Vitest suites; append `--coverage` to generate `coverage/` via V8.

## Coding Style & Naming Conventions

- Prettier enforces 2-space indentation, single quotes, and trailing commas; never commit manual formatting.
- Prefer PascalCase for Svelte components (`Button.svelte`), camelCase for utilities, and UPPER_CASE for shared constants.
- Keep Svelte files lean: colocate store logic in `src/lib/stores` and import; avoid inline `console.log` (only `warn`/`error` allowed).
- Tailwind utility classes drive styling; group them by layout → color → state, and hoist reusable patterns into `src/lib/styles`.

## Testing Guidelines

- Author new specs as `*.spec.ts` with Vitest + Testing Library; mirror the route or lib path (`src/e2e/home.e2e.spec.ts` is the model).
- Mock network calls with viem or axios adapters in `src/lib/services`, keeping deterministic expectations.
- Run `npm run test && npm run check` before opening a PR; aim to cover contract edge cases and unhappy UI flows.

## Commit & Pull Request Guidelines

- Follow the existing log: short, imperative subjects (`add portfolio store`, `fix claims modal`) with optional scope details in the body.
- Include PR descriptions that call out the user story, testing evidence, and any gated behind feature flags; attach screenshots/gifs for UI changes.
- Link GitHub issues where relevant and ensure CI (lint, check, test) is green before requesting review.
