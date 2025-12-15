# PACT Platform - Bilingual Email Templates (English + Arabic)

Apply these templates in **Supabase Dashboard > Authentication > Email Templates**

---

## 1. Confirm Signup (تأكيد التسجيل)

**Subject:**
```
Confirm your PACT Platform registration | تأكيد تسجيلك في منصة باكت
```

**Body:**
```html
<!DOCTYPE html>
<html dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirm Registration | تأكيد التسجيل</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  <div style="background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #1a1a2e; margin: 0; font-size: 24px;">Welcome to PACT Workflow Platform</h1>
      <p style="color: #666; margin: 5px 0 0 0; font-size: 14px;">مرحباً بك في منصة باكت للعمليات الميدانية</p>
    </div>
    
    <div style="margin-bottom: 20px;">
      <p style="color: #333; font-size: 16px; line-height: 1.5;">Hello,</p>
      <p style="color: #333; font-size: 16px; line-height: 1.5;">Thank you for registering with PACT Workflow Platform. Please confirm your email address to complete your registration.</p>
    </div>
    
    <div style="text-align: center; margin: 25px 0;">
      <a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 14px 30px; background-color: #9b87f5; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
        Confirm Email Address | تأكيد البريد الإلكتروني
      </a>
    </div>
    
    <p style="color: #666; font-size: 14px; text-align: center;">Or copy and paste this link into your browser:</p>
    <p style="color: #9b87f5; font-size: 12px; text-align: center; word-break: break-all;">{{ .ConfirmationURL }}</p>
    
    <div dir="rtl" style="margin-top: 25px; padding-top: 25px; border-top: 1px solid #eee; text-align: right;">
      <p style="color: #333; font-size: 16px; line-height: 1.8; font-family: 'Segoe UI', Tahoma, Arial, sans-serif;">مرحباً،</p>
      <p style="color: #333; font-size: 16px; line-height: 1.8; font-family: 'Segoe UI', Tahoma, Arial, sans-serif;">شكراً لتسجيلك في منصة باكت للعمليات الميدانية. يرجى تأكيد عنوان بريدك الإلكتروني لإكمال التسجيل.</p>
      <p style="color: #666; font-size: 14px; line-height: 1.8; font-family: 'Segoe UI', Tahoma, Arial, sans-serif;">إذا لم تقم بإنشاء حساب، يرجى تجاهل هذا البريد الإلكتروني.</p>
    </div>
    
    <p style="color: #666; font-size: 14px; line-height: 1.5; margin-top: 20px;">If you did not create an account, please ignore this email.</p>
    
    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
    <p style="color: #999; font-size: 12px; text-align: center;">
      This is an automated message from PACT Workflow Platform.<br>
      هذه رسالة آلية من منصة باكت للعمليات الميدانية.<br>
      ICT Team - PACT Command Center Platform<br>
      فريق تكنولوجيا المعلومات - منصة مركز قيادة باكت
    </p>
  </div>
</body>
</html>
```

---

## 2. Invite User (دعوة مستخدم)

**Subject:**
```
You've been invited to PACT Platform | لقد تمت دعوتك إلى منصة باكت
```

