# HR Task #81 — Compliance Fields, Dependents & IT Accounts — Runbook

## Migration
Run **once** in Supabase SQL Editor (Dashboard → SQL Editor → New query):

```
supabase/migrations/20250715_hr_task81_compliance_fields.sql
```

### What it does
1. Adds `tax_id`, `tax_id_type`, `visa_type`, `visa_expiry`, `visa_number` to `hr_employee_personal`
2. Adds `probation_end_date`, `working_pattern` to `profiles`
3. Creates `hr_employee_dependents` table (CRUD for family/beneficiaries)
4. Creates `hr_it_accounts` table (CRUD for provisioned system accounts)
5. Enables RLS on both new tables with admin-all + self-read policies

### Post-migration verification
```sql
-- Verify new columns
SELECT column_name FROM information_schema.columns
WHERE table_name = 'hr_employee_personal'
  AND column_name IN ('tax_id','tax_id_type','visa_type','visa_expiry','visa_number');

SELECT column_name FROM information_schema.columns
WHERE table_name = 'profiles'
  AND column_name IN ('probation_end_date','working_pattern');

-- Verify new tables
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('hr_employee_dependents','hr_it_accounts');
```

## Edge Function: hr-document-expiry-alerts

**Purpose:** Scans for expiring passports, visas, and probation periods, and inserts in-app notifications for HR admins.

**Schedule:** Deploy and set up a daily cron (e.g., 07:00 UTC) using Supabase pg_cron or the edge function scheduler.

### Deploy
```bash
supabase functions deploy hr-document-expiry-alerts --no-verify-jwt
```

### Manual trigger (testing)
```bash
curl -X POST https://<PROJECT_REF>.supabase.co/functions/v1/hr-document-expiry-alerts \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
```

### Thresholds
- **Passport / Visa expiry:** alerts at 90, 60, 30, 14, 7 days and on expiry
- **Probation end:** alerts at 14 and 7 days before end date

### Notification upsert key
`recipient_id + entity_id + event_type` — deduplicates so re-runs don't flood inboxes.

## UI Changes

### Employment Tab (UserDetail)
- **Probation End Date** — date picker; shows amber warning within 14 days
- **Working Pattern** — select: Office / Hybrid / Remote / Field / Flexible

### Personal Tab (EmployeePersonalTab)
- **Compliance & Work Authorization** section — Tax ID Type + Number, Visa/Permit Type + Number + Expiry with color badge (amber ≤30d, red if expired)

### Background Group — new Dependents tab
- CRUD for family dependents and beneficiaries
- Fields: Full Name, Relationship, DOB (age calculated), Gender, National ID, Beneficiary flag, Health Insurance coverage, Notes

### System Group — new IT Accounts tab
- CRUD for provisioned system accounts per employee
- Fields: System/Application, Username, Account Type, Status (Active / Pending / Suspended / Deprovisioned), Provisioned Date, Deprovisioned Date, Notes

### Skills & Languages tab
- **Skills Gap Analysis** — collapsible panel; select any position from Positions page (must have `skills_required` defined); shows % match, covered skills (green) vs. missing skills (red)
