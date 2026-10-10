import { Resend } from 'resend'

const resendApiKey = process.env.RESEND_API_KEY
const fromEmail = process.env.RESEND_FROM_EMAIL || 'SaaS Analytics <onboarding@resend.dev>'
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

const resend = resendApiKey && !resendApiKey.includes('placeholder')
  ? new Resend(resendApiKey)
  : null

export function isEmailConfigured(): boolean {
  return Boolean(resend)
}

/**
 * Base email layout with modern, accessible styling
 */
function wrapEmailTemplate({
  title,
  preheader,
  contentHtml,
}: {
  title: string
  preheader: string
  contentHtml: string
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #09090b; color: #f4f4f5; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 40px auto; background-color: #18181b; border: 1px solid #27272a; border-radius: 16px; overflow: hidden; }
    .header { padding: 32px 32px 24px; text-align: center; border-bottom: 1px solid #27272a; }
    .brand { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; font-size: 18px; color: #ffffff; letter-spacing: -0.025em; text-decoration: none; }
    .body { padding: 32px; color: #d4d4d8; font-size: 14px; line-height: 1.6; }
    .btn { display: inline-block; background-color: #4f46e5; color: #ffffff !important; font-weight: 600; font-size: 14px; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 20px 0; text-align: center; }
    .btn:hover { background-color: #4338ca; }
    .card { background-color: #27272a; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 13px; color: #a1a1aa; }
    .footer { padding: 24px 32px; background-color: #121215; text-align: center; font-size: 12px; color: #71717a; border-top: 1px solid #27272a; }
    .footer a { color: #818cf8; text-decoration: none; }
  </style>
</head>
<body>
  <div style="display:none;font-size:1px;color:#333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    ${preheader}
  </div>
  <div class="container">
    <div class="header">
      <div class="brand">
        📊 SaaS Analytics
      </div>
    </div>
    <div class="body">
      ${contentHtml}
    </div>
    <div class="footer">
      <p style="margin: 0 0 8px;">Multi-Tenant Analytics Platform • Protected with enterprise RBAC</p>
      <p style="margin: 0;">This email was sent to notify you about activity on your account.</p>
    </div>
  </div>
</body>
</html>`
}

/**
 * Send Welcome Email upon new user signup
 */
export async function sendSignupWelcomeEmail({
  to,
  name,
  workspaceName,
}: {
  to: string
  name: string
  workspaceName: string
}) {
  const subject = `Welcome to SaaS Analytics, ${name}!`
  const dashboardUrl = `${appUrl}/dashboard`

  const html = wrapEmailTemplate({
    title: subject,
    preheader: `Welcome to SaaS Analytics! Your workspace ${workspaceName} is ready.`,
    contentHtml: `
      <h2 style="font-size: 20px; font-weight: 600; color: #ffffff; margin-top: 0; margin-bottom: 12px;">
        Welcome to SaaS Analytics, ${name}! 🎉
      </h2>
      <p>
        Your account and initial workspace <strong>${workspaceName}</strong> have been created successfully.
      </p>
      <p>
        Here is what you can do next:
      </p>
      <ul style="padding-left: 20px; margin: 16px 0; color: #d4d4d8;">
        <li style="margin-bottom: 8px;"><strong>Upload CSV Data:</strong> Drag and drop your sales or marketing datasets for automatic metrics generation.</li>
        <li style="margin-bottom: 8px;"><strong>Interactive Visualizations:</strong> Inspect revenue, conversion rates, and volume metrics on dual Y-axis charts.</li>
        <li style="margin-bottom: 8px;"><strong>Invite Collaborators:</strong> Add team members with granular RBAC permissions (Owner, Admin, Member, Viewer).</li>
      </ul>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${dashboardUrl}" class="btn">Go to Your Dashboard →</a>
      </div>
      <p style="font-size: 12px; color: #a1a1aa; margin-top: 24px;">
        If you have questions or need assistance, check our documentation or reply directly to this email.
      </p>
    `,
  })

  if (!resend) {
    console.log(`\n============================================================`)
    console.log(`[EMAIL: DEV FALLBACK] (Signup Welcome)`)
    console.log(`To: ${to}`)
    console.log(`Subject: ${subject}`)
    console.log(`Dashboard URL: ${dashboardUrl}`)
    console.log(`============================================================\n`)
    return { success: true, simulated: true }
  }

  try {
    const data = await resend.emails.send({
      from: fromEmail,
      to,
      subject,
      html,
    })
    return { success: true, id: data.data?.id }
  } catch (error: any) {
    console.error('[Resend Error] Failed to send signup welcome email:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Send Email Verification Link Email upon user signup
 */
export async function sendEmailVerificationEmail({
  to,
  name,
  verificationUrl,
  expiresInHours = 24,
}: {
  to: string
  name: string
  verificationUrl: string
  expiresInHours?: number
}) {
  const subject = `Verify your email address - SaaS Analytics`

  const html = wrapEmailTemplate({
    title: subject,
    preheader: `Confirm your email address to activate your SaaS Analytics workspace.`,
    contentHtml: `
      <h2 style="font-size: 20px; font-weight: 600; color: #ffffff; margin-top: 0; margin-bottom: 12px;">
        Verify Your Email Address ✉️
      </h2>
      <p>Hello ${name},</p>
      <p>
        Thank you for signing up for SaaS Analytics. Please verify your email address to activate your account and access your organization workspace.
      </p>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${verificationUrl}" class="btn">Verify Email Address →</a>
      </div>
      <div class="card">
        <p style="margin: 0 0 6px;"><strong>Link Expiration:</strong> This link is valid for <strong>${expiresInHours} hours</strong>.</p>
        <p style="margin: 0; word-break: break-all; font-size: 12px;">
          Direct Link:<br>
          <a href="${verificationUrl}" style="color: #818cf8;">${verificationUrl}</a>
        </p>
      </div>
      <p style="font-size: 12px; color: #71717a; margin-top: 20px;">
        If you did not sign up for an account, no further action is required.
      </p>
    `,
  })

  if (!resend) {
    console.log(`\n============================================================`)
    console.log(`[EMAIL: DEV FALLBACK] (Verify Email)`)
    console.log(`To: ${to}`)
    console.log(`Subject: ${subject}`)
    console.log(`Verification URL: ${verificationUrl}`)
    console.log(`============================================================\n`)
    return { success: true, simulated: true }
  }

  try {
    const data = await resend.emails.send({
      from: fromEmail,
      to,
      subject,
      html,
    })
    return { success: true, id: data.data?.id }
  } catch (error: any) {
    console.error('[Resend Error] Failed to send email verification email:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Send Password Reset Link Email
 */
export async function sendForgotPasswordEmail({
  to,
  name,
  resetUrl,
  expiresInHours = 1,
}: {
  to: string
  name: string
  resetUrl: string
  expiresInHours?: number
}) {
  const subject = `Reset your SaaS Analytics password`

  const html = wrapEmailTemplate({
    title: subject,
    preheader: `Click the link inside to reset your password. Valid for ${expiresInHours} hour.`,
    contentHtml: `
      <h2 style="font-size: 20px; font-weight: 600; color: #ffffff; margin-top: 0; margin-bottom: 12px;">
        Password Reset Request
      </h2>
      <p>Hello ${name},</p>
      <p>
        We received a request to reset the password associated with your email address (<strong>${to}</strong>).
      </p>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${resetUrl}" class="btn">Reset Password</a>
      </div>
      <div class="card">
        <p style="margin: 0 0 6px;"><strong>Note:</strong> This link is single-use and will expire in <strong>${expiresInHours} hour</strong>.</p>
        <p style="margin: 0; word-break: break-all; font-size: 12px;">
          Or copy and paste this URL into your browser:<br>
          <a href="${resetUrl}" style="color: #818cf8;">${resetUrl}</a>
        </p>
      </div>
      <p style="font-size: 12px; color: #71717a; margin-top: 20px;">
        If you did not request a password reset, you can safely ignore this email. Your account password remains unchanged.
      </p>
    `,
  })

  if (!resend) {
    console.log(`\n============================================================`)
    console.log(`[EMAIL: DEV FALLBACK] (Password Reset Request)`)
    console.log(`To: ${to}`)
    console.log(`Subject: ${subject}`)
    console.log(`Reset URL: ${resetUrl}`)
    console.log(`============================================================\n`)
    return { success: true, simulated: true }
  }

  try {
    const data = await resend.emails.send({
      from: fromEmail,
      to,
      subject,
      html,
    })
    return { success: true, id: data.data?.id }
  } catch (error: any) {
    console.error('[Resend Error] Failed to send password reset email:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Send Password Reset Success Confirmation Email
 */
export async function sendPasswordResetSuccessEmail({
  to,
  name,
  timestamp = new Date(),
}: {
  to: string
  name: string
  timestamp?: Date
}) {
  const subject = `Your password was successfully updated`
  const loginUrl = `${appUrl}/login`

  const html = wrapEmailTemplate({
    title: subject,
    preheader: `Your SaaS Analytics password has been changed.`,
    contentHtml: `
      <h2 style="font-size: 18px; font-weight: 600; color: #ffffff; margin-top: 0; margin-bottom: 12px;">
        Password Changed Successfully ✅
      </h2>
      <p>Hello ${name},</p>
      <p>
        The password for your SaaS Analytics account was updated on <strong>${timestamp.toUTCString()}</strong>.
      </p>
      <div class="card">
        <p style="margin: 0;">
          <strong>Security Action Taken:</strong> All previous active login sessions across devices have been automatically revoked.
        </p>
      </div>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${loginUrl}" class="btn">Log In to Your Account →</a>
      </div>
      <p style="font-size: 12px; color: #f87171; margin-top: 20px;">
        If you did not perform this change, please contact your organization administrator or support immediately.
      </p>
    `,
  })

  if (!resend) {
    console.log(`\n============================================================`)
    console.log(`[EMAIL: DEV FALLBACK] (Password Reset Success)`)
    console.log(`To: ${to}`)
    console.log(`Subject: ${subject}`)
    console.log(`============================================================\n`)
    return { success: true, simulated: true }
  }

  try {
    const data = await resend.emails.send({
      from: fromEmail,
      to,
      subject,
      html,
    })
    return { success: true, id: data.data?.id }
  } catch (error: any) {
    console.error('[Resend Error] Failed to send password reset success email:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Send Workspace Invitation Email
 */
export async function sendWorkspaceInviteEmail({
  to,
  inviterName,
  organizationName,
  role,
  inviteUrl,
}: {
  to: string
  inviterName: string
  organizationName: string
  role: string
  inviteUrl: string
}) {
  const subject = `${inviterName} invited you to join ${organizationName} on SaaS Analytics`

  const html = wrapEmailTemplate({
    title: subject,
    preheader: `Join ${organizationName} with ${role} access on SaaS Analytics.`,
    contentHtml: `
      <h2 style="font-size: 20px; font-weight: 600; color: #ffffff; margin-top: 0; margin-bottom: 12px;">
        You've Been Invited! 🚀
      </h2>
      <p>
        <strong>${inviterName}</strong> has invited you to collaborate in the organization <strong>${organizationName}</strong> with <strong>${role}</strong> privileges.
      </p>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${inviteUrl}" class="btn">Accept Invitation →</a>
      </div>
      <div class="card">
        <p style="margin: 0 0 6px;"><strong>Role:</strong> ${role}</p>
        <p style="margin: 0; word-break: break-all; font-size: 12px;">
          Direct Link:<br>
          <a href="${inviteUrl}" style="color: #818cf8;">${inviteUrl}</a>
        </p>
      </div>
      <p style="font-size: 12px; color: #71717a; margin-top: 20px;">
        This invitation link is tied to your email address and will expire in 7 days.
      </p>
    `,
  })

  if (!resend) {
    console.log(`\n============================================================`)
    console.log(`[EMAIL: DEV FALLBACK] (Workspace Invitation)`)
    console.log(`To: ${to}`)
    console.log(`Subject: ${subject}`)
    console.log(`Invite URL: ${inviteUrl}`)
    console.log(`============================================================\n`)
    return { success: true, simulated: true }
  }

  try {
    const data = await resend.emails.send({
      from: fromEmail,
      to,
      subject,
      html,
    })
    return { success: true, id: data.data?.id }
  } catch (error: any) {
    console.error('[Resend Error] Failed to send workspace invite email:', error)
    return { success: false, error: error.message }
  }
}