**Body:**
```html
<!DOCTYPE html>
<html dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitation | دعوة</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  <div style="background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #1a1a2e; margin: 0; font-size: 24px;">PACT Workflow Platform</h1>
      <p style="color: #666; margin: 5px 0 0 0; font-size: 14px;">منصة باكت للعمليات الميدانية</p>
    </div>
    
    <div style="margin-bottom: 20px;">
      <p style="color: #333; font-size: 16px; line-height: 1.5;">Hello,</p>
      <p style="color: #333; font-size: 16px; line-height: 1.5;">You have been invited to join PACT Workflow Platform. Click the button below to accept the invitation and set up your account.</p>
    </div>
    
    <div style="text-align: center; margin: 25px 0;">
      <a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 14px 30px; background-color: #9b87f5; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
        Accept Invitation | قبول الدعوة
      </a>
    </div>
    
    <p style="color: #666; font-size: 14px; text-align: center;">Or copy and paste this link into your browser:</p>
    <p style="color: #9b87f5; font-size: 12px; text-align: center; word-break: break-all;">{{ .ConfirmationURL }}</p>
    
    <div dir="rtl" style="margin-top: 25px; padding-top: 25px; border-top: 1px solid #eee; text-align: right;">
      <p style="color: #333; font-size: 16px; line-height: 1.8; font-family: 'Segoe UI', Tahoma, Arial, sans-serif;">مرحباً،</p>
      <p style="color: #333; font-size: 16px; line-height: 1.8; font-family: 'Segoe UI', Tahoma, Arial, sans-serif;">لقد تمت دعوتك للانضمام إلى منصة باكت للعمليات الميدانية. انقر على الزر أعلاه لقبول الدعوة وإعداد حسابك.</p>
      <p style="color: #666; font-size: 14px; line-height: 1.8; font-family: 'Segoe UI', Tahoma, Arial, sans-serif;">إذا لم تكن تتوقع هذه الدعوة، يمكنك تجاهل هذا البريد الإلكتروني.</p>
    </div>
    
    <p style="color: #666; font-size: 14px; line-height: 1.5; margin-top: 20px;">If you were not expecting this invitation, you can ignore this email.</p>
    
    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
    <p style="color: #999; font-size: 12px; text-align: center;">
      This is an automated message from PACT Workflow Platform.<br>
      هذه رسالة آلية من منصة باكت للعمليات الميدانية.<br>
      ICT Team - PACT Command Center Platform<br>
      فريق تكنولوجيا المعلومات - منصة مركز قيادة باكت
    </p>
  </div>
</body>
</html>
```

---

## 3. Magic Link (رابط الدخول السريع)

**Subject:**
```
Your PACT Platform Login Link | رابط تسجيل الدخول لمنصة باكت
```

**Body:**
```html
<!DOCTYPE html>
<html dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Magic Link | رابط الدخول</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  <div style="background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #1a1a2e; margin: 0; font-size: 24px;">PACT Workflow Platform</h1>
      <p style="color: #666; margin: 5px 0 0 0; font-size: 14px;">منصة باكت للعمليات الميدانية</p>
    </div>
    
    <div style="margin-bottom: 20px;">
      <p style="color: #333; font-size: 16px; line-height: 1.5;">Hello,</p>
      <p style="color: #333; font-size: 16px; line-height: 1.5;">Click the button below to log in to your PACT account. This link will expire in 1 hour.</p>
    </div>
    
    <div style="text-align: center; margin: 25px 0;">
      <a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 14px 30px; background-color: #9b87f5; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
        Log In to PACT | تسجيل الدخول
      </a>
    </div>
    
    <p style="color: #666; font-size: 14px; text-align: center;">Or copy and paste this link into your browser:</p>
    <p style="color: #9b87f5; font-size: 12px; text-align: center; word-break: break-all;">{{ .ConfirmationURL }}</p>
    
    <div dir="rtl" style="margin-top: 25px; padding-top: 25px; border-top: 1px solid #eee; text-align: right;">
      <p style="color: #333; font-size: 16px; line-height: 1.8; font-family: 'Segoe UI', Tahoma, Arial, sans-serif;">مرحباً،</p>
      <p style="color: #333; font-size: 16px; line-height: 1.8; font-family: 'Segoe UI', Tahoma, Arial, sans-serif;">انقر على الزر أعلاه لتسجيل الدخول إلى حسابك في منصة باكت. ينتهي هذا الرابط خلال ساعة واحدة.</p>
      <p style="color: #666; font-size: 14px; line-height: 1.8; font-family: 'Segoe UI', Tahoma, Arial, sans-serif;">إذا لم تطلب تسجيل الدخول، يرجى تجاهل هذا البريد الإلكتروني.</p>
    </div>
    
    <p style="color: #666; font-size: 14px; line-height: 1.5; margin-top: 20px;">If you did not request this login, please ignore this email.</p>
    
    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
    <p style="color: #999; font-size: 12px; text-align: center;">
      This is an automated message from PACT Workflow Platform.<br>
      هذه رسالة آلية من منصة باكت للعمليات الميدانية.<br>
      ICT Team - PACT Command Center Platform<br>
      فريق تكنولوجيا المعلومات - منصة مركز قيادة باكت
    </p>
  </div>
</body>
</html>
```

---

## 4. Change Email Address (تغيير البريد الإلكتروني)

**Subject:**
```
Confirm your new email address | تأكيد بريدك الإلكتروني الجديد
```

