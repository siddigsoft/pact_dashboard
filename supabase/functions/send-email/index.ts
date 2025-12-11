import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EmailRequest {
  to: string
  subject: string
  html?: string
  text?: string
  type?: 'otp' | 'password-reset' | 'notification' | 'general'
  otp?: string
  recipientName?: string
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

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPassword) {
      console.error('Missing SMTP configuration:', { 
        host: !!smtpHost, 
        port: !!smtpPort, 
        user: !!smtpUser, 
        password: !!smtpPassword 
      })
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'SMTP configuration is incomplete. Please check server settings.' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    const { to, subject, html, text, type, otp, recipientName }: EmailRequest = await req.json()

    if (!to || !subject) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: to, subject' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    let emailHtml = html
    let emailText = text

    if (type === 'otp' && otp) {
      const name = recipientName || 'User'
      emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>PACT Verification Code</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
          <div style="background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #1a1a2e; margin: 0; font-size: 24px;">PACT Workflow Platform</h1>
            </div>
            <p style="color: #333; font-size: 16px; line-height: 1.5;">Hello ${name},</p>
            <p style="color: #333; font-size: 16px; line-height: 1.5;">Your verification code is:</p>
            <div style="background-color: #f0f4f8; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1a1a2e;">${otp}</span>
            </div>
            <p style="color: #666; font-size: 14px; line-height: 1.5;">This code expires in 10 minutes. Do not share this code with anyone.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #999; font-size: 12px; text-align: center;">This is an automated message from PACT Workflow Platform. Please do not reply to this email.</p>
          </div>
        </body>
        </html>
      `
      emailText = `Hello ${name},\n\nYour PACT verification code is: ${otp}\n\nThis code expires in 10 minutes. Do not share this code with anyone.\n\n- PACT Workflow Platform`
    }

    if (type === 'password-reset' && otp) {
      const name = recipientName || 'User'
      emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>PACT Password Reset</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
          <div style="background-color: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #1a1a2e; margin: 0; font-size: 24px;">PACT Workflow Platform</h1>
            </div>
            <p style="color: #333; font-size: 16px; line-height: 1.5;">Hello ${name},</p>
            <p style="color: #333; font-size: 16px; line-height: 1.5;">We received a request to reset your password. Use the code below to complete your password reset:</p>
            <div style="background-color: #f0f4f8; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1a1a2e;">${otp}</span>
            </div>
            <p style="color: #666; font-size: 14px; line-height: 1.5;">This code expires in 15 minutes. If you didn't request this reset, please ignore this email or contact support.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #999; font-size: 12px; text-align: center;">This is an automated message from PACT Workflow Platform. Please do not reply to this email.</p>
          </div>
        </body>
        </html>
      `
      emailText = `Hello ${name},\n\nWe received a request to reset your password.\n\nYour password reset code is: ${otp}\n\nThis code expires in 15 minutes. If you didn't request this reset, please ignore this email.\n\n- PACT Workflow Platform`
    }

    if (!emailHtml && !emailText) {
      return new Response(
        JSON.stringify({ success: false, error: 'Email content is required (html or text)' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const portNum = Number(smtpPort)
    // IONOS uses port 587 with STARTTLS, port 465 with implicit TLS
    const useImplicitTLS = portNum === 465
    
    console.log(`Connecting to SMTP: ${smtpHost}:${portNum}, TLS: ${useImplicitTLS}`)
    
    const client = new SMTPClient({
      connection: {
        hostname: smtpHost,
        port: portNum,
        tls: useImplicitTLS,
        auth: {
          username: smtpUser,
          password: smtpPassword,
        },
      },
    })

    await client.send({
      from: `PACT Workflow <${smtpUser}>`,
      to: to,
      subject: subject,
      content: emailText || '',
      html: emailHtml || undefined,
    })

    await client.close()

    console.log(`Email sent successfully to ${to} (type: ${type || 'general'})`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Email sent successfully',
        messageId: `email-${Date.now()}`,
        deliveredAt: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Email sending error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Failed to send email' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
