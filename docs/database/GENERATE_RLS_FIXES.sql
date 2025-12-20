-- ============================================================================
-- GENERATE RLS POLICY OPTIMIZATION FIXES
-- ============================================================================
-- Run these queries in Supabase SQL Editor to generate fix commands
-- ============================================================================

-- ============================================================================
-- STEP 1: Find all policies that need fixing
-- ============================================================================
SELECT 
  tablename,
  policyname,
  cmd as operation,
  qual as using_clause,
  with_check as check_clause
FROM pg_policies 
WHERE schemaname = 'public'
AND (
  qual::text LIKE '%auth.uid()%' 
  OR qual::text LIKE '%auth.role()%'
  OR with_check::text LIKE '%auth.uid()%'
  OR with_check::text LIKE '%auth.role()%'
)
ORDER BY tablename, policyname;


-- ============================================================================
-- STEP 2: Generate DROP and CREATE statements for USING clause policies
-- ============================================================================
SELECT 
  '-- ' || tablename || '.' || policyname AS comment,
  'DROP POLICY IF EXISTS "' || policyname || '" ON public.' || tablename || ';' AS step1_drop,
  'CREATE POLICY "' || policyname || '" ON public.' || tablename || 
  ' FOR ' || cmd || 
  ' USING (' || 
  REPLACE(
    REPLACE(qual::text, 'auth.uid()', '(SELECT auth.uid())'),
    'auth.role()', '(SELECT auth.role())'
  ) || ');' AS step2_create
FROM pg_policies 
WHERE schemaname = 'public'
AND qual IS NOT NULL
AND with_check IS NULL
AND (qual::text LIKE '%auth.uid()%' OR qual::text LIKE '%auth.role()%')
ORDER BY tablename, policyname;


-- ============================================================================
-- STEP 3: Generate statements for policies with BOTH USING and WITH CHECK
-- ============================================================================
SELECT 
  '-- ' || tablename || '.' || policyname AS comment,
  'DROP POLICY IF EXISTS "' || policyname || '" ON public.' || tablename || ';' AS step1_drop,
  'CREATE POLICY "' || policyname || '" ON public.' || tablename || 
  ' FOR ' || cmd || 
  ' USING (' || 
  REPLACE(
    REPLACE(qual::text, 'auth.uid()', '(SELECT auth.uid())'),
    'auth.role()', '(SELECT auth.role())'
  ) || ')' ||
  ' WITH CHECK (' ||
  REPLACE(
    REPLACE(with_check::text, 'auth.uid()', '(SELECT auth.uid())'),
    'auth.role()', '(SELECT auth.role())'
  ) || ');' AS step2_create
FROM pg_policies 
WHERE schemaname = 'public'
AND qual IS NOT NULL
AND with_check IS NOT NULL
AND (
  qual::text LIKE '%auth.uid()%' 
  OR qual::text LIKE '%auth.role()%'
  OR with_check::text LIKE '%auth.uid()%'
  OR with_check::text LIKE '%auth.role()%'
)
ORDER BY tablename, policyname;


-- ============================================================================
-- STEP 4: Generate statements for policies with ONLY WITH CHECK (INSERT)
-- ============================================================================
SELECT 
  '-- ' || tablename || '.' || policyname AS comment,
  'DROP POLICY IF EXISTS "' || policyname || '" ON public.' || tablename || ';' AS step1_drop,
  'CREATE POLICY "' || policyname || '" ON public.' || tablename || 
  ' FOR ' || cmd || 
  ' WITH CHECK (' ||
  REPLACE(
    REPLACE(with_check::text, 'auth.uid()', '(SELECT auth.uid())'),
    'auth.role()', '(SELECT auth.role())'
  ) || ');' AS step2_create
FROM pg_policies 
WHERE schemaname = 'public'
AND qual IS NULL
AND with_check IS NOT NULL
AND (with_check::text LIKE '%auth.uid()%' OR with_check::text LIKE '%auth.role()%')
ORDER BY tablename, policyname;


-- ============================================================================
-- STEP 5: Verification - Count remaining unoptimized policies
-- ============================================================================
SELECT 
  COUNT(*) as unoptimized_policies
FROM pg_policies 
WHERE schemaname = 'public'
AND (
  (qual::text LIKE '%auth.uid()%' AND qual::text NOT LIKE '%(SELECT auth.uid())%')
  OR (qual::text LIKE '%auth.role()%' AND qual::text NOT LIKE '%(SELECT auth.role())%')
  OR (with_check::text LIKE '%auth.uid()%' AND with_check::text NOT LIKE '%(SELECT auth.uid())%')
  OR (with_check::text LIKE '%auth.role()%' AND with_check::text NOT LIKE '%(SELECT auth.role())%')
);
