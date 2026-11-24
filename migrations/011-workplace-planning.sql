CREATE TABLE floor_scene_drafts(
 floor_id uuid PRIMARY KEY REFERENCES floors(id) ON DELETE CASCADE,
 base_revision integer NOT NULL, revision integer NOT NULL DEFAULT 1,
 objects jsonb NOT NULL, reference_image text, updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE floor_scenes ADD COLUMN reference_image text;
ALTER TABLE floor_scene_versions ADD COLUMN reference_image text;
ALTER TABLE floor_scene_versions DROP CONSTRAINT floor_scene_versions_actor_fkey,
 ADD CONSTRAINT floor_scene_versions_actor_fkey FOREIGN KEY(actor) REFERENCES users(id) ON DELETE SET NULL;
