-- Cleanup project backups: keep the N most recent published builds per project
-- while preserving all currently-deployed builds (by domain). Content is cleared
-- (marked as cleaned, isCleaned=true) to free storage, aligning with upstream database_cleanup.
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

  -- Collect IDs of builds to preserve:
  -- 1. All currently-deployed builds (per domain)
  -- 2. The N most recent builds beyond those currently deployed
  WITH current_domain_builds AS (
    -- Latest published builds per project domain (currently in line)
    SELECT "buildId" FROM "Project" p, LATERAL "latestProjectDomainBuildVirtual"(p)
    WHERE p.id = project_id
    UNION
    -- Latest build for project (project domain)
    SELECT "buildId" FROM "Project" p, LATERAL "latestBuildVirtual"(p)
    WHERE p.id = project_id
    UNION
    -- Latest builds for custom domains
    SELECT lb."buildId"
    FROM "Project" p, LATERAL "domainsVirtual"(p) dv, LATERAL "latestBuildVirtual"(dv) lb
    WHERE p.id = project_id
  ),
  recent_non_deployed AS (
    -- N most recent builds beyond those currently deployed
    SELECT id FROM "Build"
    WHERE "projectId" = project_id
      AND deployment IS NOT NULL
      AND "isCleaned" = false
      AND id NOT IN (SELECT "buildId" FROM current_domain_builds)
    ORDER BY "createdAt" DESC
    LIMIT keep
  ),
  builds_to_clean AS (
    -- Builds to clean: published, not already cleaned, not current, not in recent N
    SELECT id FROM "Build"
    WHERE "projectId" = project_id
      AND deployment IS NOT NULL
      AND "isCleaned" = false
      AND id NOT IN (
        SELECT "buildId" FROM current_domain_builds
        UNION
        SELECT id FROM recent_non_deployed
      )
  )
  UPDATE "Build"
  SET
    -- Empty only content columns (matches upstream database_cleanup)
    "styleSources" = '[]'::text,
    styles = '[]'::text,
    breakpoints = '[]'::text,
    "styleSourceSelections" = '[]'::text,
    props = '[]'::text,
    instances = '[]'::text,
    "dataSources" = '[]'::text,
    resources = '[]'::text,
    "marketplaceProduct" = '{}'::text,
    -- Mark as cleaned
    "isCleaned" = true
  WHERE id IN (SELECT id FROM builds_to_clean);

  -- Return count of cleaned builds for logging
  GET DIAGNOSTICS cleaned_count = ROW_COUNT;
  RETURN cleaned_count;
END;
$$ LANGUAGE plpgsql;
