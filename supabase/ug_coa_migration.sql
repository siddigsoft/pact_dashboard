-- =====================================================================
-- Uganda (UG) — Full Chart of Accounts  |  Currency: UGX
-- Run AFTER: coa_rw_qa_us_ke_migration.sql  (enum subtypes must exist)
-- Run AFTER: profile_country_migration.sql   (profiles.default_country_id)
-- =====================================================================

DO $$
DECLARE
  id_ug UUID;

  -- Level-1 header ids
  ug_1000 UUID; ug_2000 UUID; ug_3000 UUID; ug_4000 UUID; ug_5000 UUID;

  -- Asset sub-headers
  ug_1100 UUID; ug_1200 UUID; ug_1300 UUID; ug_1400 UUID; ug_1500 UUID;

  -- Liability sub-headers
  ug_2100 UUID; ug_2200 UUID; ug_2300 UUID;

  -- Equity sub-headers
  ug_3100 UUID; ug_3200 UUID;

  -- Revenue sub-headers
  ug_4100 UUID; ug_4200 UUID;

  -- Expense sub-headers
  ug_5100 UUID; ug_5200 UUID; ug_5300 UUID; ug_5400 UUID; ug_5500 UUID; ug_5600 UUID;

BEGIN
  -- ── 0. Upsert Uganda in countries table ───────────────────────────
  INSERT INTO countries (code, name_en, name_ar, currency_code, currency_symbol, flag_emoji, is_active)
  VALUES ('UG','Uganda','أوغندا','UGX','USh','🇺🇬',TRUE)
  ON CONFLICT (code) DO UPDATE SET
    name_en         = EXCLUDED.name_en,
    currency_code   = EXCLUDED.currency_code,
    currency_symbol = EXCLUDED.currency_symbol,
    flag_emoji      = EXCLUDED.flag_emoji,
    is_active       = TRUE;

  SELECT id INTO id_ug FROM countries WHERE code = 'UG' LIMIT 1;

  -- ================================================================
  -- ████████████  UGANDA COA  ████████████
  -- ================================================================

  -- ── 1. Level-1 Headers ──────────────────────────────────────────
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,country_id)
  VALUES ('UG-1000','Assets','الأصول','asset','header',FALSE,id_ug)
  ON CONFLICT (code) DO NOTHING RETURNING id INTO ug_1000;
  IF ug_1000 IS NULL THEN SELECT id INTO ug_1000 FROM acct_accounts WHERE code='UG-1000'; END IF;

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,country_id)
  VALUES ('UG-2000','Liabilities','الالتزامات','liability','header',FALSE,id_ug)
  ON CONFLICT (code) DO NOTHING RETURNING id INTO ug_2000;
  IF ug_2000 IS NULL THEN SELECT id INTO ug_2000 FROM acct_accounts WHERE code='UG-2000'; END IF;

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,country_id)
  VALUES ('UG-3000','Net Assets / Equity','صافي الأصول','equity','header',FALSE,id_ug)
  ON CONFLICT (code) DO NOTHING RETURNING id INTO ug_3000;
  IF ug_3000 IS NULL THEN SELECT id INTO ug_3000 FROM acct_accounts WHERE code='UG-3000'; END IF;

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,country_id)
  VALUES ('UG-4000','Revenue & Grants','الإيرادات والمنح','revenue','header',FALSE,id_ug)
  ON CONFLICT (code) DO NOTHING RETURNING id INTO ug_4000;
  IF ug_4000 IS NULL THEN SELECT id INTO ug_4000 FROM acct_accounts WHERE code='UG-4000'; END IF;

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,country_id)
  VALUES ('UG-5000','Expenses','المصروفات','expense','header',FALSE,id_ug)
  ON CONFLICT (code) DO NOTHING RETURNING id INTO ug_5000;
  IF ug_5000 IS NULL THEN SELECT id INTO ug_5000 FROM acct_accounts WHERE code='UG-5000'; END IF;

  -- ── 2. Asset Sub-Headers ────────────────────────────────────────
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('UG-1100','Cash & Bank','النقد والبنك','asset','current_asset',FALSE,ug_1000,id_ug)
  ON CONFLICT (code) DO NOTHING RETURNING id INTO ug_1100;
  IF ug_1100 IS NULL THEN SELECT id INTO ug_1100 FROM acct_accounts WHERE code='UG-1100'; END IF;

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('UG-1200','Receivables','الذمم المدينة','asset','current_asset',FALSE,ug_1000,id_ug)
  ON CONFLICT (code) DO NOTHING RETURNING id INTO ug_1200;
  IF ug_1200 IS NULL THEN SELECT id INTO ug_1200 FROM acct_accounts WHERE code='UG-1200'; END IF;

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('UG-1300','Prepaid & Advances','المدفوعات المقدمة والسلف','asset','current_asset',FALSE,ug_1000,id_ug)
  ON CONFLICT (code) DO NOTHING RETURNING id INTO ug_1300;
  IF ug_1300 IS NULL THEN SELECT id INTO ug_1300 FROM acct_accounts WHERE code='UG-1300'; END IF;

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('UG-1400','Fixed Assets','الأصول الثابتة','asset','fixed_asset',FALSE,ug_1000,id_ug)
  ON CONFLICT (code) DO NOTHING RETURNING id INTO ug_1400;
  IF ug_1400 IS NULL THEN SELECT id INTO ug_1400 FROM acct_accounts WHERE code='UG-1400'; END IF;

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('UG-1500','Other Assets','أصول أخرى','asset','other_asset',FALSE,ug_1000,id_ug)
  ON CONFLICT (code) DO NOTHING RETURNING id INTO ug_1500;
  IF ug_1500 IS NULL THEN SELECT id INTO ug_1500 FROM acct_accounts WHERE code='UG-1500'; END IF;

  -- Cash & Bank leaf accounts
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('UG-1101','Petty Cash — Kampala','النقد الصغير كمبالا','asset','current_asset',TRUE,ug_1100,id_ug),
    ('UG-1102','Stanbic Bank — Operations Account','حساب العمليات — بنك ستانبك','asset','current_asset',TRUE,ug_1100,id_ug),
    ('UG-1103','Centenary Bank — Field Account','الحساب الميداني — بنك سنتيناري','asset','current_asset',TRUE,ug_1100,id_ug),
    ('UG-1104','DFCU Bank — USD Account','حساب دولار — بنك DFCU','asset','current_asset',TRUE,ug_1100,id_ug),
    ('UG-1105','Mobile Money Float','نقد موبايل ماني','asset','current_asset',TRUE,ug_1100,id_ug)
  ON CONFLICT (code) DO NOTHING;

  -- Receivables
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('UG-1201','Grants Receivable','ذمم المنح المدينة','asset','current_asset',TRUE,ug_1200,id_ug),
    ('UG-1202','Staff Advances Receivable','سلف الموظفين المدينة','asset','current_asset',TRUE,ug_1200,id_ug),
    ('UG-1203','Vendor Advances','سلف الموردين','asset','current_asset',TRUE,ug_1200,id_ug),
    ('UG-1204','VAT Receivable','ضريبة القيمة المضافة المستردة','asset','current_asset',TRUE,ug_1200,id_ug)
  ON CONFLICT (code) DO NOTHING;

  -- Prepaid & Advances
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('UG-1301','Prepaid Rent','إيجار مدفوع مقدماً','asset','current_asset',TRUE,ug_1300,id_ug),
    ('UG-1302','Prepaid Insurance','تأمين مدفوع مقدماً','asset','current_asset',TRUE,ug_1300,id_ug),
    ('UG-1303','Travel Advances','سلف السفر','asset','current_asset',TRUE,ug_1300,id_ug),
    ('UG-1304','Prepaid Subscriptions','اشتراكات مدفوعة مقدماً','asset','current_asset',TRUE,ug_1300,id_ug)
  ON CONFLICT (code) DO NOTHING;

  -- Fixed Assets
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('UG-1401','Vehicles','المركبات','asset','fixed_asset',TRUE,ug_1400,id_ug),
    ('UG-1402','Computer Equipment','معدات الحاسوب','asset','fixed_asset',TRUE,ug_1400,id_ug),
    ('UG-1403','Office Furniture & Equipment','أثاث ومعدات المكتب','asset','fixed_asset',TRUE,ug_1400,id_ug),
    ('UG-1404','Motorcycles / Field Bikes','دراجات ميدانية','asset','fixed_asset',TRUE,ug_1400,id_ug),
    ('UG-1405','Accumulated Depreciation','مجمع الاستهلاك','asset','fixed_asset',TRUE,ug_1400,id_ug)
  ON CONFLICT (code) DO NOTHING;

  -- Other Assets
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('UG-1501','Security Deposits','وديعة الضمان','asset','other_asset',TRUE,ug_1500,id_ug),
    ('UG-1502','Long-term Receivables','ذمم طويلة الأجل','asset','other_asset',TRUE,ug_1500,id_ug)
  ON CONFLICT (code) DO NOTHING;

  -- ── 3. Liability Sub-Headers ────────────────────────────────────
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('UG-2100','Accounts Payable','الذمم الدائنة','liability','current_liability',FALSE,ug_2000,id_ug)
  ON CONFLICT (code) DO NOTHING RETURNING id INTO ug_2100;
  IF ug_2100 IS NULL THEN SELECT id INTO ug_2100 FROM acct_accounts WHERE code='UG-2100'; END IF;

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('UG-2200','Accrued Liabilities & Statutory','الالتزامات المستحقة والقانونية','liability','current_liability',FALSE,ug_2000,id_ug)
  ON CONFLICT (code) DO NOTHING RETURNING id INTO ug_2200;
  IF ug_2200 IS NULL THEN SELECT id INTO ug_2200 FROM acct_accounts WHERE code='UG-2200'; END IF;

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('UG-2300','Deferred Revenue','الإيرادات المؤجلة','liability','current_liability',FALSE,ug_2000,id_ug)
  ON CONFLICT (code) DO NOTHING RETURNING id INTO ug_2300;
  IF ug_2300 IS NULL THEN SELECT id INTO ug_2300 FROM acct_accounts WHERE code='UG-2300'; END IF;

  -- Accounts Payable leaf accounts
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('UG-2101','Accounts Payable — Vendors','ذمم الموردين الدائنة','liability','current_liability',TRUE,ug_2100,id_ug),
    ('UG-2102','Accounts Payable — Staff','ذمم الموظفين الدائنة','liability','current_liability',TRUE,ug_2100,id_ug),
    ('UG-2103','Accounts Payable — Partners','ذمم الشركاء الدائنة','liability','current_liability',TRUE,ug_2100,id_ug)
  ON CONFLICT (code) DO NOTHING;

  -- Accrued Liabilities & Statutory (Uganda-specific: NSSF, PAYE, LST, VAT)
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('UG-2201','Accrued Payroll','رواتب مستحقة','liability','current_liability',TRUE,ug_2200,id_ug),
    ('UG-2202','NSSF Payable — Employee (5%)','NSSF مستحق — الموظف 5٪','liability','current_liability',TRUE,ug_2200,id_ug),
    ('UG-2203','NSSF Payable — Employer (10%)','NSSF مستحق — صاحب العمل 10٪','liability','current_liability',TRUE,ug_2200,id_ug),
    ('UG-2204','PAYE Payable','ضريبة الراتب PAYE مستحقة','liability','current_liability',TRUE,ug_2200,id_ug),
    ('UG-2205','Local Service Tax Payable','ضريبة الخدمة المحلية مستحقة','liability','current_liability',TRUE,ug_2200,id_ug),
    ('UG-2206','VAT Payable (18%)','ضريبة القيمة المضافة 18٪','liability','current_liability',TRUE,ug_2200,id_ug),
    ('UG-2207','Withholding Tax Payable','ضريبة الاستقطاع المستحقة','liability','current_liability',TRUE,ug_2200,id_ug),
    ('UG-2208','Loan Payable — Short-term','قرض مستحق قصير الأجل','liability','current_liability',TRUE,ug_2200,id_ug)
  ON CONFLICT (code) DO NOTHING;

  -- Deferred Revenue
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('UG-2301','Deferred Grant Revenue','إيرادات المنح المؤجلة','liability','current_liability',TRUE,ug_2300,id_ug),
    ('UG-2302','Deferred Service Revenue','إيرادات الخدمات المؤجلة','liability','current_liability',TRUE,ug_2300,id_ug)
  ON CONFLICT (code) DO NOTHING;

  -- ── 4. Equity / Net Assets ──────────────────────────────────────
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('UG-3100','Contributed Capital','رأس المال المُقدَّم','equity','header',FALSE,ug_3000,id_ug)
  ON CONFLICT (code) DO NOTHING RETURNING id INTO ug_3100;
  IF ug_3100 IS NULL THEN SELECT id INTO ug_3100 FROM acct_accounts WHERE code='UG-3100'; END IF;

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('UG-3200','Retained Results','النتائج المحتجزة','equity','header',FALSE,ug_3000,id_ug)
  ON CONFLICT (code) DO NOTHING RETURNING id INTO ug_3200;
  IF ug_3200 IS NULL THEN SELECT id INTO ug_3200 FROM acct_accounts WHERE code='UG-3200'; END IF;

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('UG-3101','Donor Contributions — Unrestricted','مساهمات المانحين غير المقيدة','equity','unrestricted',TRUE,ug_3100,id_ug),
    ('UG-3102','Donor Contributions — Restricted','مساهمات المانحين المقيدة','equity','restricted',TRUE,ug_3100,id_ug),
    ('UG-3103','Government Grants','منح حكومية','equity','unrestricted',TRUE,ug_3100,id_ug)
  ON CONFLICT (code) DO NOTHING;

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('UG-3201','Opening Balance Equity','رصيد الافتتاح','equity','retained_earnings',TRUE,ug_3200,id_ug),
    ('UG-3202','Retained Surplus / (Deficit)','الفائض / (العجز) المحتجز','equity','retained_earnings',TRUE,ug_3200,id_ug),
    ('UG-3203','Current Year Surplus / (Deficit)','فائض / عجز السنة الحالية','equity','retained_earnings',TRUE,ug_3200,id_ug)
  ON CONFLICT (code) DO NOTHING;

  -- ── 5. Revenue Sub-Headers ──────────────────────────────────────
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('UG-4100','Operating Revenue','الإيرادات التشغيلية','revenue','operating_revenue',FALSE,ug_4000,id_ug)
  ON CONFLICT (code) DO NOTHING RETURNING id INTO ug_4100;
  IF ug_4100 IS NULL THEN SELECT id INTO ug_4100 FROM acct_accounts WHERE code='UG-4100'; END IF;

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('UG-4200','Non-Operating Revenue','الإيرادات غير التشغيلية','revenue','non_operating_revenue',FALSE,ug_4000,id_ug)
  ON CONFLICT (code) DO NOTHING RETURNING id INTO ug_4200;
  IF ug_4200 IS NULL THEN SELECT id INTO ug_4200 FROM acct_accounts WHERE code='UG-4200'; END IF;

  -- Operating Revenue leaf accounts
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('UG-4101','Program Grants','منح البرامج','revenue','operating_revenue',TRUE,ug_4100,id_ug),
    ('UG-4102','Government Transfers','تحويلات حكومية','revenue','operating_revenue',TRUE,ug_4100,id_ug),
    ('UG-4103','Service & Training Fees','رسوم الخدمات والتدريب','revenue','operating_revenue',TRUE,ug_4100,id_ug),
    ('UG-4104','Consultancy Income','دخل الاستشارات','revenue','operating_revenue',TRUE,ug_4100,id_ug),
    ('UG-4105','Community Contributions (In-Kind)','مساهمات مجتمعية عينية','revenue','operating_revenue',TRUE,ug_4100,id_ug)
  ON CONFLICT (code) DO NOTHING;

  -- Non-Operating Revenue
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('UG-4201','Interest Income','دخل الفوائد','revenue','non_operating_revenue',TRUE,ug_4200,id_ug),
    ('UG-4202','Foreign Exchange Gain','مكاسب فروق العملة','revenue','other_income',TRUE,ug_4200,id_ug),
    ('UG-4203','Miscellaneous Income','دخل متنوع','revenue','other_income',TRUE,ug_4200,id_ug),
    ('UG-4204','Gain on Asset Disposal','مكاسب التخلص من الأصول','revenue','other_income',TRUE,ug_4200,id_ug)
  ON CONFLICT (code) DO NOTHING;

  -- ── 6. Expense Sub-Headers ──────────────────────────────────────
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('UG-5100','Personnel Costs','تكاليف الأفراد','expense','personnel',FALSE,ug_5000,id_ug)
  ON CONFLICT (code) DO NOTHING RETURNING id INTO ug_5100;
  IF ug_5100 IS NULL THEN SELECT id INTO ug_5100 FROM acct_accounts WHERE code='UG-5100'; END IF;

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('UG-5200','Program Expenses','مصروفات البرامج','expense','program_expense',FALSE,ug_5000,id_ug)
  ON CONFLICT (code) DO NOTHING RETURNING id INTO ug_5200;
  IF ug_5200 IS NULL THEN SELECT id INTO ug_5200 FROM acct_accounts WHERE code='UG-5200'; END IF;

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('UG-5300','Administrative Expenses','المصروفات الإدارية','expense','admin',FALSE,ug_5000,id_ug)
  ON CONFLICT (code) DO NOTHING RETURNING id INTO ug_5300;
  IF ug_5300 IS NULL THEN SELECT id INTO ug_5300 FROM acct_accounts WHERE code='UG-5300'; END IF;

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('UG-5400','Travel & Field Costs','تكاليف السفر والميدان','expense','travel',FALSE,ug_5000,id_ug)
  ON CONFLICT (code) DO NOTHING RETURNING id INTO ug_5400;
  IF ug_5400 IS NULL THEN SELECT id INTO ug_5400 FROM acct_accounts WHERE code='UG-5400'; END IF;

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('UG-5500','Depreciation & Amortization','الاستهلاك والإطفاء','expense','mng_expense',FALSE,ug_5000,id_ug)
  ON CONFLICT (code) DO NOTHING RETURNING id INTO ug_5500;
  IF ug_5500 IS NULL THEN SELECT id INTO ug_5500 FROM acct_accounts WHERE code='UG-5500'; END IF;

  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id)
  VALUES ('UG-5600','Other Expenses','مصروفات أخرى','expense','other_expense',FALSE,ug_5000,id_ug)
  ON CONFLICT (code) DO NOTHING RETURNING id INTO ug_5600;
  IF ug_5600 IS NULL THEN SELECT id INTO ug_5600 FROM acct_accounts WHERE code='UG-5600'; END IF;

  -- Personnel leaf accounts (Uganda statutory: NSSF 10% employer, PAYE, LST)
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('UG-5101','Salaries & Wages','الرواتب والأجور','expense','personnel',TRUE,ug_5100,id_ug),
    ('UG-5102','NSSF — Employer Contribution (10%)','اشتراك NSSF صاحب العمل 10٪','expense','personnel',TRUE,ug_5100,id_ug),
    ('UG-5103','Medical Allowance','بدل طبي','expense','personnel',TRUE,ug_5100,id_ug),
    ('UG-5104','Housing Allowance','بدل السكن','expense','personnel',TRUE,ug_5100,id_ug),
    ('UG-5105','Transport Allowance','بدل النقل','expense','personnel',TRUE,ug_5100,id_ug),
    ('UG-5106','Leave Allowance','بدل الإجازة','expense','personnel',TRUE,ug_5100,id_ug),
    ('UG-5107','Severance / Gratuity','مكافأة نهاية الخدمة','expense','personnel',TRUE,ug_5100,id_ug),
    ('UG-5108','Staff Training & Capacity Building','تدريب الموظفين وبناء القدرات','expense','personnel',TRUE,ug_5100,id_ug),
    ('UG-5109','Recruitment & Staff Welfare','التوظيف ورفاهية الموظفين','expense','personnel',TRUE,ug_5100,id_ug)
  ON CONFLICT (code) DO NOTHING;

  -- Program Expenses
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('UG-5201','Direct Program Costs','التكاليف المباشرة للبرنامج','expense','program_expense',TRUE,ug_5200,id_ug),
    ('UG-5202','Beneficiary Support & Transfers','دعم المستفيدين والتحويلات','expense','program_expense',TRUE,ug_5200,id_ug),
    ('UG-5203','Community Outreach & Mobilization','التواصل المجتمعي والتعبئة','expense','program_expense',TRUE,ug_5200,id_ug),
    ('UG-5204','Field Activities','الأنشطة الميدانية','expense','program_expense',TRUE,ug_5200,id_ug),
    ('UG-5205','Monitoring & Evaluation','الرصد والتقييم','expense','program_expense',TRUE,ug_5200,id_ug),
    ('UG-5206','Procurement — Goods','المشتريات - بضائع','expense','program_expense',TRUE,ug_5200,id_ug),
    ('UG-5207','Procurement — Services','المشتريات - خدمات','expense','program_expense',TRUE,ug_5200,id_ug)
  ON CONFLICT (code) DO NOTHING;

  -- Administrative Expenses
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('UG-5301','Office Rent','إيجار المكتب','expense','admin',TRUE,ug_5300,id_ug),
    ('UG-5302','Utilities (Electricity, Water)','المرافق (كهرباء، ماء)','expense','admin',TRUE,ug_5300,id_ug),
    ('UG-5303','Office Supplies & Stationery','مستلزمات مكتبية وقرطاسية','expense','supplies',TRUE,ug_5300,id_ug),
    ('UG-5304','Communication & Internet','الاتصالات والإنترنت','expense','admin',TRUE,ug_5300,id_ug),
    ('UG-5305','Professional Fees','أتعاب مهنية','expense','admin',TRUE,ug_5300,id_ug),
    ('UG-5306','Audit & Legal Fees','رسوم التدقيق والقانونية','expense','admin',TRUE,ug_5300,id_ug),
    ('UG-5307','Bank Charges','مصاريف بنكية','expense','admin',TRUE,ug_5300,id_ug),
    ('UG-5308','Insurance','التأمين','expense','admin',TRUE,ug_5300,id_ug),
    ('UG-5309','Maintenance & Repairs','الصيانة والإصلاح','expense','admin',TRUE,ug_5300,id_ug),
    ('UG-5310','IT & Software Costs','تكاليف تقنية المعلومات والبرمجيات','expense','admin',TRUE,ug_5300,id_ug),
    ('UG-5311','Security Services','خدمات الأمن','expense','admin',TRUE,ug_5300,id_ug)
  ON CONFLICT (code) DO NOTHING;

  -- Travel & Field Costs
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('UG-5401','Staff Travel — Domestic','سفر الموظفين داخلي','expense','travel',TRUE,ug_5400,id_ug),
    ('UG-5402','Staff Travel — International','سفر الموظفين دولي','expense','travel',TRUE,ug_5400,id_ug),
    ('UG-5403','Per Diem & Accommodation','بدل يومية وإقامة','expense','travel',TRUE,ug_5400,id_ug),
    ('UG-5404','Vehicle Fuel & Lubricants','وقود ومزيت المركبات','expense','travel',TRUE,ug_5400,id_ug),
    ('UG-5405','Vehicle Maintenance','صيانة المركبات','expense','travel',TRUE,ug_5400,id_ug),
    ('UG-5406','Visa & Immigration Fees','رسوم تأشيرة وهجرة','expense','travel',TRUE,ug_5400,id_ug),
    ('UG-5407','Motorcycle / Bike Running Costs','تكاليف تشغيل الدراجات','expense','travel',TRUE,ug_5400,id_ug)
  ON CONFLICT (code) DO NOTHING;

  -- Depreciation & Amortization
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('UG-5501','Depreciation — Vehicles','استهلاك المركبات','expense','mng_expense',TRUE,ug_5500,id_ug),
    ('UG-5502','Depreciation — Equipment','استهلاك المعدات','expense','mng_expense',TRUE,ug_5500,id_ug),
    ('UG-5503','Amortization','إطفاء','expense','mng_expense',TRUE,ug_5500,id_ug)
  ON CONFLICT (code) DO NOTHING;

  -- Other Expenses
  INSERT INTO acct_accounts (code,name_en,name_ar,account_type,subtype,is_postable,parent_id,country_id) VALUES
    ('UG-5601','Foreign Exchange Loss','خسائر فروق العملة','expense','other_expense',TRUE,ug_5600,id_ug),
    ('UG-5602','Withholding Tax Expense','مصروف ضريبة الاستقطاع','expense','other_expense',TRUE,ug_5600,id_ug),
    ('UG-5603','Local Service Tax Expense','مصروف ضريبة الخدمة المحلية','expense','other_expense',TRUE,ug_5600,id_ug),
    ('UG-5604','Penalty & Interest Expense','مصروف غرامات وفوائد','expense','other_expense',TRUE,ug_5600,id_ug),
    ('UG-5605','Miscellaneous Expenses','مصروفات متنوعة','expense','other_expense',TRUE,ug_5600,id_ug),
    ('UG-5606','Indirect Costs / Overhead','التكاليف غير المباشرة','expense','indirect',TRUE,ug_5600,id_ug)
  ON CONFLICT (code) DO NOTHING;

  RAISE NOTICE '✅ Uganda (UG/UGX) COA seeded successfully — % accounts inserted', (
    SELECT COUNT(*) FROM acct_accounts WHERE country_id = id_ug
  );

END $$;
