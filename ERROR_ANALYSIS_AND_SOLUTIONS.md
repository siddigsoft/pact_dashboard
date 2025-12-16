# Error Analysis and Solutions

## Summary of Errors

You're experiencing three related errors:

1. **404 Error**: `app_versions` table doesn't exist in Supabase
2. **MIME Type Errors**: JavaScript modules returning HTML instead of JS files
3. **Module Loading Failures**: Old cached module references trying to load non-existent files

---

## Error 1: 404 for `app_versions` Table

### Error Message
```
Failed to load resource: the server responded with a status of 404 ()
abznugnirnlrqnnfkein.supabase.co/rest/v1/app_versions?select=*&platform=eq.mobile
```

### Root Cause
The migration file `supabase/migrations/20251124_add_app_versions_table.sql` exists in your codebase, but **it hasn't been applied to your Supabase database**. The table doesn't exist, so the API returns 404.

### Solution

**Option A: Run Migration via Supabase Dashboard**
1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy the contents of `supabase/migrations/20251124_add_app_versions_table.sql`
4. Paste and execute it

**Option B: Run Migration via Supabase CLI**
```bash
# If you have Supabase CLI installed
supabase db push

# Or apply specific migration
supabase migration up
```

**Option C: Manual SQL Execution**
1. Connect to your Supabase database
2. Run the SQL from `supabase/migrations/20251124_add_app_versions_table.sql`

### Verification
After running the migration, verify the table exists:
```sql
SELECT * FROM app_versions WHERE platform = 'mobile';
```

---

## Error 2 & 3: MIME Type Errors for JavaScript Modules

### Error Messages
```
Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html". Strict MIME type checking is enforced for module scripts per HTML spec.
Auth-DyzSBRwv.js:1 Failed to load module script
use-biometric-CANJo3kz.js:1 Failed to load module script
```

### Root Cause
This is a **caching and routing issue**:

1. **Stale Cache**: Your browser is trying to load old JavaScript files with different hash names (e.g., `Auth-DyzSBRwv.js`, `use-biometric-CANJo3kz.js`)
2. **File Mismatch**: The current build has different file hashes (e.g., `Auth-Cy44Wdh-.js` exists in `dist/js/`)
3. **Routing Fallback**: Your `vercel.json` has a catch-all rewrite rule that redirects all routes to `/index.html`:
   ```json
   {
     "rewrites": [
       { "source": "/(.*)", "destination": "/index.html" }
     ]
   }
   ```
4. **MIME Type Mismatch**: When the browser requests a non-existent JS file, the server returns `index.html` (HTML content) instead of a 404, causing the MIME type error.

### Solutions

#### Solution 1: Fix Web Server Configuration (VPS Deployment)

Since you're deploying on your own VPS, you need to configure your web server (Nginx or Apache) to properly serve static assets.

**For Nginx:**
1. Use the provided `nginx.conf` file
2. Update the paths to match your VPS setup:
   ```bash
   sudo nano /etc/nginx/sites-available/your-app
   # Copy contents from nginx.conf and update paths
   ```
3. Enable the site:
   ```bash
   sudo ln -s /etc/nginx/sites-available/your-app /etc/nginx/sites-enabled/
   sudo nginx -t  # Test configuration
   sudo systemctl reload nginx
   ```

**For Apache:**
1. Copy the `.htaccess` file to your `dist/` directory on the VPS
2. Ensure mod_rewrite is enabled:
   ```bash
   sudo a2enmod rewrite
   sudo systemctl restart apache2
   ```
3. Update your Apache virtual host to allow .htaccess:
   ```apache
   <Directory /var/www/your-app/dist>
       Options Indexes FollowSymLinks
       AllowOverride All
       Require all granted
   </Directory>
   ```

#### Solution 2: Clear Browser Cache
1. **Hard Refresh**: Press `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
2. **Clear Cache**: 
   - Open DevTools (F12)
   - Right-click the refresh button
   - Select "Empty Cache and Hard Reload"
3. **Clear All Site Data**:
   - DevTools → Application → Clear Storage → Clear site data

#### Solution 3: Add Cache-Busting Headers
If deploying to Vercel, ensure static assets have proper cache headers. The build already includes hash-based filenames, but you may need to configure headers.

#### Solution 4: Update Service Worker (if using PWA)
If you have a service worker, update it to handle cache invalidation:

```javascript
// In your service worker
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== 'current-cache-v1') {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
```

---

## Immediate Fix Steps

### Step 1: Apply Database Migration
Run the `app_versions` migration on your Supabase database (see Solution 1 above).

### Step 2: Configure Web Server on VPS

**If using Nginx:**
1. Copy `nginx.conf` to your server:
   ```bash
   sudo cp nginx.conf /etc/nginx/sites-available/your-app-name
   ```
2. Edit the file and update:
   - `server_name` with your domain or IP
   - `root` path to point to your `dist` directory
   - All `/var/www/your-app/dist` paths to match your actual deployment path
3. Test and reload:
   ```bash
   sudo nginx -t
   sudo ln -s /etc/nginx/sites-available/your-app-name /etc/nginx/sites-enabled/
   sudo systemctl reload nginx
   ```

**If using Apache:**
1. Copy `.htaccess` to your `dist/` directory on the VPS
2. Ensure mod_rewrite and mod_headers are enabled:
   ```bash
   sudo a2enmod rewrite headers expires
   sudo systemctl restart apache2
   ```
3. Update your virtual host configuration to allow .htaccess overrides

### Step 3: Rebuild and Deploy to VPS
```bash
# Build the project
npm run build

# Copy dist folder to your VPS (using scp, rsync, or your preferred method)
# Example with rsync:
rsync -avz --delete dist/ user@your-vps-ip:/var/www/your-app/dist/

# Or with scp:
scp -r dist/* user@your-vps-ip:/var/www/your-app/dist/

# Then reload your web server
# For Nginx:
ssh user@your-vps-ip "sudo systemctl reload nginx"

# For Apache:
ssh user@your-vps-ip "sudo systemctl reload apache2"
```

### Step 4: Clear Browser Cache
After deployment, users should clear their browser cache or do a hard refresh.

---

## Prevention

1. **Always run migrations** before deploying code that uses new tables
2. **Configure web server properly** to serve static assets with correct MIME types before SPA fallback
3. **Test server configuration** with `nginx -t` or `apache2ctl configtest` before reloading
4. **Implement cache invalidation** in service workers
5. **Use versioned builds** with hash-based filenames (already implemented)
6. **Test after deployment** to ensure all assets load correctly
7. **Monitor error logs** on your VPS: `/var/log/nginx/error.log` or `/var/log/apache2/error.log`

---

## Testing

After applying fixes:

1. **Test app_versions endpoint**:
   ```bash
   curl "https://abznugnirnlrqnnfkein.supabase.co/rest/v1/app_versions?select=*&platform=eq.mobile" \
     -H "apikey: YOUR_ANON_KEY"
   ```

2. **Test module loading**:
   - Open DevTools → Network tab
   - Reload page
   - Check that all `.js` files return `200 OK` with `Content-Type: application/javascript`

3. **Test in incognito mode**:
   - Open in incognito/private window
   - Verify no cache-related issues

---

## Additional Notes

- The `UpdateDialog` component in `src/components/UpdateDialog.tsx` calls `checkAppVersion()` which queries the `app_versions` table
- This component is loaded in `MainLayout.tsx`, so it runs on every page load
- The version checker gracefully handles 404s (returns default values), but the error still appears in console
- The MIME type errors are more critical as they prevent modules from loading

