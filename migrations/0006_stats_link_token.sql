-- Keep the capability token so an owner/admin can retrieve an existing link.
-- Older hash-only links remain valid and can be restored using their original URL.
ALTER TABLE public_stats_links ADD COLUMN token TEXT;
