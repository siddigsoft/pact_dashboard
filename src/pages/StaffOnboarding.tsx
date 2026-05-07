export default function StaffOnboarding() {
  return (
    <div style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif", background: '#f0f4f8', minHeight: '100vh', padding: '32px 16px 64px' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        *{box-sizing:border-box;}
        .ob-page{max-width:780px;margin:0 auto;}
        .ob-card{background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,.10);}
        .ob-header{background:linear-gradient(135deg,#1a3a6b 0%,#2563eb 60%,#3b82f6 100%);padding:48px 40px 40px;text-align:center;}
        .ob-header h1{color:#fff;font-size:26px;font-weight:800;letter-spacing:-.5px;line-height:1.25;margin:0 0 8px;}
        .ob-header p{color:#bfdbfe;font-size:14px;margin:6px 0 0;}
        .ob-badge-row{display:flex;justify-content:center;gap:10px;margin-top:20px;flex-wrap:wrap;}
        .ob-badge{background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3);border-radius:999px;font-size:12px;font-weight:600;padding:4px 14px;}
        .ob-body{padding:40px;}
        .ob-salute{font-size:15px;color:#334155;margin-bottom:20px;line-height:1.75;}
        .ob-section-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#2563eb;margin:32px 0 14px;}
        .ob-steps{display:flex;flex-direction:column;gap:14px;}
        .ob-step{display:flex;align-items:flex-start;gap:14px;}
        .ob-step-num{flex-shrink:0;width:32px;height:32px;border-radius:50%;background:#2563eb;color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;}
        .ob-step-body strong{display:block;font-size:14px;font-weight:700;color:#1e293b;margin-bottom:3px;}
        .ob-step-body span{font-size:13px;color:#64748b;line-height:1.55;}
        .ob-step-link{font-size:13px;color:#2563eb;font-weight:600;}
        .ob-feat-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
        @media(max-width:520px){.ob-feat-grid{grid-template-columns:1fr;}}
        .ob-feat{border:1.5px solid #e2e8f0;border-radius:10px;padding:14px 16px;}
        .ob-feat-icon{font-size:22px;margin-bottom:8px;}
        .ob-feat strong{display:block;font-size:13px;font-weight:700;color:#1e293b;margin-bottom:4px;}
        .ob-feat span{font-size:12px;color:#64748b;line-height:1.5;}
        .ob-role-box{background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:10px;padding:18px 20px;display:flex;align-items:flex-start;gap:14px;}
        .ob-role-box .ob-icon{font-size:28px;flex-shrink:0;}
        .ob-role-box strong{display:block;font-size:14px;font-weight:700;color:#1d4ed8;margin-bottom:4px;}
        .ob-role-box span{font-size:13px;color:#3b5299;line-height:1.55;}
        .ob-priority-box{background:#fef3c7;border:1.5px solid #fcd34d;border-radius:10px;padding:18px 20px;margin-top:16px;}
        .ob-priority-box strong{display:block;font-size:14px;font-weight:700;color:#92400e;margin-bottom:6px;}
        .ob-priority-box ul{padding-left:18px;margin-top:4px;}
        .ob-priority-box li{font-size:13px;color:#78350f;line-height:1.7;}
        .ob-cta-wrap{text-align:center;margin:32px 0 8px;}
        .ob-cta{display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 36px;border-radius:10px;}
        .ob-divider{border:none;border-top:1.5px solid #f1f5f9;margin:28px 0;}
        .ob-footer{background:#f8fafc;padding:24px 40px;text-align:center;}
        .ob-footer p{font-size:12px;color:#94a3b8;line-height:1.7;}
        .ob-footer strong{color:#64748b;}
        .ob-guide-title{text-align:center;font-size:22px;font-weight:800;color:#1e293b;margin:56px 0 6px;}
        .ob-guide-sub{text-align:center;font-size:14px;color:#64748b;margin-bottom:32px;}
        table.ob-ref{width:100%;border-collapse:collapse;margin-top:8px;}
        table.ob-ref th{background:#1a3a6b;color:#fff;font-size:12px;font-weight:600;padding:10px 14px;text-align:left;}
        table.ob-ref td{font-size:13px;color:#334155;padding:10px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;}
        table.ob-ref tr:last-child td{border-bottom:none;}
        table.ob-ref tr:nth-child(even) td{background:#f8fafc;}
        .ob-print-btn{display:block;text-align:right;margin-bottom:12px;}
        .ob-print-btn button{background:#1a3a6b;color:#fff;border:none;border-radius:8px;padding:8px 18px;font-size:13px;font-weight:600;cursor:pointer;}
        @media print{.ob-print-btn{display:none;}.ob-page{padding:0;}.ob-card{box-shadow:none;border-radius:0;}}
      `}</style>

      <div className="ob-page">

        {/* Print / Download button */}
        <div className="ob-print-btn">
          <button onClick={() => window.print()}>🖨️ Print / Save as PDF</button>
        </div>

        {/* ── EMAIL CARD ── */}
        <div className="ob-card">

          {/* Header */}
          <div className="ob-header">
            <img src="/pact-logo.png" alt="PACT" style={{ height: 48, marginBottom: 18, filter: 'brightness(0) invert(1)' }} />
            <h1>Welcome to PACT Command Center</h1>
            <p>Your unified platform for projects, tasks, payroll & field operations</p>
            <div className="ob-badge-row">
              <span className="ob-badge">🔒 Secure</span>
              <span className="ob-badge">📱 Mobile Ready</span>
              <span className="ob-badge">🌐 app.pactorg.com</span>
            </div>
          </div>

          {/* Body */}
          <div className="ob-body">

            <p className="ob-salute">
              Dear <strong>PACT Team</strong>,<br /><br />
              We are excited to officially launch the <strong>PACT Command Center</strong> — our centralized digital platform designed to manage everything from projects and daily tasks to contracts, payroll, and field operations in one place.<br /><br />
              To enable full automation of HR and financial processes — including contract management and payroll runs — <strong>we need all staff to be registered and active on the platform.</strong> Please follow the steps below to create your account today.
            </p>

            {/* Role callout */}
            <div className="ob-role-box">
              <div className="ob-icon">👤</div>
              <div>
                <strong>Your Role: Employee</strong>
                <span>All staff should register with the <strong>Employee</strong> role. Your account will be reviewed and activated by the administration team. Managers and directors will be assigned elevated roles by the system admin after registration.</span>
              </div>
            </div>

            {/* Registration steps */}
            <div className="ob-section-title">📋 Registration Steps</div>
            <div className="ob-steps">
              {[
                { n: 1, title: 'Open the Platform', body: <>On any browser (Chrome recommended), go to: <a className="ob-step-link" href="https://app.pactorg.com">https://app.pactorg.com</a></> },
                { n: 2, title: 'Click "Sign Up"', body: 'On the login page, click the Sign Up or Create Account link below the login form.' },
                { n: 3, title: 'Enter Your Work Email & Password', body: 'Use your official PACT email address. Create a strong password (minimum 8 characters, include numbers and symbols).' },
                { n: 4, title: 'Select Role: Employee', body: <><strong style={{ color: '#2563eb' }}>When prompted to select your role, choose Employee.</strong> Do not select any other role — the system admin will upgrade roles for managers as needed.</> },
                { n: 5, title: 'Complete Your Profile', body: 'Fill in your full name, department, and job title. Upload a profile photo if you wish. This helps your manager assign tasks and approve requests correctly.' },
                { n: 6, title: 'Wait for Activation', body: 'Your account will be reviewed and activated by the admin team. You will receive a confirmation email once your account is ready.' },
                { n: 7, title: 'Log In & Explore', body: 'Once activated, log in and explore your personal dashboard. Start with My Tasks and My Board to see what has been assigned to you.' },
              ].map(s => (
                <div className="ob-step" key={s.n}>
                  <div className="ob-step-num">{s.n}</div>
                  <div className="ob-step-body">
                    <strong>{s.title}</strong>
                    <span>{s.body}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Features */}
            <div className="ob-section-title">🚀 What You Can Do on the Platform</div>
            <div className="ob-feat-grid">
              {[
                { icon: '📋', title: 'My Tasks', desc: 'View, update, and complete tasks assigned to you. Add comments, attach files, and log your daily output with proof uploads.' },
                { icon: '🗂️', title: 'Projects', desc: 'See all projects you are part of. Track progress, view milestones, and collaborate with your team in a structured workflow.' },
                { icon: '📌', title: 'My Board', desc: 'A personal Kanban board showing all your tasks. Drag cards between To Do → In Progress → Done to stay organized.' },
                { icon: '⏱️', title: 'Timesheets', desc: 'Log your daily work hours. Timesheets feed directly into payroll calculations so accuracy is important.' },
                { icon: '📄', title: 'Contracts & Payroll', desc: 'View your employment contract, track payment history, and download payslips — all digitally within the platform.' },
                { icon: '🏖️', title: 'Leave Requests', desc: 'Submit leave applications, check your leave balance, and track approval status in real time.' },
                { icon: '📊', title: 'Reports & Analytics', desc: 'Access dashboards relevant to your work. See your task completion rates, project health, and field operation summaries.' },
                { icon: '🔔', title: 'Notifications', desc: 'Receive real-time alerts for task assignments, approvals, deadlines, and announcements — in-app and via WhatsApp.' },
              ].map(f => (
                <div className="ob-feat" key={f.title}>
                  <div className="ob-feat-icon">{f.icon}</div>
                  <strong>{f.title}</strong>
                  <span>{f.desc}</span>
                </div>
              ))}
            </div>

            {/* Priority */}
            <div className="ob-section-title">⚡ Immediate Priority Actions</div>
            <div className="ob-priority-box">
              <strong>Once registered, please complete the following right away:</strong>
              <ul>
                <li>Confirm your profile information (name, department, position, phone number)</li>
                <li>Check for any tasks already assigned to you in <em>My Tasks</em></li>
                <li>Inform your line manager that your account is active</li>
                <li>Contract and payroll processing will begin once all staff are on board — <strong>register by the deadline communicated by your manager</strong></li>
              </ul>
            </div>

            <hr className="ob-divider" />

            {/* For managers */}
            <div className="ob-section-title">🏢 For Managers & Directors</div>
            <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.7, marginBottom: 16 }}>Once your team is registered, you will be able to:</p>
            <div className="ob-feat-grid">
              {[
                { icon: '👥', title: 'Team Management', desc: 'Assign tasks to team members, monitor workload, and track completion rates from your Team Monitor dashboard.' },
                { icon: '✅', title: 'Approvals', desc: 'Approve leave requests, timesheets, expense submissions, and procurement — all in one place with a full audit trail.' },
                { icon: '💰', title: 'Payroll & Contracts', desc: 'Run payroll cycles, review staff contracts, approve salary changes, and generate payslips — automated once all staff are registered.' },
                { icon: '📈', title: 'Portfolio Dashboard', desc: 'Cross-project KPI overview: budget utilization, milestone tracking, project health scores, and risk alerts — all in real time.' },
              ].map(f => (
                <div className="ob-feat" key={f.title}>
                  <div className="ob-feat-icon">{f.icon}</div>
                  <strong>{f.title}</strong>
                  <span>{f.desc}</span>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="ob-cta-wrap">
              <a className="ob-cta" href="https://app.pactorg.com">Register Now → app.pactorg.com</a>
            </div>
            <p style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8', marginTop: 12 }}>
              If you have any issues registering, contact the IT team or your line manager immediately.
            </p>

          </div>

          {/* Footer */}
          <div className="ob-footer">
            <p>
              <strong>PACT Sudan — Command Center</strong><br />
              This is an internal communication. Please do not share your login credentials.<br />
              Platform: <a href="https://app.pactorg.com" style={{ color: '#2563eb' }}>app.pactorg.com</a> &nbsp;·&nbsp; Support: IT Help Desk
            </p>
          </div>

        </div>{/* /card */}

        {/* ── QUICK REFERENCE GUIDE ── */}
        <h2 className="ob-guide-title">📖 Quick Reference Guide</h2>
        <p className="ob-guide-sub">Print or share this section with your team as a desk reference</p>

        <div className="ob-card" style={{ marginBottom: 24 }}>
          <div className="ob-body">
            <div className="ob-section-title">Platform Modules at a Glance</div>
            <table className="ob-ref">
              <thead>
                <tr><th>Module</th><th>Who Uses It</th><th>What It Does</th></tr>
              </thead>
              <tbody>
                {[
                  ['Projects', 'All staff', 'Full project lifecycle — planning, execution, milestones, Gantt, budget, and health tracking'],
                  ['My Tasks / Board', 'All staff', 'Personal task list with Kanban board, due dates, priorities, subtasks, and output logging'],
                  ['Daily Work', 'All staff', 'Log daily accomplishments with proof uploads — feeds into performance reviews'],
                  ['Timesheets', 'All staff', 'Track work hours per project/activity — required for payroll accuracy'],
                  ['HR Hub', 'HR / Managers', 'Staff contracts, payroll runs, leave management, performance reviews, salary increments, and EOSB calculations'],
                  ['Finance', 'Finance / Directors', 'Journal entries, budget vs actuals, donor fund tracking, procurement (P2P), payslip generation'],
                  ['Site Visits / MMP', 'Field staff / Coordinators', 'Monthly Monitoring Plans, GPS site visits, coverage tracking, coordinator dashboard'],
                  ['Surveys', 'Data collectors / M&E', 'Build and distribute surveys, collect responses offline, analyze results with charts and cross-tabs'],
                  ['Reports', 'All roles', 'Generate PDF/Excel exports for projects, finance, HR, field operations, and donor reporting'],
                ].map(([mod, who, desc]) => (
                  <tr key={mod}><td><strong>{mod}</strong></td><td>{who}</td><td>{desc}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="ob-card" style={{ marginBottom: 24 }}>
          <div className="ob-body">
            <div className="ob-section-title">User Roles Explained</div>
            <table className="ob-ref">
              <thead>
                <tr><th>Role</th><th>Who Gets It</th><th>Key Permissions</th></tr>
              </thead>
              <tbody>
                {[
                  ['Employee ⭐', 'All staff (default)', 'View & update own tasks · Log work · Submit leave · View own contract & payslip · Join projects'],
                  ['Manager', 'Team leads / Coordinators', 'Everything above + assign tasks · Approve leave & timesheets · View team dashboard'],
                  ['Director', 'Department heads', 'Portfolio view · Cross-project analytics · Approve budgets · Access financial dashboards'],
                  ['HR Admin', 'HR team', 'Full HR hub access — payroll runs, contracts, salary management, EOSB calculations'],
                  ['Finance Admin', 'Finance team', 'Full accounting suite — GL, budgets, procurement, reconciliation, donor reporting'],
                  ['Super Admin', 'IT / System admin', 'Full platform access including user management, audit logs, and system settings'],
                ].map(([role, who, perms]) => (
                  <tr key={role}><td><strong>{role}</strong></td><td>{who}</td><td>{perms}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="ob-card">
          <div className="ob-body">
            <div className="ob-section-title">Need Help?</div>
            <div className="ob-steps">
              {[
                { color: '#059669', icon: '✉', title: 'Contact IT Help Desk', desc: 'For login issues, account activation, or technical problems — reach out to the IT team or your system administrator.' },
                { color: '#7c3aed', icon: '📱', title: 'Mobile Access', desc: <>The platform works on all mobile browsers. Open <strong>app.pactorg.com</strong> on your phone and add it to your home screen for quick access.</> },
                { color: '#d97706', icon: '🔐', title: 'Security Reminder', desc: "Never share your password. The platform contains sensitive HR and financial data. If you suspect unauthorized access, inform IT immediately." },
              ].map(s => (
                <div className="ob-step" key={s.title}>
                  <div className="ob-step-num" style={{ background: s.color }}>{s.icon}</div>
                  <div className="ob-step-body">
                    <strong>{s.title}</strong>
                    <span>{s.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="ob-footer">
            <p>PACT Command Center &nbsp;·&nbsp; Internal Use Only &nbsp;·&nbsp; Confidential<br /><strong>app.pactorg.com</strong></p>
          </div>
        </div>

      </div>
    </div>
  );
}
