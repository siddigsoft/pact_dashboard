# PACT Platform Email Templates

Complete collection of email templates for the PACT Workflow Platform.

---

# PART 1: SUPABASE AUTH TEMPLATES

Copy these into **Supabase Dashboard** → **Authentication** → **Email Templates**

---

## 1. Confirm Signup

**Subject:**
```
Confirm your PACT Platform registration
```

**Body (HTML):**
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

**Body (HTML):**
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

**Body (HTML):**
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

**Body (HTML):**
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

**Body (HTML):**
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

# PART 2: APPLICATION NOTIFICATION TEMPLATES

These templates are used by the EmailNotificationService for in-app notifications.

---

## 6. Welcome Email (New User)

**Subject:** `Welcome to PACT Workflow Platform`

**Use Case:** Sent when a new user account is created

```html
<h2>Welcome to PACT Workflow Platform</h2>

<p>Hello {{recipientName}},</p>

<p>Your account has been created with the role of "{{role}}". You can now log in to access your dashboard and start managing your assignments.</p>

<p><a href="{{loginUrl}}" style="display: inline-block; padding: 12px 24px; background-color: #9b87f5; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">Log In Now</a></p>

<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

<p style="color: #999; font-size: 12px;">
This is an automated message from PACT Workflow Platform.<br>
ICT Team - PACT Command Center Platform
</p>
```

---

## 7. Site Assignment

**Subject:** `New Site Assignment - {{siteName}}`

**Use Case:** Sent when a data collector is assigned to a site

```html
<h2>New Site Assignment</h2>

<p>Hello {{recipientName}},</p>

<div style="background-color: #e3f2fd; border-left: 4px solid #2196f3; border-radius: 4px; padding: 16px; margin: 20px 0;">
  <p style="margin: 0;"><strong>Site:</strong> {{siteName}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Location:</strong> {{location}}</p>
  <p style="margin: 5px 0 0 0;"><strong>MMP:</strong> {{mmpName}}</p>
</div>

<p>You have been assigned to visit this site. Please review the site details and confirm your assignment within 48 hours.</p>

<p><a href="{{siteUrl}}" style="display: inline-block; padding: 12px 24px; background-color: #9b87f5; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">View Assignment</a></p>

<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

<p style="color: #999; font-size: 12px;">
This is an automated message from PACT Workflow Platform.<br>
Please do not reply to this email.
</p>
```

---

## 8. Assignment Confirmation Reminder

**Subject:** `Reminder: Confirm your site assignment - {{siteName}}`

**Use Case:** Sent as a reminder before assignment deadline expires

```html
<h2>Assignment Confirmation Reminder</h2>

<p>Hello {{recipientName}},</p>

<div style="background-color: #fff3e0; border-left: 4px solid #ff9800; border-radius: 4px; padding: 16px; margin: 20px 0;">
  <p style="margin: 0;"><strong>Deadline:</strong> {{deadline}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Time Remaining:</strong> {{timeRemaining}}</p>
</div>

<p>Your assignment to "{{siteName}}" is pending confirmation. If you do not confirm within the deadline, the site may be reassigned to another team member.</p>

<p><a href="{{confirmUrl}}" style="display: inline-block; padding: 12px 24px; background-color: #ff9800; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">Confirm Now</a></p>

<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

<p style="color: #999; font-size: 12px;">
This is an automated message from PACT Workflow Platform.<br>
Please do not reply to this email.
</p>
```

---

## 9. Site Visit Completed

**Subject:** `Site Visit Completed - {{siteName}}`

**Use Case:** Sent to supervisors when a data collector completes a site visit

```html
<h2>Site Visit Completed</h2>

<p>Hello {{recipientName}},</p>

<div style="background-color: #e8f5e9; border-left: 4px solid #4caf50; border-radius: 4px; padding: 16px; margin: 20px 0;">
  <p style="margin: 0;"><strong>Site:</strong> {{siteName}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Completed By:</strong> {{collectorName}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Completion Time:</strong> {{completionTime}}</p>
  <p style="margin: 5px 0 0 0;"><strong>GPS Coordinates:</strong> {{gpsCoordinates}}</p>
</div>

<p>The site visit report is now available for review.</p>

<p><a href="{{reportUrl}}" style="display: inline-block; padding: 12px 24px; background-color: #4caf50; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">View Report</a></p>

<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

<p style="color: #999; font-size: 12px;">
This is an automated message from PACT Workflow Platform.<br>
Please do not reply to this email.
</p>
```

