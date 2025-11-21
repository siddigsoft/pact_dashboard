# Make Master Default Branch and Merge Main into Master

**Goal:** 
1. Merge `main` branch into `master` branch
2. Push `master` to PACT-Siddig repository
3. Make `master` the default branch on GitHub (instead of `main`)

---

## 🎯 **STEP-BY-STEP GUIDE**

### **PART 1: Merge Main into Master Locally**

#### **Step 1: Open Git Pane**
- Click the **Git icon** (🔀) in your left sidebar
- The Git pane will open

#### **Step 2: Switch to Master Branch**
1. Look for the **branch dropdown** (currently might show "main")
2. Click it and select **"master"**
3. Wait for Replit to switch branches
4. You should now see all source code files (`src/`, `package.json`, etc.)

#### **Step 3: Merge Main into Master**

**Option A: Using Git Pane (if available)**
- Look for a "Merge" option in the Git pane
- Select to merge "main" into current branch
- Resolve any conflicts if they appear
- Commit the merge

**Option B: Using Replit Shell**
Since we need to merge branches, open the Shell and I'll guide you through this.

---

### **PART 2: Push Master to PACT-Siddig**

#### **Step 4: Push Master Branch**

After merging, while still on the `master` branch:

1. In the Git pane, click **"Push"** button
2. **Select remote:** Choose **"siddig"**
3. **Select branch:** Choose **"master"**
4. **Authenticate:**
   - Username: `siddigsoft`
   - Password: Use **Personal Access Token** (not GitHub password)
   - Get token: https://github.com/settings/tokens
   - Required scope: ✅ `repo`

5. Wait for push to complete (may take 5-10 minutes for all files)

---

### **PART 3: Make Master Default on GitHub**

#### **Step 5: Change Default Branch on GitHub**

1. **Go to your repository:**
   - Visit: https://github.com/siddigsoft/PACT-Siddig

2. **Navigate to Settings:**
   - Click the **"Settings"** tab (top right of repo page)
   - If you don't see it, you might not have admin access

3. **Change Default Branch:**
   - In the left sidebar, look for **"General"** (should be selected by default)
   - Scroll down to **"Default branch"** section
   - You'll see: "The default branch is `main`"
   - Click the **switch/arrows icon** (⇄) next to the branch name

4. **Select Master:**
   - A dropdown will appear
   - Select **"master"** from the list
   - Click **"Update"** button

5. **Confirm the Change:**
   - GitHub will ask: "Are you sure you want to change the default branch?"
   - Read the warning (it mentions branch protections, webhooks, etc.)
   - Click **"I understand, update the default branch"**

6. **Verify:**
   - The default branch should now show as **"master"**
   - When people visit your repo, they'll see the master branch by default

---

### **PART 4: (Optional) Delete Main Branch**

If you want to keep only master branch:

1. **On GitHub repository page:**
   - Click **"branches"** link (shows number of branches)
   - Find the **"main"** branch in the list
   - Click the **trash icon** (🗑️) next to it
   - Confirm deletion

**Note:** Make sure master has all the content from main before deleting main!

---

## ⚠️ **Important Notes**

### **About Merging:**
- Master branch has: **481 files** (all source code)
- Main branch has: **12 files** (documentation)
- After merging: Master will have **both** source code AND documentation

### **What Will Be on Master After Merge:**
```
master (after merge)
├── src/ (from original master)
│   ├── components/ (43+)
│   ├── pages/ (52+)
│   ├── context/
│   └── ...
├── supabase/ (from original master)
├── package.json (from original master)
├── vite.config.ts (from original master)
├── DOCUMENTATION_INDEX.md (from main)
├── PUSH_TO_GITHUB_NOW.md (from main)
├── UI_DESIGN_ANALYSIS.md (from main)
└── ... (all other docs from main)
```

### **Permissions Needed:**
- You need **admin access** to the PACT-Siddig repository to change default branch
- If you can't access Settings tab, you need to be added as an admin

---

## 🔄 **Alternative: Manual Merge Process**

If automatic merge doesn't work, here's a manual approach:

### **Using Replit Tools:**

1. **Ensure you're on master branch** (Git pane)

2. **Create a merge commit manually:**
   - Copy documentation files from main branch
   - Add them to master branch
   - Commit the changes
   - Push to PACT-Siddig

---

## ✅ **Success Checklist**

After completing all steps:

- [ ] Switched to master branch locally
- [ ] Merged main into master (has both source code AND docs)
- [ ] Pushed master to siddig remote
- [ ] Verified at https://github.com/siddigsoft/PACT-Siddig/tree/master
- [ ] GitHub shows `src/` directory on master branch
- [ ] GitHub shows documentation files on master branch
- [ ] Changed default branch to master on GitHub Settings
- [ ] Repository homepage shows master branch by default
- [ ] (Optional) Deleted main branch on GitHub

---

## 📊 **Expected Final State**

### **PACT-Siddig Repository After Completion:**

**Default Branch:** `master` ✅

**Master Branch Contents:**
- ✅ All source code (481 files)
- ✅ All documentation (12 files)
- ✅ Total: ~493 files

**When people visit:** https://github.com/siddigsoft/PACT-Siddig
- They see **master** branch by default
- They see all PACT platform code
- They see all documentation

---

## 🚀 **Quick Summary**

### **What You Need to Do:**

1. **Merge:**
   - Git pane → Switch to master
   - Merge main into master
   - This combines all files

2. **Push:**
   - Git pane → Push button
   - Remote: siddig
   - Branch: master
   - Authenticate with token

3. **Change Default:**
   - GitHub → Settings
   - Default branch section
   - Change from main to master
   - Confirm

4. **Verify:**
   - Visit repo, see master as default
   - See all source code + docs

---

## 🔗 **Quick Links**

- **Repository:** https://github.com/siddigsoft/PACT-Siddig
- **Settings:** https://github.com/siddigsoft/PACT-Siddig/settings
- **Branches:** https://github.com/siddigsoft/PACT-Siddig/branches
- **GitHub Token:** https://github.com/settings/tokens

---

**Ready to start? Open the Git pane and switch to master branch!** 🎯

---

## 💡 **Pro Tips**

1. **Before merging:** Make sure you're on master branch
2. **After merging:** Verify all files are present (source code + docs)
3. **Before pushing:** Commit the merge if needed
4. **After pushing:** Wait for GitHub to update (refresh page)
5. **Changing default:** Requires repository admin access

---

**Status:** Ready to merge and set master as default
**Action:** Follow steps above using Git pane and GitHub Settings
