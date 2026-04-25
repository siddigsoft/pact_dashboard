-- =============================================================================
-- PACT Accounting — Phase 1 Sprint 1.1 · Sudan Chart-of-Accounts seed
-- =============================================================================
-- Apply AFTER 20260501_acct_phase1_sprint1_1.sql.
-- Loads ~80 postable accounts under the 7 root chapter headers.
-- Idempotent on `code` (uses on conflict do nothing).
-- Bilingual EN + AR per signed default A2 + §4.21-a.
-- =============================================================================

begin;

-- Convenience: capture parent header IDs in a CTE pattern via temp insert
-- We use code-based parent_id resolution for clarity.

-- ----- 1xxx ASSETS -----
insert into public.acct_accounts (code, name_en, name_ar, account_type, subtype, parent_id, is_postable) values
  ('1100','Cash on Hand',                 'النقدية في الصندوق',          'asset','current_asset',     (select id from public.acct_accounts where code='1000'), true),
  ('1110','Petty Cash',                   'العهدة المستديمة',            'asset','current_asset',     (select id from public.acct_accounts where code='1000'), true),
  ('1200','Cash at Bank — SDG',           'النقدية في البنك — جنيه',     'asset','current_asset',     (select id from public.acct_accounts where code='1000'), true),
  ('1210','Cash at Bank — USD',           'النقدية في البنك — دولار',    'asset','current_asset',     (select id from public.acct_accounts where code='1000'), true),
  ('1220','Cash at Bank — EUR',           'النقدية في البنك — يورو',     'asset','current_asset',     (select id from public.acct_accounts where code='1000'), true),
  ('1300','Mobile Money Wallet — EBS',    'محفظة EBS',                   'asset','current_asset',     (select id from public.acct_accounts where code='1000'), true),
  ('1310','Mobile Money Wallet — M-Pesa', 'محفظة M-Pesa',                'asset','current_asset',     (select id from public.acct_accounts where code='1000'), true),
  ('1400','Accounts Receivable — Donors', 'الذمم المدينة — المانحون',    'asset','current_asset',     (select id from public.acct_accounts where code='1000'), true),
  ('1410','Accounts Receivable — Other',  'ذمم مدينة أخرى',              'asset','current_asset',     (select id from public.acct_accounts where code='1000'), true),
  ('1500','Staff Advances',               'سلف الموظفين',                'asset','current_asset',     (select id from public.acct_accounts where code='1000'), true),
  ('1510','Travel Advances',              'سلف السفر',                   'asset','current_asset',     (select id from public.acct_accounts where code='1000'), true),
  ('1520','Procurement Advances',         'سلف المشتريات',               'asset','current_asset',     (select id from public.acct_accounts where code='1000'), true),
  ('1600','Inventory',                    'المخزون',                     'asset','current_asset',     (select id from public.acct_accounts where code='1000'), true),
  ('1700','Prepaid Expenses',             'المصروفات المدفوعة مقدمًا',    'asset','current_asset',     (select id from public.acct_accounts where code='1000'), true),
  ('1800','Office Equipment',             'معدات المكتب',                'asset','non_current_asset', (select id from public.acct_accounts where code='1000'), true),
  ('1810','Vehicles',                     'المركبات',                    'asset','non_current_asset', (select id from public.acct_accounts where code='1000'), true),
  ('1820','Furniture & Fixtures',         'أثاث وتجهيزات',               'asset','non_current_asset', (select id from public.acct_accounts where code='1000'), true),
  ('1850','Accumulated Depreciation',     'مجمع الإهلاك',                'asset','non_current_asset', (select id from public.acct_accounts where code='1000'), true)
on conflict (code) do nothing;

-- ----- 2xxx LIABILITIES -----
insert into public.acct_accounts (code, name_en, name_ar, account_type, subtype, parent_id, is_postable) values
  ('2100','Accounts Payable — Vendors',   'الذمم الدائنة — الموردون',    'liability','current_liability',(select id from public.acct_accounts where code='2000'), true),
  ('2110','Accrued Expenses',             'المصروفات المستحقة',          'liability','current_liability',(select id from public.acct_accounts where code='2000'), true),
  ('2200','Payroll Payable',              'الرواتب المستحقة',            'liability','current_liability',(select id from public.acct_accounts where code='2000'), true),
  ('2210','PAYE Withheld',                'ضريبة دخل العاملين',          'liability','current_liability',(select id from public.acct_accounts where code='2000'), true),
  ('2220','Pension Contributions Payable','اشتراكات المعاش',             'liability','current_liability',(select id from public.acct_accounts where code='2000'), true),
  ('2230','Zakat Payable',                'الزكاة',                      'liability','current_liability',(select id from public.acct_accounts where code='2000'), true),
  ('2240','EOSB Provision',               'مخصص نهاية الخدمة',           'liability','non_current_liability',(select id from public.acct_accounts where code='2000'), true),
  ('2250','Leave Provision',              'مخصص الإجازات',               'liability','current_liability',(select id from public.acct_accounts where code='2000'), true),
  ('2300','Withholding Tax Payable',      'ضريبة الاستقطاع',             'liability','current_liability',(select id from public.acct_accounts where code='2000'), true),
  ('2310','VAT Payable',                  'ضريبة القيمة المضافة',        'liability','current_liability',(select id from public.acct_accounts where code='2000'), true),
  ('2400','Deferred Donor Revenue',       'إيرادات مانحين مؤجلة',        'liability','current_liability',(select id from public.acct_accounts where code='2000'), true),
  ('2500','Loans Payable',                'القروض',                     'liability','non_current_liability',(select id from public.acct_accounts where code='2000'), true)
