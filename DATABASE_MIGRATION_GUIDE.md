# 🗄️ PACT Database Migration Guide

## ✅ Current Status (Updated: November 23, 2025)

**PRIMARY DATABASE:** Supabase PostgreSQL  
**PROJECT ID:** `abznugnirnlrqnnfkein`  
**ALL APPLICATION DATA:** Stored in Supabase

---

## 🎉 CLASSIFICATION SYSTEM - SUCCESSFULLY INSTALLED ✅

### Migration Completed
- ✅ **Date:** November 23, 2025
- ✅ **Tables Created:** `user_classifications`, `classification_fee_structures`
- ✅ **Fee Structures:** 9 combinations installed (3 levels × 3 roles)
- ✅ **Status:** Active and working

### What Was Fixed
The classification tables had incorrect column names causing errors:
- ❌ **Old columns:** `valid_from`, `valid_until` (or missing)
- ✅ **New columns:** `effective_from`, `effective_until` (matches app expectations)

**Migration file used:** `database/migrations/02_fix_classification_tables.sql`

---

## 📊 Classification System Overview

### **Table 1: `user_classifications`**
Stores A/B/C level assignments for team members

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | Links to profiles |
| classification_level | enum | 'A', 'B', or 'C' |
| role_scope | enum | 'coordinator', 'dataCollector', 'supervisor' |
| effective_from | timestamptz | Start date |
| effective_until | timestamptz | End date (NULL = ongoing) |
| has_retainer | boolean | Monthly retainer enabled? |
| retainer_amount_cents | integer | Monthly amount in cents |
| is_active | boolean | Active status |

### **Table 2: `classification_fee_structures`**
Fee rates for each level+role combination (9 total)

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| classification_level | enum | 'A', 'B', or 'C' |
| role_scope | enum | Role type |
| site_visit_base_fee_cents | integer | Base fee (SDG cents) |
| site_visit_transport_fee_cents | integer | Transport fee (SDG cents) |
| complexity_multiplier | decimal | Adjustment factor |
| effective_from | timestamptz | Valid from date |
| effective_until | timestamptz | Valid until date |
| is_active | boolean | Active status |

---

## 💰 Fee Structures Installed (9 Combinations)

| Level | Role | Base Fee | Transport | Complexity | Notes |
|-------|------|----------|-----------|------------|-------|
| **A** | Data Collector | 500.00 SDG | 300.00 SDG | 1.2x | Senior |
| **B** | Data Collector | 350.00 SDG | 250.00 SDG | 1.0x | Regular |
| **C** | Data Collector | 250.00 SDG | 200.00 SDG | 0.8x | Junior |
| **A** | Coordinator | 600.00 SDG | 350.00 SDG | 1.3x | Senior |
| **B** | Coordinator | 450.00 SDG | 300.00 SDG | 1.1x | Regular |
| **C** | Coordinator | 350.00 SDG | 250.00 SDG | 0.9x | Junior |
| **A** | Supervisor | 700.00 SDG | 400.00 SDG | 1.4x | Senior |
| **B** | Supervisor | 550.00 SDG | 350.00 SDG | 1.2x | Regular |
| **C** | Supervisor | 450.00 SDG | 300.00 SDG | 1.0x | Junior |

---

## 🎯 How to Use Classifications

### **1. Assign Classifications to Users**

Go to **Users page** and click on any user to assign their A/B/C level.

### **2. View Fee Structures**

Go to **Finance page** → Classifications tab to see all fee rates.

### **3. Site Visit Costs**

When creating site visits, fees are automatically calculated based on:
- User's classification level (A/B/C)
- User's role (coordinator/dataCollector/supervisor)
- Complexity multiplier
- Base + Transport fees

### **4. Monthly Retainers**

Enable retainer for users who should receive monthly payments regardless of site visits.

---

## 🔒 Security (RLS Policies)

**Read Access:** Public (all authenticated users can view)  
**Write Access:** Admin, ICT, Financial Admin only

---

## 🚀 Future Database Operations

### **CRITICAL RULE**
**ALL database operations MUST use Supabase, NOT local PostgreSQL**