---

## 10. Approval Request

**Subject:** `Approval Required: {{itemType}} - {{itemName}}`

**Use Case:** Sent when an item requires approval (cost submission, withdrawal, etc.)

```html
<h2>Approval Required</h2>

<p>Hello {{recipientName}},</p>

<div style="background-color: #fff3e0; border-left: 4px solid #ff9800; border-radius: 4px; padding: 16px; margin: 20px 0;">
  <p style="margin: 0;"><strong>Type:</strong> {{itemType}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Item:</strong> {{itemName}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Requested By:</strong> {{requesterName}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Amount:</strong> {{amount}}</p>
</div>

<p>This item requires your review and approval. Please take action at your earliest convenience.</p>

<p><a href="{{approvalUrl}}" style="display: inline-block; padding: 12px 24px; background-color: #ff9800; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">Review Now</a></p>

<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

<p style="color: #999; font-size: 12px;">
This is an automated message from PACT Workflow Platform.<br>
Please do not reply to this email.
</p>
```

---

## 11. Approval Status Update - Approved

**Subject:** `Approved: {{itemType}} - {{itemName}}`

**Use Case:** Sent when an approval request is approved

```html
<h2>Request Approved</h2>

<p>Hello {{recipientName}},</p>

<div style="background-color: #e8f5e9; border-left: 4px solid #4caf50; border-radius: 4px; padding: 16px; margin: 20px 0;">
  <p style="margin: 0;"><strong>Status:</strong> Approved</p>
  <p style="margin: 5px 0 0 0;"><strong>Type:</strong> {{itemType}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Item:</strong> {{itemName}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Approved By:</strong> {{approverName}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Approved On:</strong> {{approvalDate}}</p>
</div>

<p>Your request has been approved and is now being processed.</p>

<p><a href="{{detailsUrl}}" style="display: inline-block; padding: 12px 24px; background-color: #4caf50; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">View Details</a></p>

<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

<p style="color: #999; font-size: 12px;">
This is an automated message from PACT Workflow Platform.<br>
Please do not reply to this email.
</p>
```

---

## 12. Approval Status Update - Rejected

**Subject:** `Rejected: {{itemType}} - {{itemName}}`

**Use Case:** Sent when an approval request is rejected

```html
<h2>Request Rejected</h2>

<p>Hello {{recipientName}},</p>

<div style="background-color: #ffebee; border-left: 4px solid #f44336; border-radius: 4px; padding: 16px; margin: 20px 0;">
  <p style="margin: 0;"><strong>Status:</strong> Rejected</p>
  <p style="margin: 5px 0 0 0;"><strong>Type:</strong> {{itemType}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Item:</strong> {{itemName}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Rejected By:</strong> {{approverName}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Reason:</strong> {{rejectionReason}}</p>
</div>

<p>Please review the reason for rejection and contact your administrator if you have questions.</p>

<p><a href="{{detailsUrl}}" style="display: inline-block; padding: 12px 24px; background-color: #9b87f5; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">View Details</a></p>

<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

<p style="color: #999; font-size: 12px;">
This is an automated message from PACT Workflow Platform.<br>
Please do not reply to this email.
</p>
```

---

## 13. Withdrawal Request Submitted

**Subject:** `Withdrawal Request Submitted - SDG {{amount}}`

**Use Case:** Sent when a user submits a withdrawal request

```html
<h2>Withdrawal Request Submitted</h2>

<p>Hello {{recipientName}},</p>

<div style="background-color: #e3f2fd; border-left: 4px solid #2196f3; border-radius: 4px; padding: 16px; margin: 20px 0;">
  <p style="margin: 0;"><strong>Amount:</strong> SDG {{amount}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Request ID:</strong> {{requestId}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Submitted:</strong> {{submissionDate}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Status:</strong> Pending Approval</p>
</div>

<p>Your withdrawal request has been submitted and is awaiting approval. You will receive a notification once it has been processed.</p>

<p><a href="{{walletUrl}}" style="display: inline-block; padding: 12px 24px; background-color: #9b87f5; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">View Wallet</a></p>

<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

<p style="color: #999; font-size: 12px;">
This is an automated message from PACT Workflow Platform.<br>
Please do not reply to this email.
</p>
```

