BEGIN;
SET LOCAL search_path = pgtap, public;
SELECT no_plan();

-- =========================================
-- Setup: Create test data
-- =========================================

INSERT INTO "public"."User" ("id", "createdAt", "email", "username")
VALUES ('user1', '2023-01-01 00:00:00+00', 'user1@test.com', 'user1');

INSERT INTO "public"."Project" ("id", "title", "domain", "userId", "isDeleted", "createdAt")
VALUES
  ('project1', 'Project One', 'project1-domain', 'user1', false, '2023-01-01 00:00:00+00'),
  ('project2', 'Project Two', 'project2-domain', 'user1', false, '2023-01-01 00:00:00+00');

-- Insert development builds (deployment IS NULL) — should NEVER be cleaned
INSERT INTO "public"."Build" (
    "id", "createdAt", "projectId", "deployment", "publishStatus",
    "pages", "breakpoints", "styles", "styleSources", "styleSourceSelections",
    "props", "dataSources", "resources", "instances", "marketplaceProduct", "projectSettings"
)
VALUES
  ('project1-dev', '2023-01-01 00:00:00+00', 'project1', NULL, 'PENDING',
   '{"page":"content"}', '["bp1"]', '["style1"]', '["src1"]', '["sel1"]',
   '["prop1"]', '["ds1"]', '["res1"]', '["inst1"]', '{"prod":1}', '{"meta":{"key":"val"},"compiler":{}}');

-- Insert published builds for project1 (10 builds, keep=5 → oldest 5 cleaned)
-- Timestamps spaced so order is deterministic
INSERT INTO "public"."Build" (
    "id", "createdAt", "projectId", "deployment", "publishStatus",
    "pages", "breakpoints", "styles", "styleSources", "styleSourceSelections",
    "props", "dataSources", "resources", "instances", "marketplaceProduct", "projectSettings"
)
VALUES
  ('project1-pub-1', '2023-01-01 10:00:00+00', 'project1', '{"domains":["example.com"]}', 'PUBLISHED',
   '{"p":1}', '["bp"]', '["s"]', '["src"]', '["sel"]', '["p"]', '["d"]', '["r"]', '["i"]', '{"m":1}', '{"meta":{},"compiler":{}}'),
  ('project1-pub-2', '2023-01-02 10:00:00+00', 'project1', '{"domains":["example.com"]}', 'PUBLISHED',
   '{"p":2}', '["bp"]', '["s"]', '["src"]', '["sel"]', '["p"]', '["d"]', '["r"]', '["i"]', '{"m":2}', '{"meta":{},"compiler":{}}'),
  ('project1-pub-3', '2023-01-03 10:00:00+00', 'project1', '{"domains":["example.com"]}', 'PUBLISHED',
   '{"p":3}', '["bp"]', '["s"]', '["src"]', '["sel"]', '["p"]', '["d"]', '["r"]', '["i"]', '{"m":3}', '{"meta":{},"compiler":{}}'),
  ('project1-pub-4', '2023-01-04 10:00:00+00', 'project1', '{"domains":["example.com"]}', 'PUBLISHED',
   '{"p":4}', '["bp"]', '["s"]', '["src"]', '["sel"]', '["p"]', '["d"]', '["r"]', '["i"]', '{"m":4}', '{"meta":{},"compiler":{}}'),
  ('project1-pub-5', '2023-01-05 10:00:00+00', 'project1', '{"domains":["example.com"]}', 'PUBLISHED',
   '{"p":5}', '["bp"]', '["s"]', '["src"]', '["sel"]', '["p"]', '["d"]', '["r"]', '["i"]', '{"m":5}', '{"meta":{},"compiler":{}}'),
  ('project1-pub-6', '2023-01-06 10:00:00+00', 'project1', '{"domains":["example.com"]}', 'PUBLISHED',
   '{"p":6}', '["bp"]', '["s"]', '["src"]', '["sel"]', '["p"]', '["d"]', '["r"]', '["i"]', '{"m":6}', '{"meta":{},"compiler":{}}'),
  ('project1-pub-7', '2023-01-07 10:00:00+00', 'project1', '{"domains":["example.com"]}', 'PUBLISHED',
   '{"p":7}', '["bp"]', '["s"]', '["src"]', '["sel"]', '["p"]', '["d"]', '["r"]', '["i"]', '{"m":7}', '{"meta":{},"compiler":{}}'),
  ('project1-pub-8', '2023-01-08 10:00:00+00', 'project1', '{"domains":["example.com"]}', 'PUBLISHED',
   '{"p":8}', '["bp"]', '["s"]', '["src"]', '["sel"]', '["p"]', '["d"]', '["r"]', '["i"]', '{"m":8}', '{"meta":{},"compiler":{}}'),
  ('project1-pub-9', '2023-01-09 10:00:00+00', 'project1', '{"domains":["example.com"]}', 'PUBLISHED',
   '{"p":9}', '["bp"]', '["s"]', '["src"]', '["sel"]', '["p"]', '["d"]', '["r"]', '["i"]', '{"m":9}', '{"meta":{},"compiler":{}}'),
  ('project1-pub-10', '2023-01-10 10:00:00+00', 'project1', '{"domains":["example.com"]}', 'PUBLISHED',
   '{"p":10}', '["bp"]', '["s"]', '["src"]', '["sel"]', '["p"]', '["d"]', '["r"]', '["i"]', '{"m":10}', '{"meta":{},"compiler":{}}');

