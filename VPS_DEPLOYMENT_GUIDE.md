# VPS Deployment Guide

This guide helps you deploy your React SPA to your own VPS and fix the MIME type errors.

## Prerequisites

- VPS with Nginx or Apache installed
- SSH access to your VPS
- Built `dist` folder from `npm run build`

## Quick Fix for MIME Type Errors

The MIME type errors occur because your web server is serving `index.html` (HTML) instead of JavaScript files when they're requested. This happens when the SPA routing fallback catches all requests, including static assets.

## Option 1: Nginx Configuration (Recommended)

### Step 1: Copy Configuration File

```bash
# On your local machine, the nginx.conf file is ready
# Copy it to your VPS
scp nginx.conf user@your-vps-ip:/tmp/nginx.conf
```

### Step 2: Configure on VPS

```bash
# SSH into your VPS
ssh user@your-vps-ip

# Move the config to sites-available
sudo mv /tmp/nginx.conf /etc/nginx/sites-available/your-app-name

# Edit the file to update paths
sudo nano /etc/nginx/sites-available/your-app-name
```

**Update these values:**
- `server_name your-domain.com;` → Your domain or IP
- `root /var/www/your-app/dist;` → Path to your dist folder
- All `/var/www/your-app/dist` paths → Your actual deployment path

### Step 3: Enable and Test

```bash
# Create symlink to enable the site
sudo ln -s /etc/nginx/sites-available/your-app-name /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# If test passes, reload nginx
sudo systemctl reload nginx
```

### Step 4: Deploy Your Build

```bash
# From your local machine, build and deploy
npm run build

# Copy dist folder to VPS
rsync -avz --delete dist/ user@your-vps-ip:/var/www/your-app/dist/

# Or using scp
scp -r dist/* user@your-vps-ip:/var/www/your-app/dist/
```

## Option 2: Apache Configuration

### Step 1: Copy .htaccess File

```bash
# Copy .htaccess to your dist folder on VPS
scp .htaccess user@your-vps-ip:/var/www/your-app/dist/.htaccess
```

### Step 2: Enable Required Modules

```bash
# SSH into your VPS
ssh user@your-vps-ip

# Enable required Apache modules
sudo a2enmod rewrite headers expires deflate

# Restart Apache
sudo systemctl restart apache2
```

### Step 3: Update Virtual Host

Edit your Apache virtual host configuration:

```bash
sudo nano /etc/apache2/sites-available/your-app.conf
```

Add or update the Directory block:

```apache
<VirtualHost *:80>
    ServerName your-domain.com
    DocumentRoot /var/www/your-app/dist

    <Directory /var/www/your-app/dist>
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    ErrorLog ${APACHE_LOG_DIR}/your-app-error.log
    CustomLog ${APACHE_LOG_DIR}/your-app-access.log combined
</VirtualHost>
```

### Step 4: Enable Site and Restart

```bash
# Enable the site
sudo a2ensite your-app.conf

# Test configuration
sudo apache2ctl configtest

# Restart Apache
sudo systemctl restart apache2
```

## Verification

After deployment, verify everything works:

1. **Check JavaScript files load correctly:**
   ```bash
   curl -I http://your-domain.com/js/index-*.js
   # Should return: Content-Type: application/javascript
   ```

2. **Check in browser:**
   - Open DevTools → Network tab
   - Reload page
   - All `.js` files should return `200 OK` with `Content-Type: application/javascript`
   - No MIME type errors in console

3. **Test SPA routing:**
   - Navigate to different routes (e.g., `/dashboard`, `/settings`)
   - All routes should work without 404 errors

## Troubleshooting

### Still seeing MIME type errors?

1. **Clear browser cache:**
   - Hard refresh: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
   - Or use incognito/private window

2. **Check web server logs:**
   ```bash
   # Nginx
   sudo tail -f /var/log/nginx/your-app-error.log
   
   # Apache
   sudo tail -f /var/log/apache2/error.log
   ```

3. **Verify file permissions:**
   ```bash
   # Ensure web server can read files
   sudo chown -R www-data:www-data /var/www/your-app/dist
   sudo chmod -R 755 /var/www/your-app/dist
   ```

4. **Test configuration:**
   ```bash
   # Nginx
   sudo nginx -t
   
   # Apache
   sudo apache2ctl configtest
   ```

### Files not found (404)?

1. **Check file paths match in config:**
   - Nginx: Verify `root` and `alias` paths
   - Apache: Verify `DocumentRoot` path

2. **Check files exist:**
   ```bash
   ls -la /var/www/your-app/dist/js/
   ls -la /var/www/your-app/dist/assets/
   ```

3. **Check symlinks (Nginx):**
   ```bash
   ls -la /etc/nginx/sites-enabled/
   ```

## SSL/HTTPS Setup (Optional but Recommended)

### Using Let's Encrypt (Certbot)

```bash
# Install certbot
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx  # For Nginx
# OR
sudo apt-get install certbot python3-certbot-apache  # For Apache

# Get certificate
sudo certbot --nginx -d your-domain.com  # For Nginx
# OR
sudo certbot --apache -d your-domain.com  # For Apache

# Auto-renewal is set up automatically
```

After SSL setup, update your `nginx.conf` to include the HTTPS server block (see comments in the file).

## Maintenance

### Updating the App

```bash
# 1. Build locally
npm run build

# 2. Deploy to VPS
rsync -avz --delete dist/ user@your-vps-ip:/var/www/your-app/dist/

# 3. No need to restart web server for static files
# But if you changed config, reload:
sudo systemctl reload nginx  # or apache2
```

### Monitoring

```bash
# Check web server status
sudo systemctl status nginx  # or apache2

# View access logs
sudo tail -f /var/log/nginx/your-app-access.log

# View error logs
sudo tail -f /var/log/nginx/your-app-error.log
```

## Additional Resources

- [Nginx Documentation](https://nginx.org/en/docs/)
- [Apache Documentation](https://httpd.apache.org/docs/)
- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)

