ALTER TABLE bookings ADD COLUMN notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000);
CREATE INDEX bookings_room_start ON bookings(room_id, start_at DESC, id DESC);
