-- PostgreSQL 15+ illustrative concurrency-safe no-overlap rule.
-- Pending approvals reserve the interval. Expired holds MUST transition to expired
-- transactionally before a conflicting booking is retried.
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE IF NOT EXISTS reservation_occurrences (
    id uuid PRIMARY KEY,
    room_id uuid NOT NULL,
    series_id uuid,
    start_at timestamptz NOT NULL,
    end_at timestamptz NOT NULL,
    status text NOT NULL CHECK (status IN ('pending','confirmed','cancelled','rejected','expired')),
    CHECK (start_at < end_at),
    EXCLUDE USING gist (
        room_id WITH =,
        tstzrange(start_at, end_at, '[)') WITH &&
    ) WHERE (status IN ('pending','confirmed'))
);
-- In production: use migrations, foreign keys, tenant scoping, retention policies,
-- audit trails, workflow transactions and series/exception lifecycle tables.