---

## 14. Withdrawal Approved

**Subject:** `Withdrawal Approved - SDG {{amount}}`

**Use Case:** Sent when a withdrawal is approved

```html
<h2>Withdrawal Approved</h2>

<p>Hello {{recipientName}},</p>

<div style="background-color: #e8f5e9; border-left: 4px solid #4caf50; border-radius: 4px; padding: 16px; margin: 20px 0;">
  <p style="margin: 0;"><strong>Amount:</strong> SDG {{amount}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Request ID:</strong> {{requestId}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Approved By:</strong> {{approverName}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Status:</strong> Approved - Processing</p>
</div>

<p>Your withdrawal request has been approved and is being processed. Funds will be transferred shortly.</p>

<p><a href="{{walletUrl}}" style="display: inline-block; padding: 12px 24px; background-color: #4caf50; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">View Wallet</a></p>

<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

<p style="color: #999; font-size: 12px;">
This is an automated message from PACT Workflow Platform.<br>
Please do not reply to this email.
</p>
```

---

## 15. Withdrawal Rejected

**Subject:** `Withdrawal Rejected - SDG {{amount}}`

**Use Case:** Sent when a withdrawal is rejected

```html
<h2>Withdrawal Rejected</h2>

<p>Hello {{recipientName}},</p>

<div style="background-color: #ffebee; border-left: 4px solid #f44336; border-radius: 4px; padding: 16px; margin: 20px 0;">
  <p style="margin: 0;"><strong>Amount:</strong> SDG {{amount}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Request ID:</strong> {{requestId}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Rejected By:</strong> {{approverName}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Reason:</strong> {{rejectionReason}}</p>
</div>

<p>Your withdrawal request has been rejected. Please contact your administrator for more details.</p>

<p><a href="{{walletUrl}}" style="display: inline-block; padding: 12px 24px; background-color: #9b87f5; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">View Wallet</a></p>

<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

<p style="color: #999; font-size: 12px;">
This is an automated message from PACT Workflow Platform.<br>
Please do not reply to this email.
</p>
```

---

## 16. Cost Submission Received

**Subject:** `Cost Submission Received - {{category}}`

**Use Case:** Sent when a cost submission is received

```html
<h2>Cost Submission Received</h2>

<p>Hello {{recipientName}},</p>

<div style="background-color: #e3f2fd; border-left: 4px solid #2196f3; border-radius: 4px; padding: 16px; margin: 20px 0;">
  <p style="margin: 0;"><strong>Category:</strong> {{category}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Amount:</strong> SDG {{amount}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Site:</strong> {{siteName}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Status:</strong> Pending Review</p>
</div>

<p>Your cost submission has been received and is pending review.</p>

<p><a href="{{detailsUrl}}" style="display: inline-block; padding: 12px 24px; background-color: #9b87f5; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">View Submission</a></p>

<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

<p style="color: #999; font-size: 12px;">
This is an automated message from PACT Workflow Platform.<br>
Please do not reply to this email.
</p>
```

---

## 17. Budget Alert (80% Threshold)

**Subject:** `Budget Alert: {{projectName}} at {{percentUsed}}%`

**Use Case:** Sent when a project budget reaches 80% or higher

```html
<h2>Budget Alert</h2>

<p>Hello {{recipientName}},</p>

<div style="background-color: #fff3e0; border-left: 4px solid #ff9800; border-radius: 4px; padding: 16px; margin: 20px 0;">
  <p style="margin: 0;"><strong>Project:</strong> {{projectName}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Budget Used:</strong> {{percentUsed}}%</p>
  <p style="margin: 5px 0 0 0;"><strong>Total Budget:</strong> SDG {{totalBudget}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Remaining:</strong> SDG {{remainingBudget}}</p>
</div>

<p>The budget for this project is reaching its limit. Please review and take action if necessary.</p>

<p><a href="{{budgetUrl}}" style="display: inline-block; padding: 12px 24px; background-color: #ff9800; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">View Budget</a></p>

<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

<p style="color: #999; font-size: 12px;">
This is an automated message from PACT Workflow Platform.<br>
Please do not reply to this email.
</p>
```

