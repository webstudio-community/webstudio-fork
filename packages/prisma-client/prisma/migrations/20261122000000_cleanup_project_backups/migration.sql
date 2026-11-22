-- Cleanup project backups: keep only the N most recent published builds per project
-- Builds older than the Nth most recent are marked as cleaned (content cleared, isCleaned=true)
-- This aligns with upstream's database_cleanup behavior: empties content columns and sets the flag
CREATE OR REPLACE FUNCTION cleanup_project_backups(
  project_id text,
  keep int DEFAULT 5
) RETURNS int AS $$
DECLARE
  cleaned_count int := 0;
BEGIN
  -- Guard: 0 or negative means unlimited, skip cleanup
  IF keep <= 0 THEN
    RETURN 0;
  END IF;

  -- Collect IDs of latest builds to preserve (also preserve dev builds)
  WITH latest_builds AS (
    -- Latest published builds per project (up to 'keep' most recent)
    SELECT id FROM "Build"
    WHERE "projectId" = project_id
      AND deployment IS NOT NULL
    ORDER BY "createdAt" DESC
    LIMIT keep
  ),
  builds_to_clean AS (
    -- Published builds older than the latest 'keep', not already cleaned
    SELECT id FROM "Build"
    WHERE "projectId" = project_id
      AND deployment IS NOT NULL
      AND "isCleaned" = false
      AND id NOT IN (SELECT id FROM latest_builds)
  )
  UPDATE "Build"
  SET
    -- Empty all content columns (matches upstream database_cleanup exactly)
    "pages" = '{}',
    "breakpoints" = '[]',
    "styles" = '[]',
    "styleSources" = '[]',
    "styleSourceSelections" = '[]',
    "props" = '[]',
    "dataSources" = '[]',
    "resources" = '[]',
    "instances" = '[]',
    "marketplaceProduct" = '{}',
    "projectSettings" = '{"meta":{},"compiler":{}}',
    -- Mark as cleaned
    "isCleaned" = true
  WHERE id IN (SELECT id FROM builds_to_clean);

  -- Return count of cleaned builds for logging
  GET DIAGNOSTICS cleaned_count = ROW_COUNT;
  RETURN cleaned_count;
END;
$$ LANGUAGE plpgsql;

-- PostgREST needs EXECUTE privilege on the function for RPC calls
GRANT EXECUTE ON FUNCTION cleanup_project_backups(text, int) TO anon;
