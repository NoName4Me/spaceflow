ALTER TABLE buildings ADD COLUMN map_width real NOT NULL DEFAULT 15, ADD COLUMN map_depth real NOT NULL DEFAULT 13, ADD COLUMN map_rotation real NOT NULL DEFAULT 0;
ALTER TABLE campuses ADD COLUMN map_objects jsonb NOT NULL DEFAULT '[]', ADD COLUMN map_revision integer NOT NULL DEFAULT 0;
