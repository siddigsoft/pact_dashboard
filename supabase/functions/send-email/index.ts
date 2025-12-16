import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Base URL for links in emails
const APP_URL = 'https://app.pactorg.com'

interface EmailRequest {
  to: string
  subject: string
  html?: string
  text?: string
  type?: 'otp' | 'password-reset' | 'notification' | 'general'
  otp?: string
  recipientName?: string
  recipientEmail?: string
  actionUrl?: string
  actionLabel?: string
}

function generateEmailHtml(
  type: string | undefined, 
  otp: string | undefined, 
  recipientName: string | undefined,
  recipientEmail: string | undefined,
  actionUrl?: string,
  actionLabel?: string
): { html: string; text: string } | null {
  const name = recipientName || 'User'
  
  if (type === 'otp' && otp) {
    const resetLink = actionUrl || `${APP_URL}/reset-password`
    return {
      html: `
        <!DOCTYPE html>
        <html dir="ltr">
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>PACT Verification Code</title></head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
          <div style="background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #1a1a2e; margin: 0; font-size: 24px;">PACT Workflow Platform</h1>
            </div>
            <p style="color: #333; font-size: 16px;">Hello ${name},</p>
            <p style="color: #333; font-size: 16px;">Your verification code is:</p>
            <div style="background-color: #f0f4f8; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1a1a2e;">${otp}</span>
            </div>
            <p style="color: #666; font-size: 14px;">This code expires in 1 hour.</p>
            <div style="text-align: center; margin: 25px 0;">
              <a href="${resetLink}" style="display: inline-block; padding: 14px 30px; background-color: #9b87f5; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">
                ${actionLabel || 'Go to PACT Platform'}
              </a>
            </div>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #999; font-size: 12px; text-align: center;">PACT Workflow Platform</p>
          </div>
        </body>
        </html>
      `,
      text: `Hello ${name},\n\nYour PACT verification code is: ${otp}\n\nThis code expires in 1 hour.\n\n- PACT Workflow Platform`
    }
  }

  if (type === 'password-reset' && otp) {
    const resetLink = actionUrl || `${APP_URL}/reset-password?email=${encodeURIComponent(recipientEmail || '')}`
    return {
      html: `
        <!DOCTYPE html>
        <html dir="ltr">
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>PACT Password Reset</title></head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
          <div style="background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #1a1a2e; margin: 0; font-size: 24px;">PACT Workflow Platform</h1>
            </div>
            <p style="color: #333; font-size: 16px;">Hello ${name},</p>
            <p style="color: #333; font-size: 16px;">We received a request to reset your password. Use the code below:</p>
            <div style="background-color: #f0f4f8; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1a1a2e;">${otp}</span>
            </div>
            <p style="color: #666; font-size: 14px;">This code expires in 1 hour. If you didn't request this reset, please ignore this email.</p>
            <div style="text-align: center; margin: 25px 0;">
              <a href="${resetLink}" style="display: inline-block; padding: 14px 30px; background-color: #9b87f5; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">
                Reset Password
              </a>
            </div>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #999; font-size: 12px; text-align: center;">PACT Workflow Platform</p>
          </div>
        </body>
        </html>
      `,
      text: `Hello ${name},\n\nYour password reset code is: ${otp}\n\nThis code expires in 1 hour.\n\nClick here to reset: ${resetLink}\n\n- PACT Workflow Platform`
    }
  }

  return null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const smtpHost = Deno.env.get('SMTP_HOST')
    const smtpPort = Deno.env.get('SMTP_PORT')
    const smtpUser = Deno.env.get('SMTP_USER')
    const smtpPassword = Deno.env.get('SMTP_PASSWORD')

    console.log('SMTP Check - Host:', !!smtpHost, 'Port:', !!smtpPort, 'User:', !!smtpUser, 'Pass:', !!smtpPassword)

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPassword) {
      console.error('Missing SMTP configuration')
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'SMTP configuration is incomplete. Please add SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD to Edge Function secrets.',
          debug: { host: !!smtpHost, port: !!smtpPort, user: !!smtpUser, password: !!smtpPassword }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    const body = await req.json()
    const { to, subject, html, text, type, otp, recipientName, recipientEmail, actionUrl, actionLabel }: EmailRequest = body

    console.log('Email request - To:', to, 'Subject:', subject?.substring(0, 30), 'Type:', type)

    if (!to || !subject) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: to, subject' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    let emailHtml = html
    let emailText = text

    const emailForLinks = recipientEmail || to
    const generatedContent = generateEmailHtml(type, otp, recipientName, emailForLinks, actionUrl, actionLabel)
    if (generatedContent) {
      emailHtml = generatedContent.html
      emailText = generatedContent.text
    }

    if (!emailHtml && !emailText) {
      return new Response(
        JSON.stringify({ success: false, error: 'Email content is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const portNum = Number(smtpPort)
    console.log(`SMTP: ${smtpHost}:${portNum}, From: ${smtpUser}`)

    // Import nodemailer
    const nodemailer = await import('npm:nodemailer@6.9.8')
    
    // Create transporter - IONOS typically uses port 587 with STARTTLS
    const transportConfig = {
      host: smtpHost,
      port: portNum,
      secure: portNum === 465,
      auth: {
        user: smtpUser,
        pass: smtpPassword,
      },
      tls: {
        rejectUnauthorized: false,
        minVersion: 'TLSv1.2'
      },
      connectionTimeout: 30000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
    }

    console.log('Creating transporter...')
    const transporter = nodemailer.default.createTransport(transportConfig)

    // Verify connection first
    try {
      console.log('Verifying SMTP connection...')
      await transporter.verify()
      console.log('SMTP connection verified successfully')
    } catch (verifyError: any) {
      console.error('SMTP verification failed:', verifyError.message)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `SMTP connection failed: ${verifyError.message}. Please check your SMTP credentials.`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    console.log(`Sending email to ${to}...`)
    
    const mailOptions = {
      from: `"PACT Workflow" <${smtpUser}>`,
      to: to,
      subject: subject,
      text: emailText || 'Please view this email in an HTML-capable email client.',
      html: emailHtml || undefined,
    }

    const info = await transporter.sendMail(mailOptions)
    console.log(`Email sent! MessageId: ${info.messageId}`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Email sent successfully',
        messageId: info.messageId || `email-${Date.now()}`,
        deliveredAt: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error('Email error:', error.message, error.stack)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Failed to send email',
        details: error.code || 'unknown'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
