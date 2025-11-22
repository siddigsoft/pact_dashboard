# Wallet System Migration Guide

## 🎯 Overview

This migration updates your PACT wallet system from single-currency to multi-currency support while adding new features:

- ✅ Multi-currency wallet support (stores balances as JSONB)
- ✅ Withdrawal requests with supervisor approval
- ✅ Site visit cost tracking (SDG-based)
- ✅ Enhanced transaction system
- ✅ Automatic wallet creation for new users

---

## 📋 Migration Steps

### **Step 1: Backup Your Database**

Before running any migration, create a backup in Supabase:
1. Go to Supabase Dashboard → Database → Backups
2. Click "Create Backup"
3. Wait for confirmation

### **Step 2: Run the Migration**

1. Go to Supabase Dashboard → SQL Editor
2. Click "New Query"
3. Copy the contents of `wallet_system_migration.sql`
4. Paste into the SQL Editor
5. Click **"Run"** button
6. Wait for "Success" message (should take 5-10 seconds)

### **Step 3: Verify Migration**

Check that new tables exist:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('wallets', 'withdrawal_requests', 'site_visit_costs');
```

You should see all 3 tables listed.

### **Step 4: Refresh Schema Cache**

1. Go to Supabase Dashboard → Settings → API
2. Click **"Reload Schema"** button
3. Wait 10 seconds

### **Step 5: Test the Wallet**

1. Refresh your PACT app
2. Navigate to Wallet page
3. Verify wallet loads without errors
4. Check that all tabs display correctly

---

## 🔄 What Changed

### **Wallets Table**
```
BEFORE:
- currency: text ('SDG')
- balance_cents: bigint
- total_earned_cents: bigint
- total_paid_out_cents: bigint

AFTER:
- balances: jsonb ({ "SDG": 0 })
- total_earned: numeric
- total_withdrawn: numeric
```

### **New Tables Created**
1. `withdrawal_requests` - Approval workflow for withdrawals
2. `site_visit_costs` - Track site visit expenses

### **Updated Tables**
- `wallet_transactions` - Enhanced with new fields

---

## 🚨 Rollback (If Needed)

If something goes wrong:
1. Run `wallet_system_rollback.sql` in SQL Editor
2. This restores the old schema from backup
3. Contact support if issues persist

---

## ✅ Post-Migration Checklist

- [ ] Backup created successfully
- [ ] Migration ran without errors
- [ ] All 3 tables exist in database
- [ ] Schema cache refreshed
- [ ] Wallet page loads in PACT app
- [ ] No console errors
- [ ] Test withdrawal request creation
- [ ] Test site visit cost assignment

---

## 📞 Need Help?

If you encounter issues:
1. Check browser console for errors (F12)
2. Verify Supabase connection
3. Review migration logs in SQL Editor
4. Run rollback if needed

**Migration Version:** 1.0.0  
**Date:** November 22, 2025  
**Compatibility:** PACT Dashboard v2.0+