**Body:**
```html
<!DOCTYPE html>
<html dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Change Email | تغيير البريد الإلكتروني</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  <div style="background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #1a1a2e; margin: 0; font-size: 24px;">PACT Workflow Platform</h1>
      <p style="color: #666; margin: 5px 0 0 0; font-size: 14px;">منصة باكت للعمليات الميدانية</p>
    </div>
    
    <div style="margin-bottom: 20px;">
      <p style="color: #333; font-size: 16px; line-height: 1.5;">Hello,</p>
      <p style="color: #333; font-size: 16px; line-height: 1.5;">We received a request to change your email address. Click the button below to confirm your new email address.</p>
    </div>
    
    <div style="text-align: center; margin: 25px 0;">
      <a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 14px 30px; background-color: #9b87f5; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
        Confirm New Email | تأكيد البريد الجديد
      </a>
    </div>
    
    <p style="color: #666; font-size: 14px; text-align: center;">Or copy and paste this link into your browser:</p>
    <p style="color: #9b87f5; font-size: 12px; text-align: center; word-break: break-all;">{{ .ConfirmationURL }}</p>
    
    <div dir="rtl" style="margin-top: 25px; padding-top: 25px; border-top: 1px solid #eee; text-align: right;">
      <p style="color: #333; font-size: 16px; line-height: 1.8; font-family: 'Segoe UI', Tahoma, Arial, sans-serif;">مرحباً،</p>
      <p style="color: #333; font-size: 16px; line-height: 1.8; font-family: 'Segoe UI', Tahoma, Arial, sans-serif;">لقد تلقينا طلباً لتغيير عنوان بريدك الإلكتروني. انقر على الزر أعلاه لتأكيد عنوان بريدك الإلكتروني الجديد.</p>
      <p style="color: #666; font-size: 14px; line-height: 1.8; font-family: 'Segoe UI', Tahoma, Arial, sans-serif;">إذا لم تطلب هذا التغيير، يرجى تجاهل هذا البريد الإلكتروني.</p>
    </div>
    
    <p style="color: #666; font-size: 14px; line-height: 1.5; margin-top: 20px;">If you did not request this change, please ignore this email.</p>
    
    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
    <p style="color: #999; font-size: 12px; text-align: center;">
      This is an automated message from PACT Workflow Platform.<br>
      هذه رسالة آلية من منصة باكت للعمليات الميدانية.<br>
      ICT Team - PACT Command Center Platform<br>
      فريق تكنولوجيا المعلومات - منصة مركز قيادة باكت
    </p>
  </div>
</body>
</html>
```

---

## 5. Reset Password (إعادة تعيين كلمة المرور)

**Subject:**
```
Reset your PACT Platform password | إعادة تعيين كلمة مرور منصة باكت
```

**Body:**
```html
<!DOCTYPE html>
<html dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Password | إعادة تعيين كلمة المرور</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  <div style="background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #1a1a2e; margin: 0; font-size: 24px;">PACT Workflow Platform</h1>
      <p style="color: #666; margin: 5px 0 0 0; font-size: 14px;">منصة باكت للعمليات الميدانية</p>
    </div>
    
    <div style="margin-bottom: 20px;">
      <p style="color: #333; font-size: 16px; line-height: 1.5;">Hello,</p>
      <p style="color: #333; font-size: 16px; line-height: 1.5;">We received a request to reset your password. Click the button below to choose a new password.</p>
    </div>
    
    <div style="text-align: center; margin: 25px 0;">
      <a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 14px 30px; background-color: #9b87f5; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
        Reset Password | إعادة تعيين كلمة المرور
      </a>
    </div>
    
    <p style="color: #666; font-size: 14px; text-align: center;">Or copy and paste this link into your browser:</p>
    <p style="color: #9b87f5; font-size: 12px; text-align: center; word-break: break-all;">{{ .ConfirmationURL }}</p>
    
    <p style="color: #666; font-size: 14px; line-height: 1.5;">This link expires in 1 hour.</p>
    
    <div dir="rtl" style="margin-top: 25px; padding-top: 25px; border-top: 1px solid #eee; text-align: right;">
      <p style="color: #333; font-size: 16px; line-height: 1.8; font-family: 'Segoe UI', Tahoma, Arial, sans-serif;">مرحباً،</p>
      <p style="color: #333; font-size: 16px; line-height: 1.8; font-family: 'Segoe UI', Tahoma, Arial, sans-serif;">لقد تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بك. انقر على الزر أعلاه لاختيار كلمة مرور جديدة.</p>
      <p style="color: #666; font-size: 14px; line-height: 1.8; font-family: 'Segoe UI', Tahoma, Arial, sans-serif;">ينتهي هذا الرابط خلال ساعة واحدة. إذا لم تطلب إعادة التعيين، يرجى تجاهل هذا البريد الإلكتروني.</p>
    </div>
    
    <p style="color: #666; font-size: 14px; line-height: 1.5; margin-top: 20px;">If you did not request this reset, please ignore this email.</p>
    
    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
    <p style="color: #999; font-size: 12px; text-align: center;">
      This is an automated message from PACT Workflow Platform.<br>
      هذه رسالة آلية من منصة باكت للعمليات الميدانية.<br>
      ICT Team - PACT Command Center Platform<br>
      فريق تكنولوجيا المعلومات - منصة مركز قيادة باكت
    </p>
  </div>
</body>
</html>
```

