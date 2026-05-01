-- ============================================================
-- PACT Revised Organizational Hierarchy — Department Seed
-- Run this in: Supabase Dashboard → SQL Editor
-- Based on: PACT_revised_Hierarchy_vr1
-- 24 departments total: 9 top-level + 15 sub-departments
-- ============================================================

DO $$
DECLARE
  id_strategy   uuid;
  id_bizdev     uuid;
  id_consulting uuid;
  id_data       uuid;
  id_ict        uuid;
  id_finance    uuid;
  id_corporate  uuid;
  id_me_qa      uuid;
  id_head_ops   uuid;
BEGIN

  -- ── 1. TOP-LEVEL DEPARTMENTS (reporting to CSO) ───────────

  INSERT INTO departments (name, description, color, parent_department_id)
    VALUES ('Strategy / Research & Innovation',
            'Strategic planning, research, and organizational innovation',
            '#2563EB', NULL)
    RETURNING id INTO id_strategy;

  INSERT INTO departments (name, description, color, parent_department_id)
    VALUES ('Business Development & Partnerships',
            'External partnerships, donor relations, and new business opportunities',
            '#7C3AED', NULL)
    RETURNING id INTO id_bizdev;

  INSERT INTO departments (name, description, color, parent_department_id)
    VALUES ('Consulting Projects',
            'Consulting engagements and project delivery for external clients',
            '#059669', NULL)
    RETURNING id INTO id_consulting;

  INSERT INTO departments (name, description, color, parent_department_id)
    VALUES ('Data Acquisition & Knowledge Management',
            'Data collection pipelines, knowledge bases, and information systems',
            '#0891B2', NULL)
    RETURNING id INTO id_data;

  INSERT INTO departments (name, description, color, parent_department_id)
    VALUES ('ICT / CTO',
            'Information & communications technology infrastructure and digital systems',
            '#1D3461', NULL)
    RETURNING id INTO id_ict;

  INSERT INTO departments (name, description, color, parent_department_id)
    VALUES ('Finance',
            'Independent finance department — accounting, budgeting, and financial review',
            '#D97706', NULL)
    RETURNING id INTO id_finance;

  INSERT INTO departments (name, description, color, parent_department_id)
    VALUES ('Corporate Services',
            'Procurement, legal, audit, and administrative corporate support functions',
            '#BE185D', NULL)
    RETURNING id INTO id_corporate;

  INSERT INTO departments (name, description, color, parent_department_id)
    VALUES ('M&E + Quality Assurance',
            'Monitoring, evaluation, learning, and quality assurance (merged function)',
            '#DC2626', NULL)
    RETURNING id INTO id_me_qa;

  INSERT INTO departments (name, description, color, parent_department_id)
    VALUES ('Head of Operations & Programmes',
            'Operations, programmes, HR, risk management, and project coordination',
            '#1D3461', NULL)
    RETURNING id INTO id_head_ops;

  -- ── 2. SUB-DEPARTMENTS UNDER FINANCE ─────────────────────

  INSERT INTO departments (name, description, color, parent_department_id)
    VALUES ('Finance & Accounting',
            'Financial accounting, reporting, and compliance',
            '#D97706', id_finance);

  INSERT INTO departments (name, description, color, parent_department_id)
    VALUES ('Budgeting / Cash Flow',
            'Budget planning, cash flow management, and forecasting',
            '#D97706', id_finance);

  INSERT INTO departments (name, description, color, parent_department_id)
    VALUES ('Project Financial Review',
            'Project-level financial monitoring and review',
            '#D97706', id_finance);

  -- ── 3. SUB-DEPARTMENTS UNDER CORPORATE SERVICES ──────────

  INSERT INTO departments (name, description, color, parent_department_id)
    VALUES ('Procurement & Asset Management',
            'Procurement processes and organisational asset tracking',
            '#BE185D', id_corporate);

  INSERT INTO departments (name, description, color, parent_department_id)
    VALUES ('Legal & Audit',
            'Legal affairs, internal audit, and regulatory compliance',
            '#BE185D', id_corporate);

  INSERT INTO departments (name, description, color, parent_department_id)
    VALUES ('Administration / Corporate Support',
            'Administrative operations and corporate support services',
            '#BE185D', id_corporate);

  -- ── 4. SUB-DEPARTMENTS UNDER M&E + QUALITY ASSURANCE ─────

  INSERT INTO departments (name, description, color, parent_department_id)
    VALUES ('Monitoring, Evaluation & Learning',
            'Programme monitoring, evaluation frameworks, and learning systems',
            '#DC2626', id_me_qa);

  INSERT INTO departments (name, description, color, parent_department_id)
    VALUES ('Quality Standards / Assurance',
            'Quality standards development and assurance processes',
            '#DC2626', id_me_qa);

  INSERT INTO departments (name, description, color, parent_department_id)
    VALUES ('Reporting Quality & Learning Support',
            'Reporting quality control and learning support functions',
            '#DC2626', id_me_qa);

  -- ── 5. SUB-DEPARTMENTS UNDER HEAD OF OPERATIONS & PROGRAMMES

  INSERT INTO departments (name, description, color, parent_department_id)
    VALUES ('Operations',
            'Field and organisational operational management',
            '#1D3461', id_head_ops);

  INSERT INTO departments (name, description, color, parent_department_id)
    VALUES ('Programmes',
            'Programme design, management, and delivery',
            '#1D3461', id_head_ops);

  INSERT INTO departments (name, description, color, parent_department_id)
    VALUES ('Human Resources / People Support',
            'HR management, recruitment, and people support services',
            '#1D3461', id_head_ops);

  INSERT INTO departments (name, description, color, parent_department_id)
    VALUES ('Risk & Controls',
            'Organisational risk management and internal controls',
            '#1D3461', id_head_ops);

  INSERT INTO departments (name, description, color, parent_department_id)
    VALUES ('Project / Process Coordination',
            'Cross-project coordination and process improvement',
            '#1D3461', id_head_ops);

  RAISE NOTICE 'PACT department hierarchy inserted: 9 top-level + 15 sub-departments = 24 total';
END $$;
