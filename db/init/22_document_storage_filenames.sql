-- Optional: stable on-disk basename (UUID + extension). Display name remains files.filename.
ALTER TABLE files ADD COLUMN IF NOT EXISTS stored_filename TEXT;
