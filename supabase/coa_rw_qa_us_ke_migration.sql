-- ============================================================
-- PACT Command Center — COA Seed for Rwanda, Qatar, USA, Kenya
-- Apply in Supabase SQL editor (safe to run multiple times)
-- ============================================================

-- ─── 0. Ensure countries exist ───────────────────────────────
INSERT INTO countries (code, name_en, name_ar, currency_code, currency_symbol, flag_emoji)
VALUES
  ('RW', 'Rwanda',       'رواندا',        'RWF', 'RWF', '🇷🇼'),
  ('QA', 'Qatar',        'قطر',           'QAR', 'QAR', '🇶🇦'),
  ('US', 'United States','الولايات المتحدة','USD', '$',   '🇺🇸')
ON CONFLICT (code) DO NOTHING;

-- Kenya is already seeded (code = 'KE'), no action needed.

-- ─── 1. Extend the acct_account_subtype enum ─────────────────
-- The base enum has 13 values; we add richer COA-specific labels.
-- ADD VALUE IF NOT EXISTS is idempotent — safe to run again.
ALTER TYPE acct_account_subtype ADD VALUE IF NOT EXISTS 'header';
ALTER TYPE acct_account_subtype ADD VALUE IF NOT EXISTS 'fixed_asset';
ALTER TYPE acct_account_subtype ADD VALUE IF NOT EXISTS 'other_asset';
ALTER TYPE acct_account_subtype ADD VALUE IF NOT EXISTS 'investment';
ALTER TYPE acct_account_subtype ADD VALUE IF NOT EXISTS 'grant';
ALTER TYPE acct_account_subtype ADD VALUE IF NOT EXISTS 'other_income';
ALTER TYPE acct_account_subtype ADD VALUE IF NOT EXISTS 'personnel';
ALTER TYPE acct_account_subtype ADD VALUE IF NOT EXISTS 'travel';
ALTER TYPE acct_account_subtype ADD VALUE IF NOT EXISTS 'program';
ALTER TYPE acct_account_subtype ADD VALUE IF NOT EXISTS 'admin';
ALTER TYPE acct_account_subtype ADD VALUE IF NOT EXISTS 'supplies';
ALTER TYPE acct_account_subtype ADD VALUE IF NOT EXISTS 'indirect';
ALTER TYPE acct_account_subtype ADD VALUE IF NOT EXISTS 'unrestricted';
ALTER TYPE acct_account_subtype ADD VALUE IF NOT EXISTS 'restricted';
ALTER TYPE acct_account_subtype ADD VALUE IF NOT EXISTS 'retained_earnings';

-- ============================================================
-- HELPER: insert parent then children using CTEs
-- We use a DO block so we can reference UUIDs by variable name.
-- ============================================================
DO $$
DECLARE
  -- country ids
  id_rw UUID;
  id_qa UUID;
  id_us UUID;
  id_ke UUID;

  -- ── RWANDA parent ids ─────────────────────────────────────
  rw_1000 UUID; rw_2000 UUID; rw_3000 UUID; rw_4000 UUID; rw_5000 UUID;
  rw_1100 UUID; rw_1200 UUID; rw_1300 UUID; rw_1400 UUID; rw_1500 UUID;
  rw_2100 UUID; rw_2200 UUID; rw_2300 UUID;
  rw_4100 UUID; rw_4200 UUID;
  rw_5100 UUID; rw_5200 UUID; rw_5300 UUID; rw_5400 UUID; rw_5500 UUID; rw_5600 UUID;

  -- ── QATAR parent ids ──────────────────────────────────────
  qa_1000 UUID; qa_2000 UUID; qa_3000 UUID; qa_4000 UUID; qa_5000 UUID;
  qa_1100 UUID; qa_1200 UUID; qa_1300 UUID; qa_1400 UUID;
  qa_2100 UUID; qa_2200 UUID;
  qa_4100 UUID; qa_4200 UUID;
  qa_5100 UUID; qa_5200 UUID; qa_5300 UUID; qa_5400 UUID; qa_5500 UUID;

  -- ── USA parent ids ────────────────────────────────────────
  us_1000 UUID; us_2000 UUID; us_3000 UUID; us_4000 UUID; us_5000 UUID;
  us_1100 UUID; us_1200 UUID; us_1300 UUID; us_1400 UUID; us_1500 UUID;
  us_2100 UUID; us_2200 UUID; us_2300 UUID;
  us_4100 UUID; us_4200 UUID; us_4300 UUID;
  us_5100 UUID; us_5200 UUID; us_5300 UUID; us_5400 UUID; us_5500 UUID; us_5600 UUID;

  -- ── KENYA parent ids ──────────────────────────────────────
  ke_1000 UUID; ke_2000 UUID; ke_3000 UUID; ke_4000 UUID; ke_5000 UUID;
  ke_1100 UUID; ke_1200 UUID; ke_1300 UUID; ke_1400 UUID; ke_1500 UUID;
  ke_2100 UUID; ke_2200 UUID; ke_2300 UUID;
  ke_4100 UUID; ke_4200 UUID;
  ke_5100 UUID; ke_5200 UUID; ke_5300 UUID; ke_5400 UUID; ke_5500 UUID; ke_5600 UUID;

