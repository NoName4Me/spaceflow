CREATE TABLE departments(id uuid PRIMARY KEY,name text UNIQUE NOT NULL);
ALTER TABLE users ADD COLUMN department_id uuid REFERENCES departments(id),ADD COLUMN active boolean NOT NULL DEFAULT true;
CREATE UNIQUE INDEX rooms_unique_code ON rooms((data->>'code')) WHERE data ? 'code';
CREATE TABLE reservation_series(
 id uuid PRIMARY KEY,room_id text NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id),rule jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE bookings ADD COLUMN series_id uuid REFERENCES reservation_series(id);
CREATE INDEX bookings_series ON bookings(series_id);
CREATE TABLE reservation_exceptions(series_id uuid NOT NULL REFERENCES reservation_series(id) ON DELETE CASCADE,date date NOT NULL,reason text NOT NULL,PRIMARY KEY(series_id,date));
CREATE TABLE notifications(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 booking_id uuid REFERENCES bookings(id) ON DELETE CASCADE,status text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),read_at timestamptz
);
CREATE INDEX notifications_owner ON notifications(user_id,id DESC);
CREATE FUNCTION notify_booking_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
  INSERT INTO notifications(user_id,booking_id,status) VALUES(NEW.user_id,NEW.id,NEW.status);
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER booking_notification AFTER INSERT OR UPDATE OF status ON bookings FOR EACH ROW EXECUTE FUNCTION notify_booking_change();
