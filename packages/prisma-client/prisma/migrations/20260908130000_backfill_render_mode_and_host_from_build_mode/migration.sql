-- Follow-up to 20260908120000: derive `renderMode` / `host` from the pre-split
-- `buildMode` for builds published before that migration, so the Publish
-- dialog's "DNS may be stale" warning works on existing deployments without a
-- republish.
--
--   buildMode 'cloudflare' -> renderMode 'ssg',  host 'cloudflare'
--   buildMode 'ssg'        -> renderMode 'ssg',  host 'local'
--   buildMode 'ssr'        -> renderMode 'ssr',  host 'local'
--
-- CREATE OR REPLACE only — no table change, existing grants are kept.

CREATE
OR REPLACE FUNCTION "latestBuildVirtual"("Project") RETURNS SETOF "latestBuildVirtual" ROWS 1 AS $$
SELECT
  b.id AS "buildId",
  b."projectId",
  '' as "domainsVirtualId",
  CASE
    WHEN (b.deployment :: jsonb ->> 'projectDomain') = p.domain
    OR (b.deployment :: jsonb -> 'domains') @> to_jsonb(array [p.domain]) THEN p.domain
    ELSE d.domain
  END AS "domain",
  b."createdAt",
  b."publishStatus",
  b."updatedAt",
  COALESCE(
    b.deployment :: jsonb ->> 'renderMode',
    CASE b.deployment :: jsonb ->> 'buildMode'
      WHEN 'ssg' THEN 'ssg'
      WHEN 'ssr' THEN 'ssr'
      WHEN 'cloudflare' THEN 'ssg'
    END
  ) AS "renderMode",
  COALESCE(
    b.deployment :: jsonb ->> 'host',
    CASE b.deployment :: jsonb ->> 'buildMode'
      WHEN 'cloudflare' THEN 'cloudflare'
      WHEN 'ssg' THEN 'local'
      WHEN 'ssr' THEN 'local'
    END
  ) AS "host"
FROM
  "Build" b
  JOIN "Project" p ON b."projectId" = p.id
  LEFT JOIN "ProjectDomain" pd ON pd."projectId" = p.id
  LEFT JOIN "Domain" d ON d.id = pd."domainId"
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
    OR (b.deployment :: jsonb -> 'domains') @> to_jsonb(array [d.domain])
  )
ORDER BY
  b."createdAt" DESC
LIMIT
  1;

$$ STABLE LANGUAGE sql;

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
  COALESCE(
    b.deployment :: jsonb ->> 'renderMode',
    CASE b.deployment :: jsonb ->> 'buildMode'
      WHEN 'ssg' THEN 'ssg'
      WHEN 'ssr' THEN 'ssr'
      WHEN 'cloudflare' THEN 'ssg'
    END
  ) AS "renderMode",
  COALESCE(
    b.deployment :: jsonb ->> 'host',
    CASE b.deployment :: jsonb ->> 'buildMode'
      WHEN 'cloudflare' THEN 'cloudflare'
      WHEN 'ssg' THEN 'local'
      WHEN 'ssr' THEN 'local'
    END
  ) AS "host"
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
  COALESCE(
    b.deployment :: jsonb ->> 'renderMode',
    CASE b.deployment :: jsonb ->> 'buildMode'
      WHEN 'ssg' THEN 'ssg'
      WHEN 'ssr' THEN 'ssr'
      WHEN 'cloudflare' THEN 'ssg'
    END
  ) AS "renderMode",
  COALESCE(
    b.deployment :: jsonb ->> 'host',
    CASE b.deployment :: jsonb ->> 'buildMode'
      WHEN 'cloudflare' THEN 'cloudflare'
      WHEN 'ssg' THEN 'local'
      WHEN 'ssr' THEN 'local'
    END
  ) AS "host"
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