on conflict (code) do nothing;

-- ----- 3xxx EQUITY / NET ASSETS -----
insert into public.acct_accounts (code, name_en, name_ar, account_type, subtype, parent_id, is_postable) values
  ('3100','Net Assets — Without Restriction','صافي الأصول — غير مقيدة',     'equity','contributed_equity',(select id from public.acct_accounts where code='3000'), true),
  ('3200','Net Assets — With Restriction',   'صافي الأصول — مقيدة',         'equity','contributed_equity',(select id from public.acct_accounts where code='3000'), true),
  ('3300','Net Assets — Board Designated',   'صافي الأصول — مخصصة من المجلس','equity','contributed_equity',(select id from public.acct_accounts where code='3000'), true),
  ('3400','Retained Surplus / Deficit',      'الفائض المرحل',               'equity','retained_equity',   (select id from public.acct_accounts where code='3000'), true),
  ('3500','Current Year Surplus / Deficit',  'فائض/عجز السنة الحالية',      'equity','retained_equity',   (select id from public.acct_accounts where code='3000'), true)
on conflict (code) do nothing;

-- ----- 4xxx REVENUE -----
insert into public.acct_accounts (code, name_en, name_ar, account_type, subtype, parent_id, is_postable) values
  ('4100','Donor Grant Revenue',          'إيرادات منح المانحين',         'revenue','operating_revenue',(select id from public.acct_accounts where code='4000'), true),
  ('4110','Individual Contributions',     'تبرعات الأفراد',              'revenue','operating_revenue',(select id from public.acct_accounts where code='4000'), true),
  ('4120','Corporate Contributions',      'تبرعات الشركات',              'revenue','operating_revenue',(select id from public.acct_accounts where code='4000'), true),
  ('4130','Foundation Contributions',     'تبرعات المؤسسات',             'revenue','operating_revenue',(select id from public.acct_accounts where code='4000'), true),
  ('4140','Government Contributions',     'تبرعات حكومية',               'revenue','operating_revenue',(select id from public.acct_accounts where code='4000'), true),
  ('4150','In-Kind Contributions',        'تبرعات عينية',                'revenue','operating_revenue',(select id from public.acct_accounts where code='4000'), true),
  ('4200','Programme Service Fees',       'رسوم خدمات البرامج',          'revenue','operating_revenue',(select id from public.acct_accounts where code='4000'), true),
  ('4300','Cost-share / Match Income',    'إيرادات مشاركة التكلفة',      'revenue','operating_revenue',(select id from public.acct_accounts where code='4000'), true),
  ('4400','Interest Income',              'دخل الفوائد',                 'revenue','non_operating_revenue',(select id from public.acct_accounts where code='4000'), true),
  ('4500','FX Gain',                      'أرباح فروق العملة',           'revenue','non_operating_revenue',(select id from public.acct_accounts where code='4000'), true),
  ('4600','Other Income',                 'إيرادات أخرى',                'revenue','non_operating_revenue',(select id from public.acct_accounts where code='4000'), true),
  ('4900','Released from Restriction',    'محرر من القيود',              'revenue','operating_revenue',(select id from public.acct_accounts where code='4000'), true)
on conflict (code) do nothing;

