CREATE OR REPLACE FUNCTION notify_booking_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_booking bookings%ROWTYPE;
BEGIN
 SELECT * INTO current_booking FROM bookings WHERE id=NEW.id;
 IF NOT FOUND OR current_booking.revision<>NEW.revision OR current_booking.status<>NEW.status THEN RETURN NULL; END IF;
 IF TG_OP='INSERT' THEN
  INSERT INTO notifications(user_id,booking_id,status) VALUES(NEW.user_id,NEW.id,NEW.status);
 ELSIF NEW.status IS DISTINCT FROM OLD.status OR NEW.revision IS DISTINCT FROM OLD.revision THEN
  INSERT INTO notifications(user_id,booking_id,status) VALUES(NEW.user_id,NEW.id,CASE WHEN NEW.status IS NOT DISTINCT FROM OLD.status OR (OLD.status='cancelled' AND NEW.status IN ('pending','confirmed')) THEN 'updated' ELSE NEW.status END);
 END IF;
 RETURN NULL;
END; $$;
