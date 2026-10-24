ALTER TABLE users ADD COLUMN email text;
CREATE TABLE email_outbox(notification_id bigint PRIMARY KEY REFERENCES notifications(id) ON DELETE CASCADE,attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),sent_at timestamptz,last_error text);
CREATE FUNCTION enqueue_email() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO email_outbox(notification_id) VALUES(NEW.id); RETURN NEW; END; $$;
CREATE TRIGGER notification_email AFTER INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION enqueue_email();
