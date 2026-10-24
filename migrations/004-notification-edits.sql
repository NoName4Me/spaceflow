DROP TRIGGER booking_notification ON bookings;
CREATE OR REPLACE FUNCTION notify_booking_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_booking bookings%ROWTYPE;
BEGIN
 SELECT * INTO current_booking FROM bookings WHERE id=NEW.id;
 IF NOT FOUND OR current_booking.revision<>NEW.revision OR current_booking.status<>NEW.status THEN RETURN NULL; END IF;
 IF TG_OP='INSERT' THEN
  INSERT INTO notifications(user_id,booking_id,status) VALUES(NEW.user_id,NEW.id,NEW.status);
 ELSIF NEW.status IS DISTINCT FROM OLD.status OR NEW.revision IS DISTINCT FROM OLD.revision THEN
  INSERT INTO notifications(user_id,booking_id,status) VALUES(NEW.user_id,NEW.id,CASE WHEN NEW.revision IS DISTINCT FROM OLD.revision THEN 'updated' ELSE NEW.status END);
 END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER booking_notification AFTER INSERT OR UPDATE ON bookings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION notify_booking_change();
