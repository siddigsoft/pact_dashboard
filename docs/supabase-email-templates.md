# Supabase Email Templates for PACT Platform

Copy these templates into your Supabase Dashboard:
**Authentication** → **Email Templates**

---

## 1. Confirm Signup (Email Verification)

**Subject:**
```
Confirm your PACT Platform registration
```

**Message (HTML):**
```html
<h2>Welcome to PACT Workflow Platform</h2>

<p>Hello,</p>

<p>Thank you for registering with PACT Workflow Platform. Please confirm your email address to complete your registration.</p>

<p><a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 12px 24px; background-color: #9b87f5; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">Confirm Email Address</a></p>

<p>Or copy and paste this link into your browser:</p>
<p style="word-break: break-all; color: #666;">{{ .ConfirmationURL }}</p>

<p>If you did not create an account, please ignore this email.</p>

<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

<p style="color: #999; font-size: 12px;">
This is an automated message from PACT Workflow Platform.<br>
ICT Team - PACT Command Center Platform
</p>
```

---

## 2. Invite User

**Subject:**
```
You've been invited to PACT Workflow Platform
```

**Message (HTML):**
```html
<h2>You're Invited to PACT Workflow Platform</h2>

<p>Hello,</p>

<p>You have been invited to join the PACT Workflow Platform. Click the button below to accept your invitation and set up your account.</p>

<p><a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 12px 24px; background-color: #9b87f5; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">Accept Invitation</a></p>

<p>Or copy and paste this link into your browser:</p>
<p style="word-break: break-all; color: #666;">{{ .ConfirmationURL }}</p>

<p>This invitation will expire in 24 hours.</p>

<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

<p style="color: #999; font-size: 12px;">
This is an automated message from PACT Workflow Platform.<br>
ICT Team - PACT Command Center Platform
</p>
```

---

## 3. Magic Link

**Subject:**
```
Your PACT Platform login link
```

**Message (HTML):**
```html
<h2>Login to PACT Workflow Platform</h2>

<p>Hello,</p>

<p>Click the button below to securely log in to your PACT account. This link will expire in 1 hour.</p>

<p><a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 12px 24px; background-color: #9b87f5; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">Log In to PACT</a></p>

<p>Or copy and paste this link into your browser:</p>
<p style="word-break: break-all; color: #666;">{{ .ConfirmationURL }}</p>

<p>If you did not request this login link, please ignore this email.</p>

<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

<p style="color: #999; font-size: 12px;">
This is an automated message from PACT Workflow Platform.<br>
ICT Team - PACT Command Center Platform
</p>
```

---

## 4. Change Email Address

**Subject:**
```
Confirm your new email address - PACT Platform
```

**Message (HTML):**
```html
<h2>Confirm Email Change</h2>

<p>Hello,</p>

<p>You requested to change your email address on PACT Workflow Platform. Please confirm your new email address by clicking the button below.</p>

<p><a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 12px 24px; background-color: #9b87f5; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">Confirm New Email</a></p>

<p>Or copy and paste this link into your browser:</p>
<p style="word-break: break-all; color: #666;">{{ .ConfirmationURL }}</p>

<p>If you did not request this change, please contact support immediately.</p>

<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

<p style="color: #999; font-size: 12px;">
This is an automated message from PACT Workflow Platform.<br>
ICT Team - PACT Command Center Platform
</p>
```

---

## 5. Reset Password

**Subject:**
```
Reset your PACT Platform password
```

**Message (HTML):**
```html
<h2>Reset Your Password</h2>

<p>Hello,</p>

<p>We received a request to reset your password for PACT Workflow Platform. Click the button below to create a new password.</p>

<p><a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 12px 24px; background-color: #9b87f5; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">Reset Password</a></p>

<p>Or copy and paste this link into your browser:</p>
<p style="word-break: break-all; color: #666;">{{ .ConfirmationURL }}</p>

<p>This link will expire in 1 hour. If you did not request a password reset, please ignore this email.</p>

<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

<p style="color: #999; font-size: 12px;">
This is an automated message from PACT Workflow Platform.<br>
ICT Team - PACT Command Center Platform
</p>
```

---

## Supabase URL Configuration

Also configure these in **Authentication** → **URL Configuration**:

| Setting | Value |
|---------|-------|
| **Site URL** | `https://pact-dashboard-831y.vercel.app` |
| **Redirect URLs** | `https://pact-dashboard-831y.vercel.app/**` |

---

## How to Apply Templates

1. Go to **Supabase Dashboard** → **Authentication** → **Email Templates**
2. Click on each template type (Confirm signup, Invite user, etc.)
3. Copy the **Subject** into the Subject field
4. Copy the **Message (HTML)** into the Body field
5. Click **Save**
6. Repeat for all 5 templates