-- =========================================
-- Test 1: Keep=5, oldest 5 builds are cleaned
-- =========================================

SELECT cleanup_project_backups('project1', 5);

SELECT is(
  (SELECT count(*)::integer FROM "Build" WHERE "projectId" = 'project1' AND "isCleaned" = true),
  5,
  'Test 1: Exactly 5 published builds should be cleaned (keep=5, 10 total)'
);

-- Verify the 5 oldest are cleaned
SELECT results_eq(
  $$
    SELECT id FROM "Build"
    WHERE "projectId" = 'project1' AND "isCleaned" = true
    ORDER BY id
  $$,
  $$
    SELECT * FROM (
      VALUES
        ('project1-pub-1'), ('project1-pub-2'), ('project1-pub-3'),
        ('project1-pub-4'), ('project1-pub-5')
    ) AS expected(id)
    ORDER BY id
  $$,
  'Test 1: The 5 oldest builds should be marked as cleaned'
);

-- Verify 5 newest are NOT cleaned
SELECT results_eq(
  $$
    SELECT id FROM "Build"
    WHERE "projectId" = 'project1' AND "isCleaned" = false AND deployment IS NOT NULL
    ORDER BY id
  $$,
  $$
    SELECT * FROM (
      VALUES
        ('project1-pub-6'), ('project1-pub-7'), ('project1-pub-8'),
        ('project1-pub-9'), ('project1-pub-10')
    ) AS expected(id)
    ORDER BY id
  $$,
  'Test 1: The 5 newest builds should remain uncleaned'
);

-- =========================================
-- Test 2: Content columns are emptied (not just flag set)
-- =========================================

SELECT is(
  (SELECT "pages" FROM "Build" WHERE id = 'project1-pub-1')::text,
  '{}',
  'Test 2: pages column should be empty for cleaned build'
);

SELECT is(
  (SELECT "props" FROM "Build" WHERE id = 'project1-pub-1')::text,
  '[]',
  'Test 2: props column should be empty for cleaned build'
);

SELECT is(
  (SELECT "instances" FROM "Build" WHERE id = 'project1-pub-1')::text,
  '[]',
  'Test 2: instances column should be empty for cleaned build'
);

SELECT is(
  (SELECT "marketplaceProduct" FROM "Build" WHERE id = 'project1-pub-1')::text,
  '{}',
  'Test 2: marketplaceProduct should be empty for cleaned build'
);

-- Verify development build content is NOT touched
SELECT is(
  (SELECT "pages" FROM "Build" WHERE id = 'project1-dev')::text,
  '{"page":"content"}',
  'Test 2: Dev build pages should be untouched'
);

SELECT is(
  (SELECT "props" FROM "Build" WHERE id = 'project1-dev')::text,
  '["prop1"]',
  'Test 2: Dev build props should be untouched'
);

-- =========================================
-- Test 3: keep=0 (unlimited) returns 0, doesn't clean
-- =========================================

SELECT cleanup_project_backups('project2', 0);

SELECT is(
  (SELECT count(*)::integer FROM "Build" WHERE "projectId" = 'project2' AND "isCleaned" = true),
  0,
  'Test 3: With keep=0 (unlimited), no builds should be cleaned'
);

-- =========================================
-- Test 4: Calling again doesn't re-clean already cleaned builds
-- =========================================

-- Call again on project1
SELECT cleanup_project_backups('project1', 5);

SELECT is(
  (SELECT count(*)::integer FROM "Build" WHERE "projectId" = 'project1' AND "isCleaned" = true),
  5,
  'Test 4: Calling cleanup again should not increase cleaned count (already cleaned builds ignored)'
);

-- =========================================
-- Finish tests
-- =========================================

SELECT finish();
ROLLBACK;