---

## 18. Budget Exceeded

**Subject:** `URGENT: Budget Exceeded - {{projectName}}`

**Use Case:** Sent when a project budget is exceeded

```html
<h2>Budget Exceeded</h2>

<p>Hello {{recipientName}},</p>

<div style="background-color: #ffebee; border-left: 4px solid #f44336; border-radius: 4px; padding: 16px; margin: 20px 0;">
  <p style="margin: 0;"><strong>Project:</strong> {{projectName}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Budget Used:</strong> {{percentUsed}}%</p>
  <p style="margin: 5px 0 0 0;"><strong>Over Budget:</strong> SDG {{overBudgetAmount}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Status:</strong> Requires Immediate Attention</p>
</div>

<p>The budget for this project has been exceeded. Immediate attention is required. Further spending may be restricted.</p>

<p><a href="{{budgetUrl}}" style="display: inline-block; padding: 12px 24px; background-color: #f44336; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">View Budget</a></p>

<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

<p style="color: #999; font-size: 12px;">
This is an automated message from PACT Workflow Platform.<br>
Please do not reply to this email.
</p>
```

---

## 19. MMP Upload Success

**Subject:** `MMP Upload Successful - {{mmpName}}`

**Use Case:** Sent when an MMP file is successfully uploaded

```html
<h2>MMP Upload Successful</h2>

<p>Hello {{recipientName}},</p>

<div style="background-color: #e8f5e9; border-left: 4px solid #4caf50; border-radius: 4px; padding: 16px; margin: 20px 0;">
  <p style="margin: 0;"><strong>MMP Name:</strong> {{mmpName}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Project:</strong> {{projectName}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Total Sites:</strong> {{totalSites}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Upload Date:</strong> {{uploadDate}}</p>
</div>

<p>The MMP file has been uploaded successfully and sites are now available for assignment.</p>

<p><a href="{{mmpUrl}}" style="display: inline-block; padding: 12px 24px; background-color: #4caf50; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">View MMP</a></p>

<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

<p style="color: #999; font-size: 12px;">
This is an automated message from PACT Workflow Platform.<br>
Please do not reply to this email.
</p>
```

---

## 20. Signature Request

**Subject:** `Signature Required: {{documentName}}`

**Use Case:** Sent when a user needs to sign a document

```html
<h2>Signature Required</h2>

<p>Hello {{recipientName}},</p>

<div style="background-color: #fff3e0; border-left: 4px solid #ff9800; border-radius: 4px; padding: 16px; margin: 20px 0;">
  <p style="margin: 0;"><strong>Document:</strong> {{documentName}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Requested By:</strong> {{requesterName}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Due Date:</strong> {{dueDate}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Type:</strong> {{signatureType}}</p>
</div>

<p>Your signature is required on this document. Please review and sign at your earliest convenience.</p>

<p><a href="{{signatureUrl}}" style="display: inline-block; padding: 12px 24px; background-color: #ff9800; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">Sign Document</a></p>

<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

<p style="color: #999; font-size: 12px;">
This is an automated message from PACT Workflow Platform.<br>
Please do not reply to this email.
</p>
```

---

## 21. Signature Completed

**Subject:** `Document Signed: {{documentName}}`

**Use Case:** Sent when a signature is completed

```html
<h2>Document Signed Successfully</h2>

<p>Hello {{recipientName}},</p>

<div style="background-color: #e8f5e9; border-left: 4px solid #4caf50; border-radius: 4px; padding: 16px; margin: 20px 0;">
  <p style="margin: 0;"><strong>Document:</strong> {{documentName}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Signed By:</strong> {{signerName}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Signed On:</strong> {{signatureDate}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Verification Hash:</strong> {{verificationHash}}</p>
</div>

<p>The document has been signed and verified. A copy has been stored in the system.</p>

<p><a href="{{documentUrl}}" style="display: inline-block; padding: 12px 24px; background-color: #4caf50; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">View Document</a></p>

<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

<p style="color: #999; font-size: 12px;">
This is an automated message from PACT Workflow Platform.<br>
Please do not reply to this email.
</p>
```

