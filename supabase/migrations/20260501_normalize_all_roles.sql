-- ============================================================
-- Normalize all role values → canonical camelCase codes
-- Run in: Supabase Dashboard → SQL Editor
-- Converts all legacy/mixed-case variants to canonical format
-- ============================================================

DO $$
DECLARE
  r RECORD;
  total_updated integer := 0;
  batch_count   integer;
BEGIN

  -- ── superAdmin ────────────────────────────────────────────
  UPDATE profiles SET role = 'superAdmin'
  WHERE role IN ('SuperAdmin', 'super_admin', 'Super Admin')
    AND role != 'superAdmin';
  GET DIAGNOSTICS batch_count = ROW_COUNT;
  total_updated := total_updated + batch_count;
  IF batch_count > 0 THEN
    RAISE NOTICE '✓ superAdmin          — normalized % row(s)', batch_count;
  END IF;

  -- ── admin ─────────────────────────────────────────────────
  UPDATE profiles SET role = 'admin'
  WHERE role IN ('Admin')
    AND role != 'admin';
  GET DIAGNOSTICS batch_count = ROW_COUNT;
  total_updated := total_updated + batch_count;
  IF batch_count > 0 THEN
    RAISE NOTICE '✓ admin               — normalized % row(s)', batch_count;
  END IF;

  -- ── countryDirector ───────────────────────────────────────
  UPDATE profiles SET role = 'countryDirector'
  WHERE role IN ('CountryDirector', 'country_director', 'Country Director')
    AND role != 'countryDirector';
  GET DIAGNOSTICS batch_count = ROW_COUNT;
  total_updated := total_updated + batch_count;
  IF batch_count > 0 THEN
    RAISE NOTICE '✓ countryDirector     — normalized % row(s)', batch_count;
  END IF;

  -- ── ict ───────────────────────────────────────────────────
  UPDATE profiles SET role = 'ict'
  WHERE role IN ('ICT')
    AND role != 'ict';
  GET DIAGNOSTICS batch_count = ROW_COUNT;
  total_updated := total_updated + batch_count;
  IF batch_count > 0 THEN
    RAISE NOTICE '✓ ict                 — normalized % row(s)', batch_count;
  END IF;

  -- ── fom ───────────────────────────────────────────────────
  UPDATE profiles SET role = 'fom'
  WHERE role IN ('Field Operation Manager (FOM)', 'fieldOpManager', 'FOM')
    AND role != 'fom';
  GET DIAGNOSTICS batch_count = ROW_COUNT;
  total_updated := total_updated + batch_count;
  IF batch_count > 0 THEN
    RAISE NOTICE '✓ fom                 — normalized % row(s)', batch_count;
  END IF;

  -- ── financialAdmin ────────────────────────────────────────
  UPDATE profiles SET role = 'financialAdmin'
  WHERE role IN ('FinancialAdmin', 'financial_admin', 'Financial Admin', 'Finance')
    AND role != 'financialAdmin';
  GET DIAGNOSTICS batch_count = ROW_COUNT;
  total_updated := total_updated + batch_count;
  IF batch_count > 0 THEN
    RAISE NOTICE '✓ financialAdmin      — normalized % row(s)', batch_count;
  END IF;

  -- ── projectManager ────────────────────────────────────────
  UPDATE profiles SET role = 'projectManager'
  WHERE role IN ('ProjectManager', 'project_manager', 'Project Manager')
    AND role != 'projectManager';
  GET DIAGNOSTICS batch_count = ROW_COUNT;
  total_updated := total_updated + batch_count;
  IF batch_count > 0 THEN
    RAISE NOTICE '✓ projectManager      — normalized % row(s)', batch_count;
  END IF;

  -- ── seniorOperationsLead ──────────────────────────────────
  UPDATE profiles SET role = 'seniorOperationsLead'
  WHERE role IN ('SeniorOperationsLead', 'senior_operations_lead', 'Senior Operations Lead')
    AND role != 'seniorOperationsLead';
  GET DIAGNOSTICS batch_count = ROW_COUNT;
  total_updated := total_updated + batch_count;
  IF batch_count > 0 THEN
    RAISE NOTICE '✓ seniorOperationsLead — normalized % row(s)', batch_count;
  END IF;

  -- ── supervisor ────────────────────────────────────────────
  UPDATE profiles SET role = 'supervisor'
  WHERE role IN ('Supervisor')
    AND role != 'supervisor';
  GET DIAGNOSTICS batch_count = ROW_COUNT;
  total_updated := total_updated + batch_count;
  IF batch_count > 0 THEN
    RAISE NOTICE '✓ supervisor          — normalized % row(s)', batch_count;
  END IF;

  -- ── coordinator ───────────────────────────────────────────
  UPDATE profiles SET role = 'coordinator'
  WHERE role IN ('Coordinator')
    AND role != 'coordinator';
  GET DIAGNOSTICS batch_count = ROW_COUNT;
  total_updated := total_updated + batch_count;
  IF batch_count > 0 THEN
    RAISE NOTICE '✓ coordinator         — normalized % row(s)', batch_count;
  END IF;

  -- ── dataTeam ──────────────────────────────────────────────
  UPDATE profiles SET role = 'dataTeam'
  WHERE role IN ('DataTeam', 'data_team', 'Data Team')
    AND role != 'dataTeam';
  GET DIAGNOSTICS batch_count = ROW_COUNT;
  total_updated := total_updated + batch_count;
  IF batch_count > 0 THEN
    RAISE NOTICE '✓ dataTeam            — normalized % row(s)', batch_count;
  END IF;

  -- ── dataCollector ─────────────────────────────────────────
  UPDATE profiles SET role = 'dataCollector'
  WHERE role IN ('DataCollector', 'data_collector', 'Data Collector', 'datacollector')
    AND role != 'dataCollector';
  GET DIAGNOSTICS batch_count = ROW_COUNT;
  total_updated := total_updated + batch_count;
  IF batch_count > 0 THEN
    RAISE NOTICE '✓ dataCollector       — normalized % row(s)', batch_count;
  END IF;

  -- ── reviewer ──────────────────────────────────────────────
  UPDATE profiles SET role = 'reviewer'
  WHERE role IN ('Reviewer')
    AND role != 'reviewer';
  GET DIAGNOSTICS batch_count = ROW_COUNT;
  total_updated := total_updated + batch_count;
  IF batch_count > 0 THEN
    RAISE NOTICE '✓ reviewer            — normalized % row(s)', batch_count;
  END IF;

  -- ── employee ──────────────────────────────────────────────
  UPDATE profiles SET role = 'employee'
  WHERE role IN ('Employee')
    AND role != 'employee';
  GET DIAGNOSTICS batch_count = ROW_COUNT;
  total_updated := total_updated + batch_count;
  IF batch_count > 0 THEN
    RAISE NOTICE '✓ employee            — normalized % row(s)', batch_count;
  END IF;

  -- ── hr ────────────────────────────────────────────────────
  UPDATE profiles SET role = 'hr'
  WHERE role IN ('HR', 'human_resources', 'humanResources', 'Human Resources')
    AND role != 'hr';
  GET DIAGNOSTICS batch_count = ROW_COUNT;
  total_updated := total_updated + batch_count;
  IF batch_count > 0 THEN
    RAISE NOTICE '✓ hr                  — normalized % row(s)', batch_count;
  END IF;

  -- ── hrManager ─────────────────────────────────────────────
  UPDATE profiles SET role = 'hrManager'
  WHERE role IN ('HRManager', 'hr_manager', 'HR Manager', 'HR_Manager')
    AND role != 'hrManager';
  GET DIAGNOSTICS batch_count = ROW_COUNT;
  total_updated := total_updated + batch_count;
  IF batch_count > 0 THEN
    RAISE NOTICE '✓ hrManager           — normalized % row(s)', batch_count;
  END IF;

  -- ── Final summary ─────────────────────────────────────────
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'Role normalization complete — % profile(s) updated', total_updated;

END $$;
