-- Split the self-hosting `buildMode` field on latestBuildVirtual into two
-- orthogonal axes, matching the publisher's (renderMode × host) model:
--   renderMode — "ssg" | "ssr"
--   host       — "local" | "cloudflare" | "coolify" | "ssh"
-- Both are extracted from Build.deployment and nullable (static builds, and
-- builds published before this split, have neither).
--
-- The Publish dialog's "DNS may be stale" warning now keys on `host` alone —
-- switching renderMode never changes a domain's DNS target.

-- Drop the functions that depend on the current table shape
DROP FUNCTION IF EXISTS "latestBuildVirtual"("Project");
DROP FUNCTION IF EXISTS "latestBuildVirtual"("domainsVirtual");
DROP FUNCTION IF EXISTS "latestProjectDomainBuildVirtual"("Project");
DROP FUNCTION IF EXISTS "latestBuildVirtual"("DashboardProject");

-- Replace the buildMode column with renderMode + host
ALTER TABLE "latestBuildVirtual"
  DROP COLUMN IF EXISTS "buildMode",
  ADD COLUMN "renderMode" text,
  ADD COLUMN "host" text;

COMMENT ON COLUMN "public"."latestBuildVirtual"."renderMode" IS 'Self-hosting render mode ("ssg" | "ssr") this build was deployed with, extracted from Build.deployment. Null for static builds and builds predating the (renderMode, host) split.';
COMMENT ON COLUMN "public"."latestBuildVirtual"."host" IS 'Self-hosting host ("local" | "cloudflare" | "coolify" | "ssh") this build was deployed to, extracted from Build.deployment. Null for static builds and builds predating the (renderMode, host) split.';

-- Recreate the function for Project with renderMode + host fields
CREATE
OR REPLACE FUNCTION "latestBuildVirtual"("Project") RETURNS SETOF "latestBuildVirtual" ROWS 1 AS $$
SELECT
  b.id AS "buildId",
  b."projectId",
  '' as "domainsVirtualId",
  -- Use CASE to determine which domain to select based on conditions
  CASE
    WHEN (b.deployment :: jsonb ->> 'projectDomain') = p.domain
    OR (b.deployment :: jsonb -> 'domains') @> to_jsonb(array [p.domain]) THEN p.domain
    ELSE d.domain
  END AS "domain",
  b."createdAt",
  b."publishStatus",
  b."updatedAt",
  (b.deployment :: jsonb ->> 'renderMode') AS "renderMode",
  (b.deployment :: jsonb ->> 'host') AS "host"
FROM
  "Build" b
  JOIN "Project" p ON b."projectId" = p.id
  LEFT JOIN "ProjectDomain" pd ON pd."projectId" = p.id
  LEFT JOIN "Domain" d ON d.id = pd."domainId"
WHERE
  b."projectId" = $1.id
  AND b.deployment IS NOT NULL -- 'destination' IS NULL for backward compatibility; 'destination' = 'saas' for non-static builds
  AND (
    (b.deployment :: jsonb ->> 'destination') IS NULL
    OR (b.deployment :: jsonb ->> 'destination') = 'saas'
  )
  AND (
    -- Check if 'projectDomain' matches p.domain
    (b.deployment :: jsonb ->> 'projectDomain') = p.domain -- Check if 'domains' contains p.domain or d.domain
    OR (b.deployment :: jsonb -> 'domains') @> to_jsonb(array [p.domain])
    OR (b.deployment :: jsonb -> 'domains') @> to_jsonb(array [d.domain])
  )
ORDER BY
  b."createdAt" DESC
LIMIT
  1;

$$ STABLE LANGUAGE sql;

COMMENT ON FUNCTION "latestBuildVirtual"("Project") IS 'This function computes the latest build for a project, ensuring it is a production (non-static) build, where the domain matches either the Project.domain field or exists in the related Domain table. It provides backward compatibility for older records with a missing "destination" field.';

-- Recreate the function for domainsVirtual with renderMode + host fields
CREATE
OR REPLACE FUNCTION "latestBuildVirtual"("domainsVirtual") RETURNS SETOF "latestBuildVirtual" ROWS 1 AS $$
SELECT
  b.id AS "buildId",
  b."projectId",
  '' as "domainsVirtualId",
  d."domain",
  b."createdAt",
  b."publishStatus",
  b."updatedAt",
  (b.deployment :: jsonb ->> 'renderMode') AS "renderMode",
  (b.deployment :: jsonb ->> 'host') AS "host"
FROM
  "Build" b
  JOIN "Domain" d ON d.id = $1."domainId"
WHERE
  b."projectId" = $1."projectId"
  AND b.deployment IS NOT NULL
  AND (b.deployment :: jsonb -> 'domains') @> to_jsonb(array [d.domain])
ORDER BY
  b."createdAt" DESC
LIMIT
  1;

$$ STABLE LANGUAGE sql;

COMMENT ON FUNCTION "latestBuildVirtual"("domainsVirtual") IS 'Returns the latest build for a given project and domain as a computed field for PostgREST.';

-- Update latestProjectDomainBuildVirtual function to include renderMode + host
CREATE
OR REPLACE FUNCTION "latestProjectDomainBuildVirtual"("Project") RETURNS SETOF "latestBuildVirtual" ROWS 1 AS $$
SELECT
  b.id AS "buildId",
  b."projectId",
  '' as "domainsVirtualId",
  p.domain AS "domain",
  b."createdAt",
  b."publishStatus",
  b."updatedAt",
  (b.deployment :: jsonb ->> 'renderMode') AS "renderMode",
  (b.deployment :: jsonb ->> 'host') AS "host"
FROM
  "Build" b
  JOIN "Project" p ON b."projectId" = p.id
  LEFT JOIN "ProjectDomain" pd ON pd."projectId" = p.id
WHERE
  b."projectId" = $1.id
  AND b.deployment IS NOT NULL
  AND (
    (b.deployment :: jsonb ->> 'destination') IS NULL
    OR (b.deployment :: jsonb ->> 'destination') = 'saas'
  )
  AND (
    (b.deployment :: jsonb ->> 'projectDomain') = p.domain
    OR (b.deployment :: jsonb -> 'domains') @> to_jsonb(array [p.domain])
  )
ORDER BY
  b."createdAt" DESC
LIMIT
  1;

$$ STABLE LANGUAGE sql;

COMMENT ON FUNCTION "latestProjectDomainBuildVirtual"("Project") IS 'This function computes the latest build for a project domain, ensuring it is a production (non-static) build, where the domain matches either the Project.domain field or exists in the related Domain table. It provides backward compatibility for older records with a missing "destination" field.';

-- Recreate the DashboardProject wrapper function — picks up renderMode + host
-- automatically via SELECT *, no logic change needed.
CREATE
OR REPLACE FUNCTION "latestBuildVirtual"("DashboardProject") RETURNS SETOF "latestBuildVirtual" ROWS 1 AS $$
SELECT
  *
FROM
  "latestBuildVirtual"(ROW($1.id, $1.title, $1.domain, $1."userId", $1."isDeleted", $1."createdAt", $1."previewImageAssetId", $1."marketplaceApprovalStatus", $1.tags, $1."workspaceId")::"Project");

$$ STABLE LANGUAGE sql;

COMMENT ON FUNCTION "latestBuildVirtual"("DashboardProject") IS 'Wrapper function to make latestBuildVirtual work with DashboardProject view for PostgREST computed fields.';

-- Grant execute permissions to all PostgREST roles
DO $$
DECLARE
  role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION "latestBuildVirtual"("DashboardProject") TO %I', role_name);
    END IF;
  END LOOP;
END $$;
