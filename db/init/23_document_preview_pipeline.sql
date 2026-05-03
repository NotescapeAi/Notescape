ALTER TABLE files ADD COLUMN IF NOT EXISTS document_type TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS preview_type TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS viewer_file_url TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS viewer_file_path TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS viewer_file_type TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS viewer_status TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS conversion_error TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS original_file_url TEXT;
ALTER TABLE files ADD COLUMN IF NOT EXISTS original_file_path TEXT;

UPDATE files
SET original_file_url = storage_url
WHERE original_file_url IS NULL AND storage_url IS NOT NULL;

UPDATE files
SET original_file_path = storage_key
WHERE original_file_path IS NULL AND storage_key IS NOT NULL;

UPDATE files
SET viewer_file_url = '/uploads/previews/' || id::text || '/converted.pdf',
    viewer_file_type = 'pdf',
    viewer_status = COALESCE(viewer_status, 'ready')
WHERE preview_key IS NOT NULL
  AND (viewer_file_url IS NULL OR viewer_file_url NOT LIKE '/uploads/%');

UPDATE files
SET viewer_file_url = storage_url,
    viewer_file_type = 'pdf',
    viewer_status = COALESCE(viewer_status, 'ready')
WHERE (document_type = 'pdf' OR mime_type = 'application/pdf' OR lower(filename) LIKE '%.pdf')
  AND storage_url IS NOT NULL
  AND viewer_file_url IS NULL;