-- ----- 5xxx PROGRAM EXPENSE -----
insert into public.acct_accounts (code, name_en, name_ar, account_type, subtype, parent_id, is_postable) values
  ('5100','Programme Salaries',           'رواتب البرامج',               'expense','program_expense',(select id from public.acct_accounts where code='5000'), true),
  ('5110','Programme Benefits',           'استحقاقات البرامج',           'expense','program_expense',(select id from public.acct_accounts where code='5000'), true),
  ('5200','Programme Supplies',           'مستلزمات البرامج',            'expense','program_expense',(select id from public.acct_accounts where code='5000'), true),
  ('5210','Programme Materials',          'مواد البرامج',                'expense','program_expense',(select id from public.acct_accounts where code='5000'), true),
  ('5300','Programme Travel',             'سفر البرامج',                 'expense','program_expense',(select id from public.acct_accounts where code='5000'), true),
  ('5310','Per Diem & Subsistence',       'بدل إقامة وإعاشة',            'expense','program_expense',(select id from public.acct_accounts where code='5000'), true),
  ('5320','Training & Workshops',         'تدريب وورش عمل',              'expense','program_expense',(select id from public.acct_accounts where code='5000'), true),
  ('5400','Beneficiary Cash Transfers',   'تحويلات نقدية للمستفيدين',    'expense','program_expense',(select id from public.acct_accounts where code='5000'), true),
  ('5410','Beneficiary Vouchers',         'قسائم المستفيدين',            'expense','program_expense',(select id from public.acct_accounts where code='5000'), true),
  ('5500','Sub-grants & Sub-awards',      'منح فرعية',                   'expense','program_expense',(select id from public.acct_accounts where code='5000'), true),
  ('5600','Programme Consultants',        'استشاريو البرامج',            'expense','program_expense',(select id from public.acct_accounts where code='5000'), true),
  ('5700','Programme Vehicle & Fuel',     'مركبات ووقود البرامج',        'expense','program_expense',(select id from public.acct_accounts where code='5000'), true),
  ('5800','Programme Communications',     'اتصالات البرامج',             'expense','program_expense',(select id from public.acct_accounts where code='5000'), true),
  ('5900','Programme Depreciation',       'إهلاك أصول البرامج',          'expense','program_expense',(select id from public.acct_accounts where code='5000'), true)
on conflict (code) do nothing;

-- ----- 6xxx MANAGEMENT EXPENSE -----
insert into public.acct_accounts (code, name_en, name_ar, account_type, subtype, parent_id, is_postable) values
  ('6100','Management Salaries',          'رواتب الإدارة',               'expense','mng_expense',(select id from public.acct_accounts where code='6000'), true),
  ('6110','Management Benefits',          'استحقاقات الإدارة',           'expense','mng_expense',(select id from public.acct_accounts where code='6000'), true),
  ('6200','Office Rent',                  'إيجار المكتب',                'expense','mng_expense',(select id from public.acct_accounts where code='6000'), true),
  ('6210','Office Utilities',             'مرافق المكتب',                'expense','mng_expense',(select id from public.acct_accounts where code='6000'), true),
  ('6220','Office Supplies',              'لوازم المكتب',                'expense','mng_expense',(select id from public.acct_accounts where code='6000'), true),
  ('6300','Audit & Accounting Fees',      'أتعاب المراجعة',              'expense','mng_expense',(select id from public.acct_accounts where code='6000'), true),
  ('6310','Legal Fees',                   'أتعاب قانونية',               'expense','mng_expense',(select id from public.acct_accounts where code='6000'), true),
  ('6320','Bank Charges',                 'رسوم بنكية',                  'expense','mng_expense',(select id from public.acct_accounts where code='6000'), true),
  ('6400','IT & Software Subscriptions',  'تكنولوجيا واشتراكات',         'expense','mng_expense',(select id from public.acct_accounts where code='6000'), true),
  ('6500','Insurance',                    'التأمين',                     'expense','mng_expense',(select id from public.acct_accounts where code='6000'), true),
  ('6600','Management Travel',            'سفر الإدارة',                 'expense','mng_expense',(select id from public.acct_accounts where code='6000'), true),
  ('6700','Repairs & Maintenance',        'صيانة وإصلاحات',              'expense','mng_expense',(select id from public.acct_accounts where code='6000'), true),
  ('6800','Management Communications',    'اتصالات الإدارة',             'expense','mng_expense',(select id from public.acct_accounts where code='6000'), true),
  ('6900','FX Loss',                      'خسائر فروق العملة',           'expense','other_expense',(select id from public.acct_accounts where code='6000'), true),
  ('6950','Management Depreciation',      'إهلاك أصول الإدارة',          'expense','mng_expense',(select id from public.acct_accounts where code='6000'), true)
on conflict (code) do nothing;

-- ----- 7xxx FUNDRAISING EXPENSE -----
insert into public.acct_accounts (code, name_en, name_ar, account_type, subtype, parent_id, is_postable) values
  ('7100','Fundraising Staff Salaries',   'رواتب جمع التبرعات',          'expense','fundraising_expense',(select id from public.acct_accounts where code='7000'), true),
  ('7200','Fundraising Events',           'فعاليات جمع التبرعات',        'expense','fundraising_expense',(select id from public.acct_accounts where code='7000'), true),
  ('7300','Marketing & Communications',   'التسويق والاتصالات',          'expense','fundraising_expense',(select id from public.acct_accounts where code='7000'), true),
  ('7400','Fundraising Printing',         'طباعة جمع التبرعات',          'expense','fundraising_expense',(select id from public.acct_accounts where code='7000'), true),
  ('7500','Donor Stewardship',            'العناية بالمانحين',           'expense','fundraising_expense',(select id from public.acct_accounts where code='7000'), true)
on conflict (code) do nothing;

commit;

-- =============================================================================
-- Verification
-- =============================================================================
-- select account_type, count(*) from public.acct_accounts
--   where is_postable = true group by 1 order by 1;
-- Expected (approximate):
--   asset      18
--   liability  12
--   equity      5
--   revenue    12
--   expense    34
