CREATE TABLE seed_profiles (
 key text PRIMARY KEY,
 created_at timestamptz NOT NULL DEFAULT now()
);