---

## 22. OTP Verification Code

**Subject:** `Your PACT Verification Code: {{otpCode}}`

**Use Case:** Sent for two-factor authentication or verification

```html
<h2>Verification Code</h2>

<p>Hello {{recipientName}},</p>

<div style="background-color: #e3f2fd; border-left: 4px solid #2196f3; border-radius: 4px; padding: 16px; margin: 20px 0; text-align: center;">
  <p style="margin: 0; font-size: 14px; color: #666;">Your verification code is:</p>
  <p style="margin: 10px 0; font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1a1a2e;">{{otpCode}}</p>
  <p style="margin: 0; font-size: 12px; color: #999;">This code expires in {{expiryMinutes}} minutes</p>
</div>

<p>Enter this code to complete your verification. Do not share this code with anyone.</p>

<p style="color: #666; font-size: 13px;">If you did not request this code, please ignore this email or contact support if you have concerns.</p>

<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

<p style="color: #999; font-size: 12px;">
This is an automated message from PACT Workflow Platform.<br>
Please do not reply to this email.
</p>
```

---

## 23. Role Assignment Changed

**Subject:** `Your Role Has Been Updated - PACT Platform`

**Use Case:** Sent when a user's role is changed

```html
<h2>Role Assignment Updated</h2>

<p>Hello {{recipientName}},</p>

<div style="background-color: #e3f2fd; border-left: 4px solid #2196f3; border-radius: 4px; padding: 16px; margin: 20px 0;">
  <p style="margin: 0;"><strong>Previous Role:</strong> {{previousRole}}</p>
  <p style="margin: 5px 0 0 0;"><strong>New Role:</strong> {{newRole}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Changed By:</strong> {{changedBy}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Effective Date:</strong> {{effectiveDate}}</p>
</div>

<p>Your role and permissions have been updated. Please log out and log back in to see your updated access.</p>

<p><a href="{{dashboardUrl}}" style="display: inline-block; padding: 12px 24px; background-color: #9b87f5; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">Go to Dashboard</a></p>

<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

<p style="color: #999; font-size: 12px;">
This is an automated message from PACT Workflow Platform.<br>
Please do not reply to this email.
</p>
```

---

## 24. Account Deactivated

**Subject:** `Account Deactivated - PACT Platform`

**Use Case:** Sent when a user's account is deactivated

```html
<h2>Account Deactivated</h2>

<p>Hello {{recipientName}},</p>

<div style="background-color: #ffebee; border-left: 4px solid #f44336; border-radius: 4px; padding: 16px; margin: 20px 0;">
  <p style="margin: 0;"><strong>Status:</strong> Account Deactivated</p>
  <p style="margin: 5px 0 0 0;"><strong>Deactivated By:</strong> {{deactivatedBy}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Date:</strong> {{deactivationDate}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Reason:</strong> {{reason}}</p>
</div>

<p>Your access to PACT Workflow Platform has been deactivated. If you believe this is an error, please contact your administrator.</p>

<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

<p style="color: #999; font-size: 12px;">
This is an automated message from PACT Workflow Platform.<br>
Please do not reply to this email.
</p>
```

---

## 25. Account Reactivated

**Subject:** `Account Reactivated - PACT Platform`

**Use Case:** Sent when a user's account is reactivated

```html
<h2>Account Reactivated</h2>

<p>Hello {{recipientName}},</p>

<div style="background-color: #e8f5e9; border-left: 4px solid #4caf50; border-radius: 4px; padding: 16px; margin: 20px 0;">
  <p style="margin: 0;"><strong>Status:</strong> Account Active</p>
  <p style="margin: 5px 0 0 0;"><strong>Reactivated By:</strong> {{reactivatedBy}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Date:</strong> {{reactivationDate}}</p>
</div>

<p>Your access to PACT Workflow Platform has been restored. You can now log in and access your dashboard.</p>

<p><a href="{{loginUrl}}" style="display: inline-block; padding: 12px 24px; background-color: #4caf50; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">Log In Now</a></p>

<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

<p style="color: #999; font-size: 12px;">
This is an automated message from PACT Workflow Platform.<br>
Please do not reply to this email.
</p>
```

---

## 26. Project Assignment

**Subject:** `You've Been Assigned to Project: {{projectName}}`

