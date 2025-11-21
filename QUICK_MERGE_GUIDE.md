# Quick Guide: Merge Main into Master & Make Master Default

**3 Simple Steps to Complete Your Goal**

---

## 📋 **STEP 1: Merge Main into Master**

### **Using Replit Git Pane:**

1. **Open Git Pane** (🔀 icon in left sidebar)

2. **Switch to Master Branch:**
   - Click branch dropdown (shows "main")
   - Select **"master"**
   - Wait for files to load

3. **Merge Main into Master:**
   
   Since the Git pane might not have a visual merge button, you'll need to:
   
   **Option A: Cherry-pick the documentation commits**
   - While on master branch
   - The documentation files from main can be manually added
   
   **Option B: Manual file copy**
   - Switch to main branch
   - Note which documentation files exist
   - Switch back to master
   - Add those documentation files to master
   - Commit them

**What you'll have after merge:**
- All source code (481 files from master)
- All documentation (12 files from main)
- Total: ~493 files

---

## 📋 **STEP 2: Push Master to PACT-Siddig**

1. **In Git Pane (while on master branch):**
   - Click **"Push"** button
   - Select remote: **"siddig"**
   - Select branch: **"master"**

2. **Authenticate:**
   - Username: `siddigsoft`
   - Password: **Personal Access Token**
     - Get at: https://github.com/settings/tokens
     - Scope needed: ✅ `repo`

3. **Wait for completion** (5-10 minutes)

4. **Verify:**
   - Visit: https://github.com/siddigsoft/PACT-Siddig/tree/master
   - Should see `src/` directory and all files

---

## 📋 **STEP 3: Make Master Default on GitHub**

1. **Go to GitHub Repository:**
   - Visit: https://github.com/siddigsoft/PACT-Siddig

2. **Open Settings:**
   - Click **"Settings"** tab (top menu)

3. **Change Default Branch:**
   - Scroll to **"Default branch"** section
   - Click the switch icon (⇄) next to "main"
   - Select **"master"** from dropdown
   - Click **"Update"**
   - Confirm: **"I understand, update the default branch"**

4. **Done!** Master is now the default branch

---

## ✅ **Verification Checklist**

After all steps:

- [ ] Master branch has source code (src/, package.json)
- [ ] Master branch has documentation files
- [ ] Pushed master to PACT-Siddig successfully
- [ ] GitHub shows master branch exists
- [ ] GitHub default branch changed to master
- [ ] Visiting repo shows master by default

---

## 🎯 **What Happens:**

### **Before:**
- Default branch: `main` (12 docs files only)
- Master branch: Not on GitHub yet

### **After:**
- Default branch: `master` ✅
- Master has: All code + all docs (~493 files)
- People see source code when visiting repo

---

## 💡 **Pro Tip: Easier Alternative**

If merging is complex, you can:

1. **Just push master to PACT-Siddig** (with source code)
2. **Make master default** (on GitHub settings)
3. **Keep both branches** (main for docs, master for code)
4. **Or delete main later** (once you confirm master has everything)

The most important thing is getting the **master branch** (with all source code) pushed to GitHub and making it the default!

---

**Start Now:** Open Git pane → Switch to master → Push to siddig → Change default on GitHub! 🚀
