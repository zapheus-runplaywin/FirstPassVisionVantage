# Supabase

Database migrations and Edge Functions for the FirstPass backend (Supabase, Sydney region).

Empty until Phase 3. The layout follows the Supabase CLI:

- `migrations/` SQL migrations: clubs, teams, games, events, roles, row-level security
- `functions/` Edge Functions: PlayHQ import, pairing

Every migration grants its own tables' access; see "Database migrations" in `AGENTS.md`. CI checks it with `scripts/check-migration-security.py`.