**Use Case:** Sent when a user is assigned to a project

```html
<h2>Project Assignment</h2>

<p>Hello {{recipientName}},</p>

<div style="background-color: #e3f2fd; border-left: 4px solid #2196f3; border-radius: 4px; padding: 16px; margin: 20px 0;">
  <p style="margin: 0;"><strong>Project:</strong> {{projectName}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Your Role:</strong> {{projectRole}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Start Date:</strong> {{startDate}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Assigned By:</strong> {{assignedBy}}</p>
</div>

<p>You have been assigned to this project. Please review the project details and your responsibilities.</p>

<p><a href="{{projectUrl}}" style="display: inline-block; padding: 12px 24px; background-color: #9b87f5; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">View Project</a></p>

<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

<p style="color: #999; font-size: 12px;">
This is an automated message from PACT Workflow Platform.<br>
Please do not reply to this email.
</p>
```

---

## 27. Weekly Report Ready

**Subject:** `Weekly Report Ready - {{reportDate}}`

**Use Case:** Sent when scheduled weekly reports are generated

```html
<h2>Weekly Report Ready</h2>

<p>Hello {{recipientName}},</p>

<div style="background-color: #e3f2fd; border-left: 4px solid #2196f3; border-radius: 4px; padding: 16px; margin: 20px 0;">
  <p style="margin: 0;"><strong>Report Period:</strong> {{reportPeriod}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Generated On:</strong> {{generatedDate}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Report Type:</strong> {{reportType}}</p>
</div>

<p>Your weekly report is now available. Click the button below to view and download.</p>

<p><a href="{{reportUrl}}" style="display: inline-block; padding: 12px 24px; background-color: #9b87f5; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">View Report</a></p>

<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

<p style="color: #999; font-size: 12px;">
This is an automated message from PACT Workflow Platform.<br>
Please do not reply to this email.
</p>
```

---

## 28. Bank Transfer Receipt Validated

**Subject:** `Bank Transfer Validated - Receipt #{{receiptNumber}}`

**Use Case:** Sent when a bank transfer receipt is manually validated

```html
<h2>Bank Transfer Receipt Validated</h2>

<p>Hello {{recipientName}},</p>

<div style="background-color: #e8f5e9; border-left: 4px solid #4caf50; border-radius: 4px; padding: 16px; margin: 20px 0;">
  <p style="margin: 0;"><strong>Receipt Number:</strong> {{receiptNumber}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Bank:</strong> {{bankName}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Amount:</strong> SDG {{amount}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Transaction Date:</strong> {{transactionDate}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Validated By:</strong> {{validatedBy}}</p>
</div>

<p>Your bank transfer receipt has been validated and the funds have been credited to your wallet.</p>

<p><a href="{{walletUrl}}" style="display: inline-block; padding: 12px 24px; background-color: #4caf50; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">View Wallet</a></p>

<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

<p style="color: #999; font-size: 12px;">
This is an automated message from PACT Workflow Platform.<br>
Please do not reply to this email.
</p>
```

---

## 29. Bank Transfer Receipt Rejected

**Subject:** `Bank Transfer Rejected - Receipt #{{receiptNumber}}`

**Use Case:** Sent when a bank transfer receipt is rejected

```html
<h2>Bank Transfer Receipt Rejected</h2>

<p>Hello {{recipientName}},</p>

<div style="background-color: #ffebee; border-left: 4px solid #f44336; border-radius: 4px; padding: 16px; margin: 20px 0;">
  <p style="margin: 0;"><strong>Receipt Number:</strong> {{receiptNumber}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Bank:</strong> {{bankName}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Amount:</strong> SDG {{amount}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Rejected By:</strong> {{rejectedBy}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Reason:</strong> {{rejectionReason}}</p>
</div>

<p>Your bank transfer receipt has been rejected. Please review the reason and submit a new receipt if necessary.</p>

<p><a href="{{walletUrl}}" style="display: inline-block; padding: 12px 24px; background-color: #9b87f5; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">View Wallet</a></p>

<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

<p style="color: #999; font-size: 12px;">
This is an automated message from PACT Workflow Platform.<br>
Please do not reply to this email.
</p>
```

---

## 30. Down Payment Request

