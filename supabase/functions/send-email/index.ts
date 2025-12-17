import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APP_URL = 'https://app.pactorg.com'

interface EmailRequest {
  to: string
  subject: string
  html?: string
  text?: string
  type?: 'otp' | 'password-reset' | 'notification' | 'mmp' | 'site' | 'welcome' | 'general'
  otp?: string
  recipientName?: string
  recipientEmail?: string
  actionUrl?: string
  actionLabel?: string
  priority?: 'normal' | 'high' | 'urgent'
  cc?: string[]
  title_en?: string
  title_ar?: string
  message_en?: string
  message_ar?: string
  details?: { label: string; value: string }[]
}

function generateCompactTemplate(
  type: string,
  recipientName: string,
  title_en: string,
  title_ar: string,
  message_en: string,
  message_ar: string,
  actionUrl?: string,
  priority?: string,
  details?: { label: string; value: string }[]
): { html: string; text: string } {
  const name = recipientName || 'User'
  const priorityColor = priority === 'urgent' ? '#dc2626' : priority === 'high' ? '#f59e0b' : '#9b87f5'
  const fullUrl = actionUrl ? (actionUrl.startsWith('http') ? actionUrl : APP_URL + actionUrl) : ''
  
  const detailsHtml = details?.length ? details.map(d => 
    `<p style="margin:5px 0"><strong>${d.label}:</strong> ${d.value}</p>`
  ).join('') : ''

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f5f5f5">
<div style="background:#fff;border-radius:8px;padding:30px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
<div style="text-align:center;margin-bottom:20px;border-bottom:2px solid ${priorityColor};padding-bottom:15px">
<h1 style="color:#1a1a2e;margin:0;font-size:20px">PACT Command Center</h1>
<p style="color:#666;margin:5px 0 0;font-size:12px">مركز قيادة باكت</p>
</div>
<div style="margin-bottom:20px;padding:15px;background:#f8f9fa;border-radius:6px;border-left:3px solid ${priorityColor}">
<h2 style="color:#1a1a2e;margin:0 0 10px;font-size:16px">${title_en}</h2>
<p style="color:#333;font-size:14px;line-height:1.5;margin:0 0 8px">Dear ${name},</p>
<p style="color:#333;font-size:14px;line-height:1.5;margin:0">${message_en}</p>
${detailsHtml ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid #eee">${detailsHtml}</div>` : ''}
</div>
<div dir="rtl" style="margin-bottom:20px;padding:15px;background:#f0f4f8;border-radius:6px;border-right:3px solid ${priorityColor};text-align:right">
<h2 style="color:#1a1a2e;margin:0 0 10px;font-size:16px">${title_ar}</h2>
<p style="color:#333;font-size:14px;line-height:1.6;margin:0 0 8px">عزيزي ${name}،</p>
<p style="color:#333;font-size:14px;line-height:1.6;margin:0">${message_ar}</p>
</div>
${fullUrl ? `<div style="text-align:center;margin:20px 0">
<a href="${fullUrl}" style="display:inline-block;padding:12px 24px;background:${priorityColor};color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px">View Details | عرض التفاصيل</a>
</div>` : ''}
<hr style="border:none;border-top:1px solid #eee;margin:20px 0">
<p style="color:#999;font-size:11px;text-align:center">
PACT Workflow Platform | منصة باكت<br>ICT Team | فريق تكنولوجيا المعلومات
</p>
</div></body></html>`

  const text = `${title_en}\n\nDear ${name},\n\n${message_en}\n\n---\n\n${title_ar}\n\nعزيزي ${name}،\n\n${message_ar}\n\n---\nPACT Command Center`

  return { html, text }
}

function generateOtpTemplate(name: string, otp: string, actionUrl?: string): { html: string; text: string } {
  const resetLink = actionUrl || `${APP_URL}/reset-password`
  return {
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f5f5f5">
<div style="background:#fff;border-radius:8px;padding:30px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
<div style="text-align:center;margin-bottom:20px">
<h1 style="color:#1a1a2e;margin:0;font-size:20px">PACT Workflow Platform</h1>
<p style="color:#666;margin:5px 0 0;font-size:12px">منصة باكت للعمليات الميدانية</p>
</div>
<div style="margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid #eee">
<p style="color:#333;font-size:14px">Hello ${name},</p>
<p style="color:#333;font-size:14px">Your verification code is:</p>
<div style="background:#f0f4f8;border-radius:8px;padding:15px;text-align:center;margin:15px 0">
<span style="font-size:28px;font-weight:bold;letter-spacing:6px;color:#1a1a2e">${otp}</span>
</div>
<p style="color:#666;font-size:12px">This code expires in 1 hour.</p>
</div>
<div dir="rtl" style="text-align:right">
<p style="color:#333;font-size:14px">مرحباً ${name}،</p>
<p style="color:#333;font-size:14px">رمز التحقق الخاص بك هو:</p>
<div style="background:#f0f4f8;border-radius:8px;padding:12px;text-align:center;margin:12px 0">
<span style="font-size:24px;font-weight:bold;letter-spacing:6px;color:#1a1a2e">${otp}</span>
</div>
<p style="color:#666;font-size:12px">ينتهي خلال ساعة واحدة.</p>
</div>
<div style="text-align:center;margin:20px 0">
<a href="${resetLink}" style="display:inline-block;padding:12px 24px;background:#9b87f5;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Go to PACT | الذهاب إلى المنصة</a>
</div>
<hr style="border:none;border-top:1px solid #eee;margin:20px 0">
<p style="color:#999;font-size:11px;text-align:center">PACT Workflow Platform | منصة باكت</p>
</div></body></html>`,
    text: `Hello ${name},\n\nYour verification code is: ${otp}\n\nThis code expires in 1 hour.\n\n---\n\nمرحباً ${name}،\n\nرمز التحقق: ${otp}\n\n---\nPACT`
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(7)}`
  console.log(`[${requestId}] Email function invoked`)

  try {
    const smtpHost = Deno.env.get('SMTP_HOST')
    const smtpPort = Deno.env.get('SMTP_PORT')
    const smtpUser = Deno.env.get('SMTP_USER')
    const smtpPassword = Deno.env.get('SMTP_PASSWORD')

    console.log(`[${requestId}] SMTP Config: host=${smtpHost ? 'SET' : 'MISSING'}, port=${smtpPort ? 'SET' : 'MISSING'}, user=${smtpUser ? 'SET' : 'MISSING'}, pass=${smtpPassword ? 'SET' : 'MISSING'}`)

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPassword) {
      const missing = [
        !smtpHost ? 'SMTP_HOST' : '',
        !smtpPort ? 'SMTP_PORT' : '',
        !smtpUser ? 'SMTP_USER' : '',
        !smtpPassword ? 'SMTP_PASSWORD' : '',
      ].filter(Boolean).join(', ')
      
      console.error(`[${requestId}] Missing SMTP secrets: ${missing}`)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `SMTP not configured. Missing secrets: ${missing}. Add them in Supabase Dashboard > Edge Functions > send-email > Secrets.`,
          requestId,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    const body: EmailRequest = await req.json()
    const { to, subject, html, text, type, otp, recipientName, actionUrl, priority, cc, title_en, title_ar, message_en, message_ar, details } = body

    console.log(`[${requestId}] Email request: to=${to}, subject=${subject?.substring(0, 40)}..., type=${type}`)

    if (!to || !subject) {
      console.error(`[${requestId}] Missing required fields: to=${!!to}, subject=${!!subject}`)
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: to, subject', requestId }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    let emailHtml = html
    let emailText = text

    if ((type === 'otp' || type === 'password-reset') && otp) {
      const content = generateOtpTemplate(recipientName || 'User', otp, actionUrl)
      emailHtml = content.html
      emailText = content.text
    } else if ((type === 'notification' || type === 'mmp' || type === 'site' || type === 'welcome') && title_en && message_en) {
      const content = generateCompactTemplate(
        type,
        recipientName || 'User',
        title_en,
        title_ar || title_en,
        message_en,
        message_ar || message_en,
        actionUrl,
        priority,
        details
      )
      emailHtml = content.html
      emailText = content.text
    }

    if (!emailHtml && !emailText) {
      console.error(`[${requestId}] No email content provided`)
      return new Response(
        JSON.stringify({ success: false, error: 'Email content required (html or text)', requestId }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const portNum = Number(smtpPort)
    console.log(`[${requestId}] Creating SMTP transporter: ${smtpHost}:${portNum}`)
    
    const nodemailer = await import('npm:nodemailer@6.9.8')
    
    const transporter = nodemailer.default.createTransport({
      host: smtpHost,
      port: portNum,
      secure: portNum === 465,
      auth: { user: smtpUser, pass: smtpPassword },
      tls: { 
        rejectUnauthorized: false, 
        minVersion: 'TLSv1.2' 
      },
      connectionTimeout: 30000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
      pool: false,
      maxConnections: 1,
    })

    console.log(`[${requestId}] Verifying SMTP connection...`)
    try {
      await transporter.verify()
      console.log(`[${requestId}] SMTP connection verified`)
    } catch (verifyError: any) {
      console.error(`[${requestId}] SMTP verify failed:`, verifyError.message, verifyError.code)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `SMTP connection failed: ${verifyError.message}. Check your SMTP credentials and host settings.`,
          details: {
            host: smtpHost,
            port: portNum,
            errorCode: verifyError.code,
          },
          requestId,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    const mailOptions: Record<string, unknown> = {
      from: `"PACT Workflow" <${smtpUser}>`,
      to,
      subject,
      text: emailText || 'Please view in HTML-capable email client.',
      html: emailHtml || undefined,
    }

    if (cc?.length) {
      mailOptions.cc = cc.join(', ')
    }

    if (priority === 'urgent' || priority === 'high') {
      mailOptions.priority = priority
      mailOptions.headers = {
        'X-Priority': priority === 'urgent' ? '1' : '2',
        'X-MSMail-Priority': 'High',
        'Importance': 'high'
      }
    }

    console.log(`[${requestId}] Sending email to ${to}...`)
    const info = await transporter.sendMail(mailOptions)
    console.log(`[${requestId}] Email sent successfully: ${info.messageId}`)

    transporter.close()

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId: info.messageId || `email-${Date.now()}`,
        deliveredAt: new Date().toISOString(),
        requestId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error(`[${requestId}] Email error:`, error.message, error.stack)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Failed to send email',
        errorType: error.name,
        requestId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
