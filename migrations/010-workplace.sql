CREATE TABLE campuses(id uuid PRIMARY KEY,name text UNIQUE NOT NULL);
INSERT INTO campuses VALUES('00000000-0000-4000-8000-000000000001','默认园区');
ALTER TABLE buildings ADD COLUMN campus_id uuid NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001' REFERENCES campuses(id),
 ADD COLUMN map_x real, ADD COLUMN map_y real;
CREATE TABLE floor_scenes(
 floor_id uuid PRIMARY KEY REFERENCES floors(id) ON DELETE CASCADE,
 revision integer NOT NULL DEFAULT 0, objects jsonb NOT NULL DEFAULT '[]'
);
CREATE TABLE floor_scene_versions(
 floor_id uuid REFERENCES floors(id) ON DELETE CASCADE, revision integer NOT NULL,
 objects jsonb NOT NULL, actor uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(floor_id,revision)
);
