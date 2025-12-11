import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ResetOTP {
  email: string
  otp: string
  expires_at: string
  created_at: string
}

const resetOTPs = new Map<string, ResetOTP>()

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email, otp, action } = await req.json()

    if (!email) {
      return new Response(
        JSON.stringify({ success: false, error: 'Email is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Server configuration error' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    if (action === 'generate') {
      const { data: userData, error: lookupError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('email', email.toLowerCase())
        .maybeSingle()

      if (lookupError || !userData) {
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: 'If an account exists with this email, a reset code will be sent.' 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString()
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

      const { error: storeError } = await supabase
        .from('password_reset_tokens')
        .upsert({
          email: email.toLowerCase(),
          otp: generatedOtp,
          expires_at: expiresAt,
          used: false
        }, { onConflict: 'email' })

      if (storeError) {
        console.log('Could not store in DB, using in-memory fallback:', storeError.message)
        resetOTPs.set(email.toLowerCase(), {
          email: email.toLowerCase(),
          otp: generatedOtp,
          expires_at: expiresAt,
          created_at: new Date().toISOString()
        })
      }

      const smtpHost = Deno.env.get('SMTP_HOST')
      const smtpPort = Deno.env.get('SMTP_PORT') || '465'
      const smtpUser = Deno.env.get('SMTP_USER')
      const smtpPassword = Deno.env.get('SMTP_PASSWORD')

      console.log(`SMTP Config Check: host=${smtpHost ? 'SET' : 'MISSING'}, port=${smtpPort}, user=${smtpUser ? smtpUser.substring(0,5)+'...' : 'MISSING'}, pass=${smtpPassword ? 'SET' : 'MISSING'}`)

      if (smtpHost && smtpUser && smtpPassword) {
        try {
          // Use denomailer - the original library that was working
          const { SMTPClient } = await import('https://deno.land/x/denomailer@1.6.0/mod.ts')
          
          const portNum = Number(smtpPort)
          console.log(`Attempting SMTP connection to ${smtpHost}:${portNum}`)
          
          // Create SMTP client with IONOS settings
          const client = new SMTPClient({
            connection: {
              hostname: smtpHost,
              port: portNum,
              tls: portNum === 465,
              auth: {
                username: smtpUser,
                password: smtpPassword,
              },
            },
          })

          console.log('SMTP client created')

          const recipientName = userData.full_name || 'User'
          const resetLink = `https://app.pactorg.com/reset-password?email=${encodeURIComponent(email)}`
          const emailHtml = `
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
                <p style="color: #333; font-size: 16px; line-height: 1.5;">Hello ${recipientName},</p>
                <p style="color: #333; font-size: 16px; line-height: 1.5;">We received a request to reset your password. Use the code below to complete your password reset:</p>
                <div style="background-color: #f0f4f8; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
                  <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1a1a2e;">${generatedOtp}</span>
                </div>
                <p style="color: #666; font-size: 14px; line-height: 1.5;">This code expires in 15 minutes. If you didn't request this reset, please ignore this email.</p>
                <div style="text-align: center; margin: 25px 0;">
                  <a href="${resetLink}" style="display: inline-block; padding: 14px 30px; background-color: #9b87f5; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                    Reset Password
                  </a>
                </div>
                <p style="color: #999; font-size: 12px; text-align: center; margin-top: 15px;">
                  Or copy this link: <a href="${resetLink}" style="color: #9b87f5;">${resetLink}</a>
                </p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                <p style="color: #999; font-size: 12px; text-align: center;">
                  This is an automated message from PACT Workflow Platform.<br>
                  ICT Team - PACT Command Center Platform
                </p>
              </div>
            </body>
            </html>
          `

          await client.send({
            from: smtpUser,
            to: email,
            subject: 'PACT Password Reset Code',
            content: `Hello ${recipientName},\n\nYour password reset code is: ${generatedOtp}\n\nThis code expires in 15 minutes.\n\nClick here to reset your password: ${resetLink}\n\n- PACT Workflow Platform`,
            html: emailHtml,
          })

          await client.close()
          console.log(`Password reset email sent successfully to ${email}`)
          
          // Log successful email to audit_logs
          try {
            await supabase.from('audit_logs').insert({
              action: 'email_sent',
              entity_type: 'email',
              entity_name: 'Password Reset OTP',
              description: `Password reset code sent to ${email}`,
              success: true,
              actor_id: String(userData.id),
              actor_name: recipientName,
              metadata: {
                recipient: email,
                subject: 'PACT Password Reset Code',
                emailType: 'password_reset',
                provider: 'IONOS SMTP'
              }
            })
          } catch (logError) {
            console.error('Audit log insert failed:', logError)
          }
        } catch (emailError) {
          const errMsg = (emailError as Error)?.message || 'Unknown SMTP error'
          console.error('Email sending error:', errMsg)
          
          // Log failed email to audit_logs
          try {
            await supabase.from('audit_logs').insert({
              action: 'email_failed',
              entity_type: 'email',
              entity_name: 'Password Reset OTP',
              description: `Failed to send password reset code to ${email}`,
              success: false,
              error_message: errMsg,
              actor_id: String(userData.id),
              actor_name: userData.full_name || 'User',
              metadata: {
                recipient: email,
                subject: 'PACT Password Reset Code',
                emailType: 'password_reset',
                provider: 'IONOS SMTP',
                error: errMsg
              }
            })
          } catch (logError) {
            console.error('Audit log insert failed:', logError)
          }
        }
      } else {
        console.log(`[DEV MODE] Password reset OTP for ${email}: ${generatedOtp}`)
        
        // Log missing SMTP config
        try {
          await supabase.from('audit_logs').insert({
            action: 'email_skipped',
            entity_type: 'email',
            entity_name: 'Password Reset OTP',
            description: `SMTP not configured - password reset code for ${email} not sent`,
            success: false,
            error_message: 'SMTP credentials not configured in Edge Function secrets',
            actor_id: String(userData.id),
            actor_name: userData.full_name || 'User',
            metadata: {
              recipient: email,
              subject: 'PACT Password Reset Code',
              emailType: 'password_reset',
              reason: 'missing_smtp_config'
            }
          })
        } catch (logError) {
          console.error('Audit log insert failed:', logError)
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'If an account exists with this email, a reset code will be sent.' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!otp) {
      return new Response(
        JSON.stringify({ success: false, error: 'OTP is required for verification' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const { data: storedToken, error: tokenError } = await supabase
      .from('password_reset_tokens')
      .select('*')
      .eq('email', email.toLowerCase())
      .eq('used', false)
      .maybeSingle()

    let isValid = false
    
    if (storedToken && !tokenError) {
      const isExpired = new Date(storedToken.expires_at) < new Date()
      isValid = storedToken.otp === otp && !isExpired
      
      if (isValid) {
        await supabase
          .from('password_reset_tokens')
          .update({ used: true })
          .eq('email', email.toLowerCase())
      }
    } else {
      const memoryToken = resetOTPs.get(email.toLowerCase())
      if (memoryToken) {
        const isExpired = new Date(memoryToken.expires_at) < new Date()
        isValid = memoryToken.otp === otp && !isExpired
        
        if (isValid) {
          resetOTPs.delete(email.toLowerCase())
        }
      }
    }

    if (!isValid) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid or expired verification code' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    return new Response(
      JSON.stringify({ success: true, message: 'OTP verified successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'An unexpected error occurred' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