### **How to Run Future Migrations**

1. Create SQL file in `database/migrations/`
2. Open **Supabase Dashboard** → **SQL Editor**
3. Copy/paste and run the SQL
4. Document in this file
5. Update migration history table below

### **Never Use**
- ❌ Local `execute_sql_tool` (connects to neondb, not Supabase)
- ❌ Local `db:push` without Supabase link
- ❌ Manual table creation in local database

### **Always Use**
- ✅ Supabase Dashboard SQL Editor
- ✅ Supabase client in application code (`src/integrations/supabase/client.ts`)
- ✅ Migration files in `database/migrations/`

---

## 📝 Migration History

| Date | Migration | Status | Notes |
|------|-----------|--------|-------|
| 2025-11-23 | `01_check_supabase_schema.sql` | ✅ Completed | Diagnostic query |
| 2025-11-23 | `02_fix_classification_tables.sql` | ✅ Completed | Fixed column names, installed 9 fee structures |

---

## 🆘 Troubleshooting

### ✅ Classifications Working
If you see classification badges on Users page and no console errors, everything is working!

### Error: "column does not exist"
→ Already fixed! Migration completed successfully.

### Classifications not showing in UI
→ Hard refresh browser (Ctrl+Shift+R)  
→ Check if user has classification assigned  
→ Verify RLS policies allow your role to view data

### Want to modify fee structures
→ Go to Supabase Dashboard → Table Editor → `classification_fee_structures`  
→ Or use SQL Editor to run UPDATE queries

---

## 📞 Quick Links

**Supabase Dashboard:** https://supabase.com/dashboard/project/abznugnirnlrqnnfkein  
**SQL Editor:** https://supabase.com/dashboard/project/abznugnirnlrqnnfkein/sql  
**Table Editor:** https://supabase.com/dashboard/project/abznugnirnlrqnnfkein/editor  
**Classifications Table:** https://supabase.com/dashboard/project/abznugnirnlrqnnfkein/editor/classification_fee_structures

---

## ✨ Benefits Now Active

With the classification system installed, you now have:

1. **🏆 User Levels:** Assign A/B/C classifications to team members
2. **💰 Differential Fees:** Automatic fee calculation based on level+role (9 combinations)
3. **📊 Financial Tracking:** Track costs by classification level
4. **🔄 Monthly Retainers:** Optional recurring payments for senior staff
5. **📈 Analytics:** Budget analysis by team level and role
6. **🎯 Fair Compensation:** Different pay scales for different experience levels

---

## 🎓 Next Steps

1. ✅ **Assign classifications** to your team members (Users page)
2. ✅ **Test fee calculation** by creating a site visit
3. ✅ **Review fee structures** in Finance page
4. ✅ **Set up retainers** for senior staff (optional)
5. ✅ **Export reports** with classification breakdowns

---

## 📚 Additional Documentation

### Original Migration Files
- ✅ Site visits compatibility: Already working (see existing guide sections below)
- ✅ Budget system: Already installed and working
- ✅ Wallet system: Already installed and working

---

## Legacy Documentation (Historical Reference)

### Site Visits & MMP Compatibility

The PACT application works with both `site_visits` and `mmp_site_entries` tables through an adapter pattern. This ensures backwards compatibility regardless of database schema.

**Data Flow:**
```
site_visits (traditional) → Primary source
    ↓ (if empty or missing)
mmp_site_entries → Fallback via adapter
```

### Database Schema (33 Tables Total)

Core tables in Supabase:
- `profiles` - User accounts
- `projects` - Project management
- `mmp_files` - Monthly Monitoring Plans
- `mmp_site_entries` - Site visit details from MMPs
- `site_visits` - Standalone visit tracking
- `user_classifications` - **NEW: A/B/C levels**
- `classification_fee_structures` - **NEW: Fee rates**
- `project_budgets`, `mmp_budgets` - Budget tracking
- `wallet_balances`, `wallet_transactions` - Payment system
- `user_roles`, `dashboard_settings` - Configuration
- And 20+ more tables for chat, monitoring, reports, etc.

---

**🎉 Classification system is live and ready to use!**
