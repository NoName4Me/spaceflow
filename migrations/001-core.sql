CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE users (
 id uuid PRIMARY KEY, username text UNIQUE NOT NULL, name text NOT NULL,
 password_hash text NOT NULL, role text NOT NULL CHECK(role IN ('admin','member'))
);
CREATE TABLE sessions(token_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),expires_at timestamptz NOT NULL);
CREATE TABLE rooms(id text PRIMARY KEY,data jsonb NOT NULL,layout jsonb NOT NULL DEFAULT '[]',version integer NOT NULL DEFAULT 1);
CREATE TABLE bookings(
 id uuid PRIMARY KEY,room_id text NOT NULL REFERENCES rooms(id),user_id uuid NOT NULL REFERENCES users(id),
 title text NOT NULL,contact text NOT NULL,phone text NOT NULL,hidden boolean NOT NULL DEFAULT false,
 start_at timestamptz NOT NULL,end_at timestamptz NOT NULL,
 status text NOT NULL CHECK(status IN ('pending','confirmed','cancelled','rejected','expired')),
 expires_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(), CHECK(start_at<end_at),
 EXCLUDE USING gist(room_id WITH =,tstzrange(start_at,end_at,'[)') WITH &&) WHERE(status IN ('pending','confirmed'))
);
CREATE INDEX bookings_owner ON bookings(user_id,start_at);
CREATE TABLE audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,actor uuid REFERENCES users(id),action text NOT NULL,target text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