---

## 6. Reauthentication (إعادة المصادقة)

**Subject:**
```
Confirm your identity | تأكيد هويتك
```

**Body:**
```html
<!DOCTYPE html>
<html dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reauthentication | إعادة المصادقة</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  <div style="background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #1a1a2e; margin: 0; font-size: 24px;">PACT Workflow Platform</h1>
      <p style="color: #666; margin: 5px 0 0 0; font-size: 14px;">منصة باكت للعمليات الميدانية</p>
    </div>
    
    <div style="margin-bottom: 20px;">
      <p style="color: #333; font-size: 16px; line-height: 1.5;">Hello,</p>
      <p style="color: #333; font-size: 16px; line-height: 1.5;">We need to verify your identity to proceed with your request. Click the button below to confirm.</p>
    </div>
    
    <div style="text-align: center; margin: 25px 0;">
      <a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 14px 30px; background-color: #9b87f5; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
        Confirm Identity | تأكيد الهوية
      </a>
    </div>
    
    <p style="color: #666; font-size: 14px; text-align: center;">Or copy and paste this link into your browser:</p>
    <p style="color: #9b87f5; font-size: 12px; text-align: center; word-break: break-all;">{{ .ConfirmationURL }}</p>
    
    <div dir="rtl" style="margin-top: 25px; padding-top: 25px; border-top: 1px solid #eee; text-align: right;">
      <p style="color: #333; font-size: 16px; line-height: 1.8; font-family: 'Segoe UI', Tahoma, Arial, sans-serif;">مرحباً،</p>
      <p style="color: #333; font-size: 16px; line-height: 1.8; font-family: 'Segoe UI', Tahoma, Arial, sans-serif;">نحتاج إلى التحقق من هويتك للمتابعة في طلبك. انقر على الزر أعلاه للتأكيد.</p>
      <p style="color: #666; font-size: 14px; line-height: 1.8; font-family: 'Segoe UI', Tahoma, Arial, sans-serif;">إذا لم تبدأ هذا الطلب، يرجى تجاهل هذا البريد الإلكتروني.</p>
    </div>
    
    <p style="color: #666; font-size: 14px; line-height: 1.5; margin-top: 20px;">If you did not initiate this request, please ignore this email.</p>
    
    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
    <p style="color: #999; font-size: 12px; text-align: center;">
      This is an automated message from PACT Workflow Platform.<br>
      هذه رسالة آلية من منصة باكت للعمليات الميدانية.<br>
      ICT Team - PACT Command Center Platform<br>
      فريق تكنولوجيا المعلومات - منصة مركز قيادة باكت
    </p>
  </div>
</body>
</html>
```

---

## How to Apply These Templates

1. Go to **Supabase Dashboard** (https://supabase.com/dashboard)
2. Select your project
3. Navigate to **Authentication** > **Email Templates**
4. For each template type, copy the **Subject** and **Body** from this document
5. Click **Save** after updating each template

## Edge Function Emails (Already Bilingual)

The following emails are handled by edge functions and are already bilingual:
- Password Reset OTP (verify-reset-otp)
- OTP Verification (send-email)
- All System Notifications (dispatch-notification)
