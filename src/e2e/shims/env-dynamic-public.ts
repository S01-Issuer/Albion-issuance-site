// Test shim for SvelteKit's `$env/dynamic/public` virtual module.
//
// The sveltekit() vite plugin does not provide `$env/dynamic/public` in the
// vitest environment (only `$env/static/public`), so `import { env } from
// "$env/dynamic/public"` resolves to undefined and crashes module load of
// network.ts. This shim provides an empty `env` object; network.ts treats every
// missing PUBLIC_* fallback URL as absent (via its isString guard) and uses the
// hardcoded primary endpoints, which is the correct test behavior.
export const env: Record<string, string> = {};