BEGIN
  -- Resolve country UUIDs
  SELECT id INTO id_rw FROM countries WHERE code = 'RW' LIMIT 1;
  SELECT id INTO id_qa FROM countries WHERE code = 'QA' LIMIT 1;
  SELECT id INTO id_us FROM countries WHERE code = 'US' LIMIT 1;
  SELECT id INTO id_ke FROM countries WHERE code = 'KE' LIMIT 1;

  -- ================================================================
  -- ██████████  RWANDA  ██████████
  -- ================================================================

  -- Level-1 headers
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,country_id)
  VALUES ('RW-1000','Assets','الأصول','asset','header',FALSE,id_rw) RETURNING id INTO rw_1000;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,country_id)
  VALUES ('RW-2000','Liabilities','الالتزامات','liability','header',FALSE,id_rw) RETURNING id INTO rw_2000;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,country_id)
  VALUES ('RW-3000','Net Assets / Equity','صافي الأصول','equity','header',FALSE,id_rw) RETURNING id INTO rw_3000;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,country_id)
  VALUES ('RW-4000','Revenue & Grants','الإيرادات والمنح','revenue','header',FALSE,id_rw) RETURNING id INTO rw_4000;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,country_id)
  VALUES ('RW-5000','Expenses','المصروفات','expense','header',FALSE,id_rw) RETURNING id INTO rw_5000;

  -- Asset sub-headers
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('RW-1100','Cash & Bank','النقد والبنك','asset','current_asset',FALSE,rw_1000,id_rw) RETURNING id INTO rw_1100;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('RW-1200','Receivables','الذمم المدينة','asset','current_asset',FALSE,rw_1000,id_rw) RETURNING id INTO rw_1200;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('RW-1300','Prepaid & Advances','المدفوعات المقدمة والسلف','asset','current_asset',FALSE,rw_1000,id_rw) RETURNING id INTO rw_1300;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('RW-1400','Fixed Assets','الأصول الثابتة','asset','fixed_asset',FALSE,rw_1000,id_rw) RETURNING id INTO rw_1400;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('RW-1500','Other Assets','أصول أخرى','asset','other_asset',FALSE,rw_1000,id_rw) RETURNING id INTO rw_1500;

  -- Cash & Bank leaf accounts
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('RW-1101','Petty Cash — Kigali','النقد الصغير كيغالي','asset','current_asset',TRUE,rw_1100,id_rw),
    ('RW-1102','BK Bank — Operations Account','حساب العمليات — بنك BWM','asset','current_asset',TRUE,rw_1100,id_rw),
    ('RW-1103','Equity Bank — Field Account','الحساب الميداني — بنك إيكويتي','asset','current_asset',TRUE,rw_1100,id_rw),
    ('RW-1104','USD Bank Account','حساب بنكي بالدولار','asset','current_asset',TRUE,rw_1100,id_rw);

  -- Receivables
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('RW-1201','Grants Receivable','ذمم المنح المدينة','asset','current_asset',TRUE,rw_1200,id_rw),
    ('RW-1202','Staff Advances Receivable','سلف الموظفين المدينة','asset','current_asset',TRUE,rw_1200,id_rw),
    ('RW-1203','Vendor Advances','سلف الموردين','asset','current_asset',TRUE,rw_1200,id_rw);

  -- Prepaid & Advances
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('RW-1301','Prepaid Rent','إيجار مدفوع مقدماً','asset','current_asset',TRUE,rw_1300,id_rw),
    ('RW-1302','Prepaid Insurance','تأمين مدفوع مقدماً','asset','current_asset',TRUE,rw_1300,id_rw),
    ('RW-1303','Travel Advances','سلف السفر','asset','current_asset',TRUE,rw_1300,id_rw);

  -- Fixed Assets
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('RW-1401','Vehicles','المركبات','asset','fixed_asset',TRUE,rw_1400,id_rw),
    ('RW-1402','Computer Equipment','معدات الحاسوب','asset','fixed_asset',TRUE,rw_1400,id_rw),
    ('RW-1403','Office Furniture & Equipment','أثاث ومعدات المكتب','asset','fixed_asset',TRUE,rw_1400,id_rw),
    ('RW-1404','Accumulated Depreciation','مجمع الاستهلاك','asset','fixed_asset',TRUE,rw_1400,id_rw);

  -- Liability sub-headers
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('RW-2100','Accounts Payable','الذمم الدائنة','liability','current_liability',FALSE,rw_2000,id_rw) RETURNING id INTO rw_2100;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('RW-2200','Accrued Liabilities','الالتزامات المستحقة','liability','current_liability',FALSE,rw_2000,id_rw) RETURNING id INTO rw_2200;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('RW-2300','Deferred Revenue','الإيرادات المؤجلة','liability','current_liability',FALSE,rw_2000,id_rw) RETURNING id INTO rw_2300;

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('RW-2101','Accounts Payable — Vendors','ذمم الموردين الدائنة','liability','current_liability',TRUE,rw_2100,id_rw),
    ('RW-2102','Accounts Payable — Staff','ذمم الموظفين الدائنة','liability','current_liability',TRUE,rw_2100,id_rw),
    ('RW-2201','Accrued Payroll','رواتب مستحقة','liability','current_liability',TRUE,rw_2200,id_rw),
    ('RW-2202','Accrued Taxes — RSSB','ضرائب مستحقة — RSSB','liability','current_liability',TRUE,rw_2200,id_rw),
    ('RW-2203','Withholding Tax Payable','ضريبة الاستقطاع المستحقة','liability','current_liability',TRUE,rw_2200,id_rw),
    ('RW-2301','Deferred Grant Revenue','إيرادات المنح المؤجلة','liability','current_liability',TRUE,rw_2300,id_rw);

  -- Equity
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('RW-3001','Unrestricted Net Assets','صافي الأصول غير المقيدة','equity','unrestricted',TRUE,rw_3000,id_rw),
    ('RW-3002','Temporarily Restricted Net Assets','صافي الأصول المقيدة مؤقتاً','equity','restricted',TRUE,rw_3000,id_rw),
    ('RW-3003','Permanently Restricted Net Assets','صافي الأصول المقيدة دائماً','equity','restricted',TRUE,rw_3000,id_rw),
    ('RW-3004','Retained Surplus / (Deficit)','الفائض / (العجز) المحتجز','equity','retained_earnings',TRUE,rw_3000,id_rw);

  -- Revenue sub-headers
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('RW-4100','Grant Revenue','إيرادات المنح','revenue','grant',FALSE,rw_4000,id_rw) RETURNING id INTO rw_4100;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('RW-4200','Other Income','إيرادات أخرى','revenue','other_income',FALSE,rw_4000,id_rw) RETURNING id INTO rw_4200;

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('RW-4101','USAID Grant Revenue','إيرادات منحة USAID','revenue','grant',TRUE,rw_4100,id_rw),
    ('RW-4102','FCDO Grant Revenue','إيرادات منحة FCDO','revenue','grant',TRUE,rw_4100,id_rw),
    ('RW-4103','GIZ Grant Revenue','إيرادات منحة GIZ','revenue','grant',TRUE,rw_4100,id_rw),
    ('RW-4104','EU Grant Revenue','إيرادات منحة الاتحاد الأوروبي','revenue','grant',TRUE,rw_4100,id_rw),
    ('RW-4201','Interest Income','إيرادات الفوائد','revenue','other_income',TRUE,rw_4200,id_rw),
    ('RW-4202','Exchange Gain','ربح صرف العملة','revenue','other_income',TRUE,rw_4200,id_rw),
    ('RW-4203','Miscellaneous Income','إيرادات متنوعة','revenue','other_income',TRUE,rw_4200,id_rw);

  -- Expense sub-headers
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('RW-5100','Personnel Costs','تكاليف الموظفين','expense','personnel',FALSE,rw_5000,id_rw) RETURNING id INTO rw_5100;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('RW-5200','Travel & Transport','السفر والنقل','expense','travel',FALSE,rw_5000,id_rw) RETURNING id INTO rw_5200;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('RW-5300','Program & Activity Costs','تكاليف البرامج والأنشطة','expense','program',FALSE,rw_5000,id_rw) RETURNING id INTO rw_5300;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('RW-5400','Office & Administrative','مكتب وإدارة','expense','admin',FALSE,rw_5000,id_rw) RETURNING id INTO rw_5400;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('RW-5500','Equipment & Supplies','معدات ومستلزمات','expense','supplies',FALSE,rw_5000,id_rw) RETURNING id INTO rw_5500;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('RW-5600','Indirect Costs / Overhead','التكاليف غير المباشرة','expense','indirect',FALSE,rw_5000,id_rw) RETURNING id INTO rw_5600;

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('RW-5101','Salaries — National Staff','رواتب الكوادر الوطنية','expense','personnel',TRUE,rw_5100,id_rw),
    ('RW-5102','Salaries — Expatriate Staff','رواتب الكوادر الدولية','expense','personnel',TRUE,rw_5100,id_rw),
    ('RW-5103','Benefits & Allowances','المزايا والبدلات','expense','personnel',TRUE,rw_5100,id_rw),
    ('RW-5104','RSSB Employer Contribution','اشتراك صاحب العمل في RSSB','expense','personnel',TRUE,rw_5100,id_rw),
    ('RW-5105','Severance Pay','مكافأة نهاية الخدمة','expense','personnel',TRUE,rw_5100,id_rw),
    ('RW-5201','In-Country Travel','السفر الداخلي','expense','travel',TRUE,rw_5200,id_rw),
    ('RW-5202','International Travel','السفر الدولي','expense','travel',TRUE,rw_5200,id_rw),
    ('RW-5203','Vehicle Fuel & Maintenance','وقود وصيانة المركبات','expense','travel',TRUE,rw_5200,id_rw),
    ('RW-5204','Per Diem & Accommodation','البدل اليومي والإقامة','expense','travel',TRUE,rw_5200,id_rw),
    ('RW-5301','Participant / Beneficiary Costs','تكاليف المستفيدين','expense','program',TRUE,rw_5300,id_rw),
    ('RW-5302','Training & Workshops','التدريب وورش العمل','expense','program',TRUE,rw_5300,id_rw),
    ('RW-5303','Field Supplies & Materials','مستلزمات وأدوات ميدانية','expense','program',TRUE,rw_5300,id_rw),
    ('RW-5304','Sub-grants & Partner Transfers','المنح الفرعية وتحويلات الشركاء','expense','program',TRUE,rw_5300,id_rw),
    ('RW-5401','Office Rent','إيجار المكتب','expense','admin',TRUE,rw_5400,id_rw),
    ('RW-5402','Utilities','المرافق العامة','expense','admin',TRUE,rw_5400,id_rw),
    ('RW-5403','Communications & Internet','الاتصالات والإنترنت','expense','admin',TRUE,rw_5400,id_rw),
    ('RW-5404','Printing & Publications','الطباعة والمنشورات','expense','admin',TRUE,rw_5400,id_rw),
    ('RW-5405','Legal & Audit Fees','الرسوم القانونية والتدقيق','expense','admin',TRUE,rw_5400,id_rw),
    ('RW-5406','Bank Charges','رسوم بنكية','expense','admin',TRUE,rw_5400,id_rw),
    ('RW-5407','Exchange Loss','خسارة صرف العملة','expense','admin',TRUE,rw_5400,id_rw),
    ('RW-5501','Computer & IT Equipment','معدات الحاسوب وتقنية المعلومات','expense','supplies',TRUE,rw_5500,id_rw),
    ('RW-5502','Office Furniture & Equipment','أثاث ومعدات مكتبية','expense','supplies',TRUE,rw_5500,id_rw),
    ('RW-5503','Vehicles','مركبات','expense','supplies',TRUE,rw_5500,id_rw),
    ('RW-5601','Indirect Cost Rate Charge','رسوم معدل التكاليف غير المباشرة','expense','indirect',TRUE,rw_5600,id_rw),
    ('RW-5602','Management Fee','رسوم الإدارة','expense','indirect',TRUE,rw_5600,id_rw);

  -- ================================================================
  -- ██████████  QATAR  ██████████
  -- ================================================================

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,country_id)
  VALUES ('QA-1000','Assets','الأصول','asset','header',FALSE,id_qa) RETURNING id INTO qa_1000;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,country_id)
  VALUES ('QA-2000','Liabilities','الالتزامات','liability','header',FALSE,id_qa) RETURNING id INTO qa_2000;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,country_id)
  VALUES ('QA-3000','Net Assets / Equity','صافي الأصول','equity','header',FALSE,id_qa) RETURNING id INTO qa_3000;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,country_id)
  VALUES ('QA-4000','Revenue & Grants','الإيرادات والمنح','revenue','header',FALSE,id_qa) RETURNING id INTO qa_4000;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,country_id)
  VALUES ('QA-5000','Expenses','المصروفات','expense','header',FALSE,id_qa) RETURNING id INTO qa_5000;

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('QA-1100','Cash & Bank','النقد والبنك','asset','current_asset',FALSE,qa_1000,id_qa) RETURNING id INTO qa_1100;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('QA-1200','Receivables','الذمم المدينة','asset','current_asset',FALSE,qa_1000,id_qa) RETURNING id INTO qa_1200;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('QA-1300','Prepaid & Advances','المدفوعات المقدمة والسلف','asset','current_asset',FALSE,qa_1000,id_qa) RETURNING id INTO qa_1300;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('QA-1400','Fixed Assets','الأصول الثابتة','asset','fixed_asset',FALSE,qa_1000,id_qa) RETURNING id INTO qa_1400;

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('QA-1101','Petty Cash — Doha','النقد الصغير دوحة','asset','current_asset',TRUE,qa_1100,id_qa),
    ('QA-1102','QNB — Main Account','حساب رئيسي — QNB','asset','current_asset',TRUE,qa_1100,id_qa),
    ('QA-1103','HSBC — USD Account','حساب دولار — HSBC','asset','current_asset',TRUE,qa_1100,id_qa),
    ('QA-1104','Commercial Bank of Qatar','البنك التجاري القطري','asset','current_asset',TRUE,qa_1100,id_qa),
    ('QA-1201','Grants Receivable','ذمم المنح المدينة','asset','current_asset',TRUE,qa_1200,id_qa),
    ('QA-1202','Staff Advances Receivable','سلف الموظفين المدينة','asset','current_asset',TRUE,qa_1200,id_qa),
    ('QA-1203','VAT Recoverable','ضريبة القيمة المضافة القابلة للاسترداد','asset','current_asset',TRUE,qa_1200,id_qa),
    ('QA-1301','Prepaid Rent','إيجار مدفوع مقدماً','asset','current_asset',TRUE,qa_1300,id_qa),
    ('QA-1302','Prepaid Insurance','تأمين مدفوع مقدماً','asset','current_asset',TRUE,qa_1300,id_qa),
    ('QA-1303','Travel Advances','سلف السفر','asset','current_asset',TRUE,qa_1300,id_qa),
    ('QA-1401','Vehicles','المركبات','asset','fixed_asset',TRUE,qa_1400,id_qa),
    ('QA-1402','IT Equipment','معدات تقنية المعلومات','asset','fixed_asset',TRUE,qa_1400,id_qa),
    ('QA-1403','Office Furniture','أثاث المكاتب','asset','fixed_asset',TRUE,qa_1400,id_qa),
    ('QA-1404','Accumulated Depreciation','مجمع الاستهلاك','asset','fixed_asset',TRUE,qa_1400,id_qa);

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('QA-2100','Accounts Payable','الذمم الدائنة','liability','current_liability',FALSE,qa_2000,id_qa) RETURNING id INTO qa_2100;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('QA-2200','Accrued Liabilities','الالتزامات المستحقة','liability','current_liability',FALSE,qa_2000,id_qa) RETURNING id INTO qa_2200;

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('QA-2101','Accounts Payable — Vendors','ذمم الموردين الدائنة','liability','current_liability',TRUE,qa_2100,id_qa),
    ('QA-2102','Accounts Payable — Staff','ذمم الموظفين الدائنة','liability','current_liability',TRUE,qa_2100,id_qa),
    ('QA-2201','Accrued Payroll','رواتب مستحقة','liability','current_liability',TRUE,qa_2200,id_qa),
    ('QA-2202','End of Service Benefits Payable','مكافأة نهاية الخدمة المستحقة','liability','current_liability',TRUE,qa_2200,id_qa),
    ('QA-2203','Withholding Tax Payable','ضريبة الاستقطاع المستحقة','liability','current_liability',TRUE,qa_2200,id_qa),
    ('QA-2204','Social Insurance Payable','مستحقات التأمين الاجتماعي','liability','current_liability',TRUE,qa_2200,id_qa);

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('QA-3001','Unrestricted Net Assets','صافي الأصول غير المقيدة','equity','unrestricted',TRUE,qa_3000,id_qa),
    ('QA-3002','Restricted Net Assets','صافي الأصول المقيدة','equity','restricted',TRUE,qa_3000,id_qa),
    ('QA-3003','Retained Surplus / (Deficit)','الفائض / (العجز) المحتجز','equity','retained_earnings',TRUE,qa_3000,id_qa);

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('QA-4100','Grant Revenue','إيرادات المنح','revenue','grant',FALSE,qa_4000,id_qa) RETURNING id INTO qa_4100;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('QA-4200','Other Income','إيرادات أخرى','revenue','other_income',FALSE,qa_4000,id_qa) RETURNING id INTO qa_4200;

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('QA-4101','USAID Grant Revenue','إيرادات منحة USAID','revenue','grant',TRUE,qa_4100,id_qa),
    ('QA-4102','Qatar Fund for Development Grant','إيرادات منحة صندوق قطر للتنمية','revenue','grant',TRUE,qa_4100,id_qa),
    ('QA-4103','EU Grant Revenue','إيرادات منحة الاتحاد الأوروبي','revenue','grant',TRUE,qa_4100,id_qa),
    ('QA-4201','Interest Income','إيرادات الفوائد','revenue','other_income',TRUE,qa_4200,id_qa),
    ('QA-4202','Exchange Gain','ربح صرف العملة','revenue','other_income',TRUE,qa_4200,id_qa),
    ('QA-4203','Miscellaneous Income','إيرادات متنوعة','revenue','other_income',TRUE,qa_4200,id_qa);

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('QA-5100','Personnel Costs','تكاليف الموظفين','expense','personnel',FALSE,qa_5000,id_qa) RETURNING id INTO qa_5100;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('QA-5200','Travel & Transport','السفر والنقل','expense','travel',FALSE,qa_5000,id_qa) RETURNING id INTO qa_5200;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('QA-5300','Program & Activity Costs','تكاليف البرامج والأنشطة','expense','program',FALSE,qa_5000,id_qa) RETURNING id INTO qa_5300;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('QA-5400','Office & Administrative','مكتب وإدارة','expense','admin',FALSE,qa_5000,id_qa) RETURNING id INTO qa_5400;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('QA-5500','Indirect Costs / Overhead','التكاليف غير المباشرة','expense','indirect',FALSE,qa_5000,id_qa) RETURNING id INTO qa_5500;

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('QA-5101','Salaries — National Staff','رواتب الكوادر الوطنية','expense','personnel',TRUE,qa_5100,id_qa),
    ('QA-5102','Salaries — Expatriate Staff','رواتب الكوادر الدولية','expense','personnel',TRUE,qa_5100,id_qa),
    ('QA-5103','Benefits & Allowances','المزايا والبدلات','expense','personnel',TRUE,qa_5100,id_qa),
    ('QA-5104','End of Service Benefits','مكافأة نهاية الخدمة','expense','personnel',TRUE,qa_5100,id_qa),
    ('QA-5105','Social Insurance — Employer','التأمين الاجتماعي — صاحب العمل','expense','personnel',TRUE,qa_5100,id_qa),
    ('QA-5201','In-Country Travel','السفر الداخلي','expense','travel',TRUE,qa_5200,id_qa),
    ('QA-5202','International Travel','السفر الدولي','expense','travel',TRUE,qa_5200,id_qa),
    ('QA-5203','Vehicle Fuel & Maintenance','وقود وصيانة المركبات','expense','travel',TRUE,qa_5200,id_qa),
    ('QA-5204','Per Diem & Accommodation','البدل اليومي والإقامة','expense','travel',TRUE,qa_5200,id_qa),
    ('QA-5301','Participant / Beneficiary Costs','تكاليف المستفيدين','expense','program',TRUE,qa_5300,id_qa),
    ('QA-5302','Training & Workshops','التدريب وورش العمل','expense','program',TRUE,qa_5300,id_qa),
    ('QA-5303','Field Supplies & Materials','مستلزمات وأدوات ميدانية','expense','program',TRUE,qa_5300,id_qa),
    ('QA-5304','Sub-grants & Partner Transfers','المنح الفرعية وتحويلات الشركاء','expense','program',TRUE,qa_5300,id_qa),
    ('QA-5401','Office Rent','إيجار المكتب','expense','admin',TRUE,qa_5400,id_qa),
    ('QA-5402','Utilities','المرافق العامة','expense','admin',TRUE,qa_5400,id_qa),
    ('QA-5403','Communications & Internet','الاتصالات والإنترنت','expense','admin',TRUE,qa_5400,id_qa),
    ('QA-5404','Legal & Audit Fees','الرسوم القانونية والتدقيق','expense','admin',TRUE,qa_5400,id_qa),
    ('QA-5405','Bank Charges','رسوم بنكية','expense','admin',TRUE,qa_5400,id_qa),
    ('QA-5406','Exchange Loss','خسارة صرف العملة','expense','admin',TRUE,qa_5400,id_qa),
    ('QA-5501','Indirect Cost Rate Charge','رسوم معدل التكاليف غير المباشرة','expense','indirect',TRUE,qa_5500,id_qa),
    ('QA-5502','Management Fee','رسوم الإدارة','expense','indirect',TRUE,qa_5500,id_qa);

  -- ================================================================
  -- ██████████  USA  ██████████
  -- ================================================================

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,country_id)
  VALUES ('US-1000','Assets','الأصول','asset','header',FALSE,id_us) RETURNING id INTO us_1000;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,country_id)
  VALUES ('US-2000','Liabilities','الالتزامات','liability','header',FALSE,id_us) RETURNING id INTO us_2000;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,country_id)
  VALUES ('US-3000','Net Assets / Equity','صافي الأصول','equity','header',FALSE,id_us) RETURNING id INTO us_3000;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,country_id)
  VALUES ('US-4000','Revenue & Grants','الإيرادات والمنح','revenue','header',FALSE,id_us) RETURNING id INTO us_4000;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,country_id)
  VALUES ('US-5000','Expenses','المصروفات','expense','header',FALSE,id_us) RETURNING id INTO us_5000;

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('US-1100','Cash & Bank','النقد والبنك','asset','current_asset',FALSE,us_1000,id_us) RETURNING id INTO us_1100;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('US-1200','Receivables','الذمم المدينة','asset','current_asset',FALSE,us_1000,id_us) RETURNING id INTO us_1200;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('US-1300','Prepaid & Advances','المدفوعات المقدمة والسلف','asset','current_asset',FALSE,us_1000,id_us) RETURNING id INTO us_1300;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('US-1400','Investments','الاستثمارات','asset','investment',FALSE,us_1000,id_us) RETURNING id INTO us_1400;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('US-1500','Fixed Assets','الأصول الثابتة','asset','fixed_asset',FALSE,us_1000,id_us) RETURNING id INTO us_1500;

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('US-1101','Petty Cash — HQ','النقد الصغير المقر الرئيسي','asset','current_asset',TRUE,us_1100,id_us),
    ('US-1102','Bank of America — Operating','حساب تشغيلي — بنك أوف أمريكا','asset','current_asset',TRUE,us_1100,id_us),
    ('US-1103','Wells Fargo — Payroll Account','حساب الرواتب — ويلز فارجو','asset','current_asset',TRUE,us_1100,id_us),
    ('US-1104','Money Market Account','حساب سوق المال','asset','current_asset',TRUE,us_1100,id_us),
    ('US-1201','Federal Grants Receivable','ذمم المنح الفيدرالية','asset','current_asset',TRUE,us_1200,id_us),
    ('US-1202','Foundation Grants Receivable','ذمم منح المؤسسات','asset','current_asset',TRUE,us_1200,id_us),
    ('US-1203','Pledges Receivable','ذمم التعهدات','asset','current_asset',TRUE,us_1200,id_us),
    ('US-1204','Staff Advances Receivable','سلف الموظفين المدينة','asset','current_asset',TRUE,us_1200,id_us),
    ('US-1301','Prepaid Rent','إيجار مدفوع مقدماً','asset','current_asset',TRUE,us_1300,id_us),
    ('US-1302','Prepaid Insurance','تأمين مدفوع مقدماً','asset','current_asset',TRUE,us_1300,id_us),
    ('US-1303','Travel Advances','سلف السفر','asset','current_asset',TRUE,us_1300,id_us),
    ('US-1304','Prepaid Software Subscriptions','اشتراكات برمجية مدفوعة مقدماً','asset','current_asset',TRUE,us_1300,id_us),
    ('US-1401','Short-term Investments','استثمارات قصيرة الأجل','asset','investment',TRUE,us_1400,id_us),
    ('US-1402','Long-term Investments','استثمارات طويلة الأجل','asset','investment',TRUE,us_1400,id_us),
    ('US-1501','Leasehold Improvements','تحسينات العقار المستأجر','asset','fixed_asset',TRUE,us_1500,id_us),
    ('US-1502','Computer & IT Equipment','معدات الحاسوب وتقنية المعلومات','asset','fixed_asset',TRUE,us_1500,id_us),
    ('US-1503','Office Furniture & Equipment','أثاث ومعدات مكتبية','asset','fixed_asset',TRUE,us_1500,id_us),
    ('US-1504','Accumulated Depreciation','مجمع الاستهلاك','asset','fixed_asset',TRUE,us_1500,id_us);

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('US-2100','Accounts Payable','الذمم الدائنة','liability','current_liability',FALSE,us_2000,id_us) RETURNING id INTO us_2100;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('US-2200','Accrued Liabilities','الالتزامات المستحقة','liability','current_liability',FALSE,us_2000,id_us) RETURNING id INTO us_2200;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('US-2300','Deferred Revenue','الإيرادات المؤجلة','liability','current_liability',FALSE,us_2000,id_us) RETURNING id INTO us_2300;

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('US-2101','Accounts Payable — Vendors','ذمم الموردين الدائنة','liability','current_liability',TRUE,us_2100,id_us),
    ('US-2102','Accounts Payable — Subgrantees','ذمم المانحين الفرعيين الدائنة','liability','current_liability',TRUE,us_2100,id_us),
    ('US-2201','Accrued Payroll','رواتب مستحقة','liability','current_liability',TRUE,us_2200,id_us),
    ('US-2202','Accrued Benefits (401k, Health)','مزايا مستحقة (401k، صحة)','liability','current_liability',TRUE,us_2200,id_us),
    ('US-2203','Federal Income Tax Withholding','استقطاع ضريبة الدخل الفيدرالي','liability','current_liability',TRUE,us_2200,id_us),
    ('US-2204','State Income Tax Withholding','استقطاع ضريبة الدخل الولائية','liability','current_liability',TRUE,us_2200,id_us),
    ('US-2205','FICA — OASDI Payable','ضريبة FICA — OASDI مستحقة','liability','current_liability',TRUE,us_2200,id_us),
    ('US-2206','FICA — Medicare Payable','ضريبة FICA — رعاية طبية مستحقة','liability','current_liability',TRUE,us_2200,id_us),
    ('US-2207','Accrued Vacation','إجازة مستحقة','liability','current_liability',TRUE,us_2200,id_us),
    ('US-2301','Deferred Federal Grant Revenue','إيرادات المنح الفيدرالية المؤجلة','liability','current_liability',TRUE,us_2300,id_us),
    ('US-2302','Deferred Foundation Revenue','إيرادات مؤسسات مؤجلة','liability','current_liability',TRUE,us_2300,id_us);

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('US-3001','Net Assets Without Donor Restrictions','صافي أصول بلا قيود المانحين','equity','unrestricted',TRUE,us_3000,id_us),
    ('US-3002','Net Assets With Donor Restrictions','صافي أصول مع قيود المانحين','equity','restricted',TRUE,us_3000,id_us),
    ('US-3003','Board-Designated Net Assets','صافي الأصول المخصصة من مجلس الإدارة','equity','unrestricted',TRUE,us_3000,id_us),
    ('US-3004','Retained Surplus / (Deficit)','الفائض / (العجز) المحتجز','equity','retained_earnings',TRUE,us_3000,id_us);

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('US-4100','Federal Grant Revenue','إيرادات المنح الفيدرالية','revenue','grant',FALSE,us_4000,id_us) RETURNING id INTO us_4100;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('US-4200','Foundation & Private Grants','منح المؤسسات والجهات الخاصة','revenue','grant',FALSE,us_4000,id_us) RETURNING id INTO us_4200;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('US-4300','Other Income','إيرادات أخرى','revenue','other_income',FALSE,us_4000,id_us) RETURNING id INTO us_4300;

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('US-4101','USAID — Prime Award Revenue','إيرادات USAID — منحة رئيسية','revenue','grant',TRUE,us_4100,id_us),
    ('US-4102','US State Dept — Grant Revenue','إيرادات وزارة الخارجية الأمريكية','revenue','grant',TRUE,us_4100,id_us),
    ('US-4103','CDC — Grant Revenue','إيرادات CDC','revenue','grant',TRUE,us_4100,id_us),
    ('US-4104','PEPFAR Revenue','إيرادات PEPFAR','revenue','grant',TRUE,us_4100,id_us),
    ('US-4201','Ford Foundation Grant','منحة مؤسسة فورد','revenue','grant',TRUE,us_4200,id_us),
    ('US-4202','Gates Foundation Grant','منحة مؤسسة غيتس','revenue','grant',TRUE,us_4200,id_us),
    ('US-4203','Individual Contributions','تبرعات فردية','revenue','grant',TRUE,us_4200,id_us),
    ('US-4301','Investment Income','إيرادات الاستثمار','revenue','other_income',TRUE,us_4300,id_us),
    ('US-4302','Interest Income','إيرادات الفوائد','revenue','other_income',TRUE,us_4300,id_us),
    ('US-4303','Miscellaneous Income','إيرادات متنوعة','revenue','other_income',TRUE,us_4300,id_us);

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('US-5100','Personnel Costs','تكاليف الموظفين','expense','personnel',FALSE,us_5000,id_us) RETURNING id INTO us_5100;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('US-5200','Fringe Benefits','المزايا الإضافية','expense','personnel',FALSE,us_5000,id_us) RETURNING id INTO us_5200;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('US-5300','Travel & Transport','السفر والنقل','expense','travel',FALSE,us_5000,id_us) RETURNING id INTO us_5300;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('US-5400','Program & Activity Costs','تكاليف البرامج والأنشطة','expense','program',FALSE,us_5000,id_us) RETURNING id INTO us_5400;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('US-5500','Office & Administrative','مكتب وإدارة','expense','admin',FALSE,us_5000,id_us) RETURNING id INTO us_5500;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('US-5600','Indirect Costs / Overhead','التكاليف غير المباشرة','expense','indirect',FALSE,us_5000,id_us) RETURNING id INTO us_5600;

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('US-5101','Salaries — Exempt Employees','رواتب الموظفين المعفيين','expense','personnel',TRUE,us_5100,id_us),
    ('US-5102','Salaries — Non-Exempt Employees','رواتب الموظفين غير المعفيين','expense','personnel',TRUE,us_5100,id_us),
    ('US-5103','Consultants & Contractors','المستشارون والمقاولون','expense','personnel',TRUE,us_5100,id_us),
    ('US-5201','Health & Dental Insurance','تأمين صحي وطب الأسنان','expense','personnel',TRUE,us_5200,id_us),
    ('US-5202','401(k) Employer Contribution','مساهمة صاحب العمل في 401(k)','expense','personnel',TRUE,us_5200,id_us),
    ('US-5203','FICA — OASDI (Employer)','FICA — OASDI (صاحب العمل)','expense','personnel',TRUE,us_5200,id_us),
    ('US-5204','FICA — Medicare (Employer)','FICA — رعاية طبية (صاحب العمل)','expense','personnel',TRUE,us_5200,id_us),
    ('US-5205','FUTA / SUTA','FUTA / SUTA','expense','personnel',TRUE,us_5200,id_us),
    ('US-5206','Workers Compensation Insurance','تأمين تعويض العمال','expense','personnel',TRUE,us_5200,id_us),
    ('US-5207','Life & Disability Insurance','التأمين على الحياة والعجز','expense','personnel',TRUE,us_5200,id_us),
    ('US-5301','Domestic Travel','السفر المحلي','expense','travel',TRUE,us_5300,id_us),
    ('US-5302','International Travel','السفر الدولي','expense','travel',TRUE,us_5300,id_us),
    ('US-5303','Per Diem & Accommodation','البدل اليومي والإقامة','expense','travel',TRUE,us_5300,id_us),
    ('US-5401','Participant / Beneficiary Costs','تكاليف المستفيدين','expense','program',TRUE,us_5400,id_us),
    ('US-5402','Training & Workshops','التدريب وورش العمل','expense','program',TRUE,us_5400,id_us),
    ('US-5403','Subgrant Expenses','مصروفات المنح الفرعية','expense','program',TRUE,us_5400,id_us),
    ('US-5404','Research & Evaluation','البحث والتقييم','expense','program',TRUE,us_5400,id_us),
    ('US-5405','Program Supplies & Materials','مستلزمات البرامج والمواد','expense','program',TRUE,us_5400,id_us),
    ('US-5501','Office Rent & Occupancy','إيجار المكتب والإشغال','expense','admin',TRUE,us_5500,id_us),
    ('US-5502','Utilities','المرافق العامة','expense','admin',TRUE,us_5500,id_us),
    ('US-5503','Communications & Telecom','الاتصالات والاتصالات السلكية واللاسلكية','expense','admin',TRUE,us_5500,id_us),
    ('US-5504','Software & IT Subscriptions','اشتراكات البرمجيات وتقنية المعلومات','expense','admin',TRUE,us_5500,id_us),
    ('US-5505','Legal & Professional Fees','الرسوم القانونية والمهنية','expense','admin',TRUE,us_5500,id_us),
    ('US-5506','Audit & Accounting Fees','رسوم التدقيق والمحاسبة','expense','admin',TRUE,us_5500,id_us),
    ('US-5507','Bank Charges','رسوم بنكية','expense','admin',TRUE,us_5500,id_us),
    ('US-5508','Printing & Publications','الطباعة والمنشورات','expense','admin',TRUE,us_5500,id_us),
    ('US-5601','NICRA — Indirect Cost Rate','معدل التكاليف غير المباشرة (NICRA)','expense','indirect',TRUE,us_5600,id_us),
    ('US-5602','Management Fee','رسوم الإدارة','expense','indirect',TRUE,us_5600,id_us);

  -- ================================================================
  -- ██████████  KENYA  ██████████
  -- ================================================================

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,country_id)
  VALUES ('KE-1000','Assets','الأصول','asset','header',FALSE,id_ke) RETURNING id INTO ke_1000;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,country_id)
  VALUES ('KE-2000','Liabilities','الالتزامات','liability','header',FALSE,id_ke) RETURNING id INTO ke_2000;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,country_id)
  VALUES ('KE-3000','Net Assets / Equity','صافي الأصول','equity','header',FALSE,id_ke) RETURNING id INTO ke_3000;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,country_id)
  VALUES ('KE-4000','Revenue & Grants','الإيرادات والمنح','revenue','header',FALSE,id_ke) RETURNING id INTO ke_4000;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,country_id)
  VALUES ('KE-5000','Expenses','المصروفات','expense','header',FALSE,id_ke) RETURNING id INTO ke_5000;

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('KE-1100','Cash & Bank','النقد والبنك','asset','current_asset',FALSE,ke_1000,id_ke) RETURNING id INTO ke_1100;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('KE-1200','Receivables','الذمم المدينة','asset','current_asset',FALSE,ke_1000,id_ke) RETURNING id INTO ke_1200;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('KE-1300','Prepaid & Advances','المدفوعات المقدمة والسلف','asset','current_asset',FALSE,ke_1000,id_ke) RETURNING id INTO ke_1300;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('KE-1400','Fixed Assets','الأصول الثابتة','asset','fixed_asset',FALSE,ke_1000,id_ke) RETURNING id INTO ke_1400;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('KE-1500','Other Assets','أصول أخرى','asset','other_asset',FALSE,ke_1000,id_ke) RETURNING id INTO ke_1500;

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('KE-1101','Petty Cash — Nairobi','النقد الصغير نيروبي','asset','current_asset',TRUE,ke_1100,id_ke),
    ('KE-1102','KCB Bank — Operations Account','حساب العمليات — بنك KCB','asset','current_asset',TRUE,ke_1100,id_ke),
    ('KE-1103','Equity Bank — Field Account','الحساب الميداني — بنك إيكويتي','asset','current_asset',TRUE,ke_1100,id_ke),
    ('KE-1104','Co-operative Bank — USD Account','حساب دولار — البنك التعاوني','asset','current_asset',TRUE,ke_1100,id_ke),
    ('KE-1105','M-Pesa Float Account','حساب M-Pesa','asset','current_asset',TRUE,ke_1100,id_ke),
    ('KE-1201','Grants Receivable','ذمم المنح المدينة','asset','current_asset',TRUE,ke_1200,id_ke),
    ('KE-1202','Staff Advances Receivable','سلف الموظفين المدينة','asset','current_asset',TRUE,ke_1200,id_ke),
    ('KE-1203','Vendor Advances','سلف الموردين','asset','current_asset',TRUE,ke_1200,id_ke),
    ('KE-1204','VAT Recoverable','ضريبة القيمة المضافة القابلة للاسترداد','asset','current_asset',TRUE,ke_1200,id_ke),
    ('KE-1301','Prepaid Rent','إيجار مدفوع مقدماً','asset','current_asset',TRUE,ke_1300,id_ke),
    ('KE-1302','Prepaid Insurance','تأمين مدفوع مقدماً','asset','current_asset',TRUE,ke_1300,id_ke),
    ('KE-1303','Travel Advances','سلف السفر','asset','current_asset',TRUE,ke_1300,id_ke),
    ('KE-1401','Vehicles','المركبات','asset','fixed_asset',TRUE,ke_1400,id_ke),
    ('KE-1402','Computer & IT Equipment','معدات الحاسوب وتقنية المعلومات','asset','fixed_asset',TRUE,ke_1400,id_ke),
    ('KE-1403','Office Furniture & Equipment','أثاث ومعدات مكتبية','asset','fixed_asset',TRUE,ke_1400,id_ke),
    ('KE-1404','Accumulated Depreciation','مجمع الاستهلاك','asset','fixed_asset',TRUE,ke_1400,id_ke);

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('KE-2100','Accounts Payable','الذمم الدائنة','liability','current_liability',FALSE,ke_2000,id_ke) RETURNING id INTO ke_2100;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('KE-2200','Accrued Liabilities','الالتزامات المستحقة','liability','current_liability',FALSE,ke_2000,id_ke) RETURNING id INTO ke_2200;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('KE-2300','Deferred Revenue','الإيرادات المؤجلة','liability','current_liability',FALSE,ke_2000,id_ke) RETURNING id INTO ke_2300;

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('KE-2101','Accounts Payable — Vendors','ذمم الموردين الدائنة','liability','current_liability',TRUE,ke_2100,id_ke),
    ('KE-2102','Accounts Payable — Staff','ذمم الموظفين الدائنة','liability','current_liability',TRUE,ke_2100,id_ke),
    ('KE-2201','Accrued Payroll','رواتب مستحقة','liability','current_liability',TRUE,ke_2200,id_ke),
    ('KE-2202','NHIF Payable','مستحقات NHIF','liability','current_liability',TRUE,ke_2200,id_ke),
    ('KE-2203','NSSF Payable','مستحقات NSSF','liability','current_liability',TRUE,ke_2200,id_ke),
    ('KE-2204','PAYE Tax Payable','ضريبة PAYE المستحقة','liability','current_liability',TRUE,ke_2200,id_ke),
    ('KE-2205','VAT Payable','ضريبة القيمة المضافة المستحقة','liability','current_liability',TRUE,ke_2200,id_ke),
    ('KE-2206','Withholding Tax Payable','ضريبة الاستقطاع المستحقة','liability','current_liability',TRUE,ke_2200,id_ke),
    ('KE-2301','Deferred Grant Revenue','إيرادات المنح المؤجلة','liability','current_liability',TRUE,ke_2300,id_ke);

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('KE-3001','Unrestricted Net Assets','صافي الأصول غير المقيدة','equity','unrestricted',TRUE,ke_3000,id_ke),
    ('KE-3002','Temporarily Restricted Net Assets','صافي الأصول المقيدة مؤقتاً','equity','restricted',TRUE,ke_3000,id_ke),
    ('KE-3003','Permanently Restricted Net Assets','صافي الأصول المقيدة دائماً','equity','restricted',TRUE,ke_3000,id_ke),
    ('KE-3004','Retained Surplus / (Deficit)','الفائض / (العجز) المحتجز','equity','retained_earnings',TRUE,ke_3000,id_ke);

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('KE-4100','Grant Revenue','إيرادات المنح','revenue','grant',FALSE,ke_4000,id_ke) RETURNING id INTO ke_4100;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('KE-4200','Other Income','إيرادات أخرى','revenue','other_income',FALSE,ke_4000,id_ke) RETURNING id INTO ke_4200;

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('KE-4101','USAID Grant Revenue','إيرادات منحة USAID','revenue','grant',TRUE,ke_4100,id_ke),
    ('KE-4102','FCDO / DFID Grant Revenue','إيرادات منحة FCDO / DFID','revenue','grant',TRUE,ke_4100,id_ke),
    ('KE-4103','EU Grant Revenue','إيرادات منحة الاتحاد الأوروبي','revenue','grant',TRUE,ke_4100,id_ke),
    ('KE-4104','World Bank Grant Revenue','إيرادات منحة البنك الدولي','revenue','grant',TRUE,ke_4100,id_ke),
    ('KE-4201','Interest Income','إيرادات الفوائد','revenue','other_income',TRUE,ke_4200,id_ke),
    ('KE-4202','Exchange Gain','ربح صرف العملة','revenue','other_income',TRUE,ke_4200,id_ke),
    ('KE-4203','Miscellaneous Income','إيرادات متنوعة','revenue','other_income',TRUE,ke_4200,id_ke);

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('KE-5100','Personnel Costs','تكاليف الموظفين','expense','personnel',FALSE,ke_5000,id_ke) RETURNING id INTO ke_5100;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('KE-5200','Travel & Transport','السفر والنقل','expense','travel',FALSE,ke_5000,id_ke) RETURNING id INTO ke_5200;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('KE-5300','Program & Activity Costs','تكاليف البرامج والأنشطة','expense','program',FALSE,ke_5000,id_ke) RETURNING id INTO ke_5300;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('KE-5400','Office & Administrative','مكتب وإدارة','expense','admin',FALSE,ke_5000,id_ke) RETURNING id INTO ke_5400;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('KE-5500','Equipment & Supplies','معدات ومستلزمات','expense','supplies',FALSE,ke_5000,id_ke) RETURNING id INTO ke_5500;
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('KE-5600','Indirect Costs / Overhead','التكاليف غير المباشرة','expense','indirect',FALSE,ke_5000,id_ke) RETURNING id INTO ke_5600;

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('KE-5101','Salaries — National Staff','رواتب الكوادر الوطنية','expense','personnel',TRUE,ke_5100,id_ke),
    ('KE-5102','Salaries — Expatriate Staff','رواتب الكوادر الدولية','expense','personnel',TRUE,ke_5100,id_ke),
    ('KE-5103','Benefits & Allowances','المزايا والبدلات','expense','personnel',TRUE,ke_5100,id_ke),
    ('KE-5104','NSSF Employer Contribution','اشتراك صاحب العمل في NSSF','expense','personnel',TRUE,ke_5100,id_ke),
    ('KE-5105','NHIF Employer Contribution','اشتراك صاحب العمل في NHIF','expense','personnel',TRUE,ke_5100,id_ke),
    ('KE-5106','Severance Pay','مكافأة نهاية الخدمة','expense','personnel',TRUE,ke_5100,id_ke),
    ('KE-5201','In-Country Travel','السفر الداخلي','expense','travel',TRUE,ke_5200,id_ke),
    ('KE-5202','International Travel','السفر الدولي','expense','travel',TRUE,ke_5200,id_ke),
    ('KE-5203','Vehicle Fuel & Maintenance','وقود وصيانة المركبات','expense','travel',TRUE,ke_5200,id_ke),
    ('KE-5204','Per Diem & Accommodation','البدل اليومي والإقامة','expense','travel',TRUE,ke_5200,id_ke),
    ('KE-5301','Participant / Beneficiary Costs','تكاليف المستفيدين','expense','program',TRUE,ke_5300,id_ke),
    ('KE-5302','Training & Workshops','التدريب وورش العمل','expense','program',TRUE,ke_5300,id_ke),
    ('KE-5303','Field Supplies & Materials','مستلزمات وأدوات ميدانية','expense','program',TRUE,ke_5300,id_ke),
    ('KE-5304','Sub-grants & Partner Transfers','المنح الفرعية وتحويلات الشركاء','expense','program',TRUE,ke_5300,id_ke),
    ('KE-5401','Office Rent','إيجار المكتب','expense','admin',TRUE,ke_5400,id_ke),
    ('KE-5402','Utilities','المرافق العامة','expense','admin',TRUE,ke_5400,id_ke),
    ('KE-5403','Communications & Internet','الاتصالات والإنترنت','expense','admin',TRUE,ke_5400,id_ke),
    ('KE-5404','Printing & Publications','الطباعة والمنشورات','expense','admin',TRUE,ke_5400,id_ke),
    ('KE-5405','Legal & Audit Fees','الرسوم القانونية والتدقيق','expense','admin',TRUE,ke_5400,id_ke),
    ('KE-5406','Bank & M-Pesa Charges','رسوم البنك و M-Pesa','expense','admin',TRUE,ke_5400,id_ke),
    ('KE-5407','Exchange Loss','خسارة صرف العملة','expense','admin',TRUE,ke_5400,id_ke),
    ('KE-5501','Computer & IT Equipment','معدات الحاسوب وتقنية المعلومات','expense','supplies',TRUE,ke_5500,id_ke),
    ('KE-5502','Office Furniture & Equipment','أثاث ومعدات مكتبية','expense','supplies',TRUE,ke_5500,id_ke),
    ('KE-5503','Vehicles','مركبات','expense','supplies',TRUE,ke_5500,id_ke),
    ('KE-5601','Indirect Cost Rate Charge','رسوم معدل التكاليف غير المباشرة','expense','indirect',TRUE,ke_5600,id_ke),
    ('KE-5602','Management Fee','رسوم الإدارة','expense','indirect',TRUE,ke_5600,id_ke);

  RAISE NOTICE 'COA seeding complete: Rwanda, Qatar, USA, Kenya.';
END $$;