**Subject:** `Down Payment Request - {{projectName}}`

**Use Case:** Sent when a down payment is requested

```html
<h2>Down Payment Requested</h2>

<p>Hello {{recipientName}},</p>

<div style="background-color: #fff3e0; border-left: 4px solid #ff9800; border-radius: 4px; padding: 16px; margin: 20px 0;">
  <p style="margin: 0;"><strong>Project:</strong> {{projectName}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Amount:</strong> SDG {{amount}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Requested By:</strong> {{requesterName}}</p>
  <p style="margin: 5px 0 0 0;"><strong>Purpose:</strong> {{purpose}}</p>
</div>

<p>A down payment has been requested for this project. Please review and approve or reject.</p>

<p><a href="{{approvalUrl}}" style="display: inline-block; padding: 12px 24px; background-color: #ff9800; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">Review Request</a></p>

<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

<p style="color: #999; font-size: 12px;">
This is an automated message from PACT Workflow Platform.<br>
Please do not reply to this email.
</p>
```

---

# QUICK REFERENCE

| # | Template | Use Case |
|---|----------|----------|
| 1 | Confirm Signup | Email verification for new registrations |
| 2 | Invite User | Invitation to join the platform |
| 3 | Magic Link | Passwordless login link |
| 4 | Change Email | Email change confirmation |
| 5 | Reset Password | Password reset link |
| 6 | Welcome Email | Welcome message for new users |
| 7 | Site Assignment | Assigned to a site visit |
| 8 | Assignment Reminder | Reminder to confirm assignment |
| 9 | Visit Completed | Site visit completion notification |
| 10 | Approval Request | Request for approval |
| 11 | Approval - Approved | Approval granted |
| 12 | Approval - Rejected | Approval denied |
| 13 | Withdrawal Submitted | Withdrawal request submitted |
| 14 | Withdrawal Approved | Withdrawal approved |
| 15 | Withdrawal Rejected | Withdrawal rejected |
| 16 | Cost Submission | Cost submission received |
| 17 | Budget Alert 80% | Budget threshold warning |
| 18 | Budget Exceeded | Budget exceeded alert |
| 19 | MMP Upload Success | MMP file uploaded |
| 20 | Signature Request | Signature needed |
| 21 | Signature Completed | Document signed |
| 22 | OTP Code | Verification code |
| 23 | Role Changed | User role updated |
| 24 | Account Deactivated | Account disabled |
| 25 | Account Reactivated | Account restored |
| 26 | Project Assignment | Assigned to project |
| 27 | Weekly Report | Scheduled report ready |
| 28 | Bank Transfer Validated | Receipt approved |
| 29 | Bank Transfer Rejected | Receipt rejected |
| 30 | Down Payment Request | Down payment approval needed |

---

# SUPABASE URL CONFIGURATION

Also configure in **Authentication** → **URL Configuration**:

| Setting | Value |
|---------|-------|
| **Site URL** | `https://app.pactorg.com` |
| **Redirect URLs** | `https://app.pactorg.com/**,https://pact-dashboard-831y.vercel.app/**` |

---

# DOMAIN SETUP GUIDE

## Two Environments

| Environment | Domain | Purpose |
|-------------|--------|---------|
| **Production** | `app.pactorg.com` | Main production site |
| **Staging** | `pact-dashboard-831y.vercel.app` | Backup/staging environment |

## Vercel Setup

1. Go to **Vercel Dashboard** → **Your Project** → **Settings** → **Domains**
2. Click **Add Domain**
3. Enter: `app.pactorg.com`
4. Vercel will show you DNS records to add

## IONOS DNS Setup

Add this **CNAME record** in IONOS:

| Type | Host | Value | TTL |
|------|------|-------|-----|
| CNAME | `app` | `cname.vercel-dns.com` | Auto |

**Note:** Wait 10-30 minutes for DNS propagation, then Vercel will auto-issue SSL.

## Supabase Auth Settings

In **Supabase Dashboard** → **Authentication** → **URL Configuration**:

1. **Site URL:** `https://app.pactorg.com`
2. **Redirect URLs:** Add both:
   - `https://app.pactorg.com/**`
   - `https://pact-dashboard-831y.vercel.app/**`

This allows auth to work on both environments.

