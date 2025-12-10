# Real-time Setup Guide

## Why You Still Need to Refresh

If you're still having to refresh your app, it's likely because **Realtime replication is not enabled** for your tables in Supabase. This is a common issue and easy to fix!

## ✅ Step-by-Step: Enable Realtime in Supabase

### 1. Go to Supabase Dashboard
- Open your Supabase project dashboard
- Navigate to **Database** → **Replication**

### 2. Enable Replication for Each Table

You need to enable replication for these tables:

**Core Tables:**
- ✅ `projects`
- ✅ `project_activities`
- ✅ `sub_activities`
- ✅ `mmp_files`
- ✅ `mmp_site_entries`
- ✅ `wallets`
- ✅ `wallet_transactions`
- ✅ `withdrawal_requests`
- ✅ `notifications`
- ✅ `user_roles`

**How to enable:**
1. In the Replication page, you'll see a list of all your tables
2. Find each table from the list above
3. Toggle the switch to **ON** (enable replication)
4. Repeat for all tables you want real-time updates for

### 3. Verify It's Working

After enabling replication:

1. **Open your browser console** (F12)
2. **Look for these messages:**
   - ✅ `Projects real-time subscription active`
   - ✅ `MMP files real-time subscription active`
   - ✅ `Forwarded MMP files real-time subscription active`

3. **If you see errors like:**
   - ❌ `CHANNEL_ERROR` - Replication is not enabled
   - ⏱️ `TIMED_OUT` - Network/connection issue

### 4. Test Real-time Updates

1. Open your app in **two browser tabs**
2. In Tab 1: Make a change (create/update a project, MMP file, etc.)
3. In Tab 2: The change should appear **automatically without refreshing**

## 🔍 Troubleshooting

### Issue: Still seeing "CHANNEL_ERROR" in console

**Solution:**
1. Double-check that replication is enabled in Supabase dashboard
2. Make sure you're using the correct Supabase project
3. Check your browser console for detailed error messages

### Issue: Subscriptions connect but no updates

**Possible causes:**
1. **Row Level Security (RLS) policies** might be blocking events
   - Check your RLS policies allow the user to see changes
   - Test with a user that has proper permissions

2. **Network/Firewall issues**
   - Check if WebSocket connections are blocked
   - Try a different network

### Issue: Works sometimes but not always

**Possible causes:**
1. **Connection drops** - Supabase will auto-reconnect, but there might be a delay
2. **Free tier limitations** - Free tier has some rate limits, but realtime should still work

## 📊 Free Tier Limitations

**Supabase Free Tier:**
- ✅ Realtime subscriptions **ARE supported**
- ✅ Works with WebSocket connections
- ⚠️ Has connection limits (200 concurrent connections)
- ⚠️ Has message rate limits

**Vercel Free Tier:**
- ✅ No impact on realtime subscriptions
- ✅ WebSocket connections work fine
- ⚠️ Only affects hosting, not realtime functionality

## 🎯 Quick Checklist

- [ ] Enabled replication for `projects` table
- [ ] Enabled replication for `project_activities` table
- [ ] Enabled replication for `sub_activities` table
- [ ] Enabled replication for `mmp_files` table
- [ ] Enabled replication for `mmp_site_entries` table
- [ ] Checked browser console for subscription status
- [ ] Tested with two browser tabs
- [ ] Verified changes appear without refresh

## 🚀 After Setup

Once replication is enabled:
- Your app will update **automatically** when data changes
- No more manual refreshing needed!
- Changes appear in real-time across all connected clients

## Need Help?

If you're still having issues after enabling replication:
1. Check the browser console for specific error messages
2. Verify your Supabase project URL and keys are correct
3. Make sure your RLS policies allow the operations you're testing

