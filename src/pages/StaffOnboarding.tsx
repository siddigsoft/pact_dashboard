export default function StaffOnboarding() {
  return (
    <div style={{ fontFamily: "'Segoe UI', 'Inter', Arial, sans-serif", background: '#EEF2F7', minHeight: '100vh' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; }

        .ob-wrap { max-width: 860px; margin: 0 auto; padding: 40px 20px 80px; }

        /* ── HERO ── */
        .ob-hero {
          background: linear-gradient(150deg, #0f2d6e 0%, #1a52c8 55%, #2d7aff 100%);
          border-radius: 20px;
          padding: 60px 48px 52px;
          text-align: center;
          position: relative;
          overflow: hidden;
          margin-bottom: 32px;
          box-shadow: 0 20px 60px rgba(15,45,110,0.35);
        }
        .ob-hero::before {
          content: '';
          position: absolute;
          top: -80px; right: -80px;
          width: 320px; height: 320px;
          background: rgba(255,255,255,0.05);
          border-radius: 50%;
        }
        .ob-hero::after {
          content: '';
          position: absolute;
          bottom: -100px; left: -60px;
          width: 280px; height: 280px;
          background: rgba(255,255,255,0.04);
          border-radius: 50%;
        }
        .ob-hero-logo {
          height: 56px;
          margin-bottom: 24px;
          filter: brightness(0) invert(1);
          opacity: 0.95;
        }
        .ob-hero h1 {
          color: #fff;
          font-size: 38px;
          font-weight: 900;
          line-height: 1.15;
          letter-spacing: -0.5px;
          margin-bottom: 14px;
        }
        .ob-hero-sub {
          color: #a5c8ff;
          font-size: 18px;
          font-weight: 500;
          line-height: 1.5;
          max-width: 580px;
          margin: 0 auto 28px;
        }
        .ob-hero-chips {
          display: flex;
          justify-content: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .ob-chip {
          background: rgba(255,255,255,0.14);
          border: 1.5px solid rgba(255,255,255,0.28);
          color: #fff;
          border-radius: 999px;
          font-size: 14px;
          font-weight: 600;
          padding: 6px 18px;
          letter-spacing: 0.01em;
        }

        /* ── URGENCY BANNER ── */
        .ob-urgency {
          background: linear-gradient(135deg, #7f1d1d 0%, #991b1b 60%, #b91c1c 100%);
          border-radius: 16px;
          padding: 36px 36px 32px;
          margin-bottom: 32px;
          box-shadow: 0 16px 48px rgba(153,27,27,0.45);
          position: relative;
          overflow: hidden;
        }
        .ob-urgency::before {
          content: '';
          position: absolute;
          top: -40px; right: -40px;
          width: 180px; height: 180px;
          background: rgba(255,255,255,0.05);
          border-radius: 50%;
        }
        .ob-urgency-top {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 16px;
        }
        .ob-urgency-badge {
          background: #fff;
          color: #991b1b;
          font-size: 13px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          padding: 5px 16px;
          border-radius: 999px;
          flex-shrink: 0;
        }
        .ob-urgency-title {
          font-size: 30px;
          font-weight: 900;
          color: #fff;
          line-height: 1.2;
          letter-spacing: -0.3px;
          margin-bottom: 14px;
        }
        .ob-urgency-body {
          font-size: 18px;
          color: #fecaca;
          line-height: 1.75;
        }
        .ob-urgency-body strong {
          color: #fff;
          font-weight: 800;
        }
        .ob-urgency-divider {
          border: none;
          border-top: 1px solid rgba(255,255,255,0.2);
          margin: 20px 0;
        }
        .ob-urgency-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 20px;
        }
        .ob-urgency-pill {
          background: rgba(255,255,255,0.15);
          border: 1.5px solid rgba(255,255,255,0.35);
          color: #fff;
          font-size: 14px;
          font-weight: 700;
          padding: 7px 18px;
          border-radius: 999px;
        }

        /* ── CARD ── */
        .ob-card {
          background: #fff;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 4px 24px rgba(0,0,0,0.08);
          margin-bottom: 28px;
        }
        .ob-card-header {
          padding: 28px 36px 20px;
          border-bottom: 2px solid #f1f5f9;
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .ob-card-header-icon {
          font-size: 30px;
          flex-shrink: 0;
        }
        .ob-card-title {
          font-size: 22px;
          font-weight: 800;
          color: #0f2d6e;
          letter-spacing: -0.3px;
        }
        .ob-card-subtitle {
          font-size: 14px;
          color: #64748b;
          font-weight: 400;
          margin-top: 2px;
        }
        .ob-card-body { padding: 32px 36px 36px; }

        /* ── INTRO TEXT ── */
        .ob-intro {
          font-size: 17px;
          color: #334155;
          line-height: 1.8;
          margin-bottom: 0;
        }
        .ob-intro strong { color: #0f172a; }

        /* ── ROLE BOX ── */
        .ob-role {
          background: linear-gradient(135deg, #eff6ff, #dbeafe);
          border: 2px solid #93c5fd;
          border-radius: 12px;
          padding: 24px 28px;
          display: flex;
          align-items: flex-start;
          gap: 18px;
          margin-top: 24px;
        }
        .ob-role-icon { font-size: 36px; flex-shrink: 0; }
        .ob-role-label {
          font-size: 20px;
          font-weight: 800;
          color: #1d4ed8;
          margin-bottom: 6px;
        }
        .ob-role-desc {
          font-size: 16px;
          color: #1e3a8a;
          line-height: 1.65;
        }

        /* ── STEPS ── */
        .ob-steps { display: flex; flex-direction: column; gap: 16px; }
        .ob-step {
          display: flex;
          align-items: flex-start;
          gap: 18px;
          background: #f8fafc;
          border: 1.5px solid #e2e8f0;
          border-radius: 12px;
          padding: 20px 24px;
          transition: border-color 0.2s;
        }
        .ob-step-highlight {
          background: #eff6ff;
          border-color: #2563eb;
        }
        .ob-step-num {
          flex-shrink: 0;
          width: 42px;
          height: 42px;
          border-radius: 50%;
          background: #0f2d6e;
          color: #fff;
          font-size: 18px;
          font-weight: 800;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(15,45,110,0.3);
        }
        .ob-step-highlight .ob-step-num { background: #2563eb; }
        .ob-step-content {}
        .ob-step-title {
          font-size: 18px;
          font-weight: 700;
          color: #1e293b;
          margin-bottom: 6px;
        }
        .ob-step-highlight .ob-step-title { color: #1d4ed8; }
        .ob-step-desc {
          font-size: 15px;
          color: #475569;
          line-height: 1.65;
        }
        .ob-step-link {
          color: #2563eb;
          font-weight: 700;
          font-size: 16px;
          text-decoration: none;
          word-break: break-all;
        }

        /* ── WHATSAPP BOX ── */
        .ob-wa {
          background: linear-gradient(135deg, #dcfce7, #bbf7d0);
          border: 2px solid #4ade80;
          border-radius: 14px;
          padding: 28px 32px;
          display: flex;
          align-items: center;
          gap: 20px;
          margin-top: 28px;
          box-shadow: 0 4px 16px rgba(34,197,94,0.15);
        }
        .ob-wa-icon { font-size: 44px; flex-shrink: 0; }
        .ob-wa-title {
          font-size: 20px;
          font-weight: 800;
          color: #14532d;
          margin-bottom: 6px;
        }
        .ob-wa-number {
          font-size: 28px;
          font-weight: 900;
          color: #16a34a;
          letter-spacing: 0.5px;
          margin-bottom: 6px;
        }
        .ob-wa-desc {
          font-size: 15px;
          color: #166534;
          line-height: 1.6;
        }
        .ob-wa-btn {
          display: inline-block;
          background: #16a34a;
          color: #fff;
          border-radius: 10px;
          padding: 12px 24px;
          font-size: 15px;
          font-weight: 700;
          text-decoration: none;
          margin-top: 12px;
          box-shadow: 0 4px 12px rgba(22,163,74,0.35);
        }

        /* ── FEATURE GRID ── */
        .ob-feat-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        @media (max-width: 560px) { .ob-feat-grid { grid-template-columns: 1fr; } }
        .ob-feat {
          background: #f8fafc;
          border: 1.5px solid #e2e8f0;
          border-radius: 12px;
          padding: 20px 22px;
        }
        .ob-feat-top {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 10px;
        }
        .ob-feat-icon { font-size: 26px; }
        .ob-feat-title {
          font-size: 17px;
          font-weight: 700;
          color: #1e293b;
        }
        .ob-feat-desc {
          font-size: 14px;
          color: #64748b;
          line-height: 1.65;
        }

        /* ── PRIORITY LIST ── */
        .ob-priority {
          background: #fff7ed;
          border: 2px solid #fb923c;
          border-radius: 12px;
          padding: 24px 28px;
        }
        .ob-priority-title {
          font-size: 19px;
          font-weight: 800;
          color: #9a3412;
          margin-bottom: 14px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .ob-priority ul { list-style: none; display: flex; flex-direction: column; gap: 10px; }
        .ob-priority li {
          font-size: 16px;
          color: #7c2d12;
          line-height: 1.6;
          display: flex;
          align-items: flex-start;
          gap: 10px;
        }
        .ob-priority li::before {
          content: '✓';
          color: #ea580c;
          font-weight: 800;
          font-size: 16px;
          flex-shrink: 0;
          margin-top: 1px;
        }

        /* ── TABLE ── */
        table.ob-ref { width: 100%; border-collapse: collapse; }
        table.ob-ref th {
          background: #0f2d6e;
          color: #fff;
          font-size: 14px;
          font-weight: 700;
          padding: 14px 18px;
          text-align: left;
          letter-spacing: 0.02em;
        }
        table.ob-ref td {
          font-size: 15px;
          color: #334155;
          padding: 14px 18px;
          border-bottom: 1px solid #e2e8f0;
          vertical-align: top;
          line-height: 1.55;
        }
        table.ob-ref tr:last-child td { border-bottom: none; }
        table.ob-ref tr:nth-child(even) td { background: #f8fafc; }

        /* ── CTA ── */
        .ob-cta-wrap {
          background: linear-gradient(135deg, #0f2d6e 0%, #1a52c8 100%);
          border-radius: 16px;
          padding: 48px 40px;
          text-align: center;
          box-shadow: 0 16px 48px rgba(15,45,110,0.3);
        }
        .ob-cta-wrap h2 {
          color: #fff;
          font-size: 30px;
          font-weight: 900;
          margin-bottom: 12px;
        }
        .ob-cta-wrap p {
          color: #93c5fd;
          font-size: 17px;
          margin-bottom: 28px;
          line-height: 1.6;
        }
        .ob-cta-btn {
          display: inline-block;
          background: #fff;
          color: #0f2d6e;
          border-radius: 12px;
          padding: 18px 48px;
          font-size: 20px;
          font-weight: 900;
          text-decoration: none;
          letter-spacing: 0.01em;
          box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        }

        /* ── FOOTER ── */
        .ob-footer {
          text-align: center;
          margin-top: 32px;
          padding: 0 20px;
        }
        .ob-footer p {
          font-size: 14px;
          color: #94a3b8;
          line-height: 1.8;
        }

        /* ── PRINT ── */
        .ob-print-bar {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 16px;
        }
        .ob-print-btn {
          background: #0f2d6e;
          color: #fff;
          border: none;
          border-radius: 10px;
          padding: 10px 22px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          letter-spacing: 0.02em;
        }
        @media print {
          .ob-print-bar { display: none; }
          .ob-wrap { padding: 0; }
          .ob-hero { box-shadow: none; }
          .ob-card { box-shadow: none; }
        }
      `}</style>

      <div className="ob-wrap">

        {/* Print button */}
        <div className="ob-print-bar">
          <button className="ob-print-btn" onClick={() => window.print()}>🖨️ Print / Save as PDF</button>
        </div>

        {/* ── HERO ── */}
        <div className="ob-hero">
          <img className="ob-hero-logo" src="/pact-logo.png" alt="PACT" />
          <h1>Welcome to PACT Command Center</h1>
          <p className="ob-hero-sub">
            Your unified platform for projects, daily tasks, contracts, payroll & field operations — all in one place.
          </p>
          <div className="ob-hero-chips">
            <span className="ob-chip">🔒 Secure</span>
            <span className="ob-chip">📱 Mobile Ready</span>
            <span className="ob-chip">🌐 app.pactorg.com</span>
            <span className="ob-chip">💬 WhatsApp Notifications</span>
          </div>
        </div>

        {/* ── URGENCY BANNER ── */}
        <div className="ob-urgency">
          <div className="ob-urgency-top">
            <span className="ob-urgency-badge">🚨 &nbsp;MANDATORY — MANAGEMENT DIRECTIVE</span>
          </div>
          <div className="ob-urgency-title">
            All Teams Must Be On the System — No Exceptions
          </div>
          <div className="ob-urgency-body">
            This is a <strong>formal management directive.</strong> PACT Command Center is now the official platform for all operations across every department and hub.<br /><br />
            <strong>Every team member — without exception — is required to register, log in, and actively use the system for all work activities.</strong> Continued use of offline methods, spreadsheets, or parallel tracking tools is no longer permitted.<br /><br />
            Management will monitor adoption across all teams. <strong>Non-compliance will be escalated directly to department heads.</strong> Your team's onboarding status is visible in real time to senior leadership.
          </div>
          <hr className="ob-urgency-divider" />
          <div className="ob-urgency-pills">
            <span className="ob-urgency-pill">🏢 All departments &amp; hubs required</span>
            <span className="ob-urgency-pill">📊 Adoption tracked by management</span>
            <span className="ob-urgency-pill">💰 Payroll &amp; contracts run through the system only</span>
            <span className="ob-urgency-pill">⚠️ Non-compliance escalated to department heads</span>
          </div>
        </div>

        {/* ── INTRODUCTION ── */}
        <div className="ob-card">
          <div className="ob-card-header">
            <div className="ob-card-header-icon">📢</div>
            <div>
              <div className="ob-card-title">Dear PACT Team</div>
              <div className="ob-card-subtitle">Important announcement from Management</div>
            </div>
          </div>
          <div className="ob-card-body">
            <p className="ob-intro">
              We are officially launching the <strong>PACT Command Center</strong> — our centralized digital platform built to manage everything from <strong>daily tasks and projects</strong> to <strong>contracts, payroll, and field operations</strong> in one secure place.<br /><br />
              To enable full automation of HR and financial processes — including digital contract signing and payroll runs — <strong>every staff member must be registered and active on the platform.</strong>
            </p>

            {/* Role box */}
            <div className="ob-role">
              <div className="ob-role-icon">👤</div>
              <div>
                <div className="ob-role-label">Your Role: EMPLOYEE</div>
                <div className="ob-role-desc">
                  All staff register with the <strong>Employee</strong> role. Do not select any other role during registration. Managers and directors will be upgraded by the system administrator after registration is complete.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── REGISTRATION STEPS ── */}
        <div className="ob-card">
          <div className="ob-card-header">
            <div className="ob-card-header-icon">📋</div>
            <div>
              <div className="ob-card-title">How to Register — Step by Step</div>
              <div className="ob-card-subtitle">Follow these 7 steps to create your account</div>
            </div>
          </div>
          <div className="ob-card-body">
            <div className="ob-steps">

              <div className="ob-step">
                <div className="ob-step-num">1</div>
                <div className="ob-step-content">
                  <div className="ob-step-title">Open the Platform in Your Browser</div>
                  <div className="ob-step-desc">
                    Go to: <a className="ob-step-link" href="https://app.pactorg.com" target="_blank" rel="noreferrer">https://app.pactorg.com</a><br />
                    Works on Chrome, Firefox, Edge — and on your mobile phone.
                  </div>
                </div>
              </div>

              <div className="ob-step">
                <div className="ob-step-num">2</div>
                <div className="ob-step-content">
                  <div className="ob-step-title">Click "Sign Up" on the Login Page</div>
                  <div className="ob-step-desc">
                    You will see a login form. Click the <strong>Sign Up</strong> link below it to start creating your account.
                  </div>
                </div>
              </div>

              <div className="ob-step">
                <div className="ob-step-num">3</div>
                <div className="ob-step-content">
                  <div className="ob-step-title">Enter Your Official PACT Work Email</div>
                  <div className="ob-step-desc">
                    Use your official PACT email address. Create a strong password — at least 8 characters, include numbers and symbols (e.g. <em>Pact@2026</em>).
                  </div>
                </div>
              </div>

              <div className="ob-step ob-step-highlight">
                <div className="ob-step-num">4</div>
                <div className="ob-step-content">
                  <div className="ob-step-title">⭐ Select Role: EMPLOYEE</div>
                  <div className="ob-step-desc">
                    When prompted to choose your role, select <strong>Employee</strong>. This is the correct role for all staff. Managers will be upgraded separately by the admin team.
                  </div>
                </div>
              </div>

              <div className="ob-step">
                <div className="ob-step-num">5</div>
                <div className="ob-step-content">
                  <div className="ob-step-title">Complete Your Profile</div>
                  <div className="ob-step-desc">
                    Enter your <strong>full name</strong>, <strong>department</strong>, <strong>job title</strong>, and <strong>phone number</strong>. A complete profile allows your manager to assign tasks and process payroll correctly.
                  </div>
                </div>
              </div>

              <div className="ob-step">
                <div className="ob-step-num">6</div>
                <div className="ob-step-content">
                  <div className="ob-step-title">Wait for Account Activation</div>
                  <div className="ob-step-desc">
                    The admin team will review and activate your account. You will receive a confirmation email once it is ready — usually within 24 hours.
                  </div>
                </div>
              </div>

              <div className="ob-step">
                <div className="ob-step-num">7</div>
                <div className="ob-step-content">
                  <div className="ob-step-title">Log In and Explore Your Dashboard</div>
                  <div className="ob-step-desc">
                    Once activated, log in and go to <strong>My Tasks</strong> and <strong>My Board</strong> to see your assignments and get started.
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* ── WHATSAPP STEP ── */}
        <div className="ob-card">
          <div className="ob-card-header">
            <div className="ob-card-header-icon">💬</div>
            <div>
              <div className="ob-card-title">Enable WhatsApp Notifications</div>
              <div className="ob-card-subtitle">Receive real-time task alerts and updates directly on WhatsApp</div>
            </div>
          </div>
          <div className="ob-card-body">
            <div className="ob-wa">
              <div className="ob-wa-icon">📱</div>
              <div>
                <div className="ob-wa-title">Send a WhatsApp message to activate notifications</div>
                <div className="ob-wa-number">+256 751 900 013</div>
                <div className="ob-wa-desc">
                  Send a WhatsApp message to the number above saying <strong>"Hi PACT"</strong> or your name to opt in to platform notifications. You will then receive real-time alerts for:
                  <ul style={{ marginTop: 10, paddingLeft: 20, lineHeight: 1.8 }}>
                    <li>New tasks assigned to you</li>
                    <li>Approvals and decisions on your requests</li>
                    <li>Deadline reminders</li>
                    <li>Payroll and contract updates</li>
                    <li>Important announcements from management</li>
                  </ul>
                </div>
                <a
                  className="ob-wa-btn"
                  href="https://wa.me/256751900013?text=Hi%20PACT%20-%20I%20have%20registered%20on%20the%20Command%20Center"
                  target="_blank"
                  rel="noreferrer"
                >
                  💬 Open WhatsApp Chat
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* ── WHAT YOU CAN DO ── */}
        <div className="ob-card">
          <div className="ob-card-header">
            <div className="ob-card-header-icon">🚀</div>
            <div>
              <div className="ob-card-title">What You Can Do as an Employee</div>
              <div className="ob-card-subtitle">Everything available to you once your account is active</div>
            </div>
          </div>
          <div className="ob-card-body">
            <div className="ob-feat-grid">
              {[
                { icon: '📋', title: 'My Tasks', desc: 'View and update all tasks assigned to you. Add comments, attach files, and mark tasks complete. Log your daily output with proof uploads.' },
                { icon: '📌', title: 'My Board (Kanban)', desc: 'A personal Kanban board showing all your tasks. Drag cards from To Do → In Progress → Done to track your work visually.' },
                { icon: '🗂️', title: 'Projects', desc: 'See all projects you are part of. View milestones, progress, and collaborate with your team within a structured workflow.' },
                { icon: '⏱️', title: 'Timesheets', desc: 'Log your daily working hours per project or task — only required if the project or task has a paid timesheet. These hours feed directly into payroll calculations.' },
                { icon: '📄', title: 'Contracts & Payslips', desc: 'View your employment contract and download monthly payslips as PDF, all stored securely in the platform.' },
                { icon: '🏖️', title: 'Leave Requests', desc: 'Submit leave applications online, check your leave balance, and track approval status in real time.' },
                { icon: '🔔', title: 'Notifications', desc: 'Receive instant alerts for new task assignments, approvals, deadlines, and announcements — in-app and via WhatsApp.' },
                { icon: '📊', title: 'Reports & Dashboards', desc: 'Access dashboards showing your task completion, project health, and activity summaries relevant to your work.' },
              ].map(f => (
                <div className="ob-feat" key={f.title}>
                  <div className="ob-feat-top">
                    <span className="ob-feat-icon">{f.icon}</span>
                    <span className="ob-feat-title">{f.title}</span>
                  </div>
                  <div className="ob-feat-desc">{f.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── PRIORITY CHECKLIST ── */}
        <div className="ob-card">
          <div className="ob-card-header">
            <div className="ob-card-header-icon">✅</div>
            <div>
              <div className="ob-card-title">Checklist — Do This Right Away</div>
              <div className="ob-card-subtitle">Complete these steps immediately after registering</div>
            </div>
          </div>
          <div className="ob-card-body">
            <div className="ob-priority">
              <div className="ob-priority-title">
                <span>📌</span> Your Immediate Action List
              </div>
              <ul>
                <li>Register at <strong>app.pactorg.com</strong> using your official PACT email</li>
                <li>Select role <strong>Employee</strong> during registration</li>
                <li>Complete your full profile — name, department, job title, and phone number</li>
                <li>Send <strong>"Hi PACT"</strong> via WhatsApp to <strong>+256 751 900 013</strong> to enable notifications</li>
                <li>Inform your line manager that your account has been created</li>
                <li>Check <strong>My Tasks</strong> for any work already assigned to you</li>
                <li>Contracts and payroll will begin once <strong>all staff are on board</strong></li>
              </ul>
            </div>
          </div>
        </div>

        {/* ── FOR MANAGERS ── */}
        <div className="ob-card">
          <div className="ob-card-header">
            <div className="ob-card-header-icon">🏢</div>
            <div>
              <div className="ob-card-title">For Managers & Directors</div>
              <div className="ob-card-subtitle">Additional capabilities unlocked once your team is registered</div>
            </div>
          </div>
          <div className="ob-card-body">
            <div className="ob-feat-grid">
              {[
                { icon: '👥', title: 'Team Monitor', desc: 'Real-time dashboard of your team\'s task load, completion rates, and daily activity. Identify overloaded or underperforming staff instantly.' },
                { icon: '✅', title: 'Approvals Hub', desc: 'Approve leave, timesheets, expense submissions, and procurement — all in one place with a full digital audit trail.' },
                { icon: '💰', title: 'Payroll & Contracts', desc: 'Run payroll cycles, generate payslips, manage salary changes and EOSB calculations automatically.' },
                { icon: '📈', title: 'Portfolio Dashboard', desc: 'Cross-project KPIs, budget utilization, milestone tracking, and project health matrix for full management visibility.' },
              ].map(f => (
                <div className="ob-feat" key={f.title}>
                  <div className="ob-feat-top">
                    <span className="ob-feat-icon">{f.icon}</span>
                    <span className="ob-feat-title">{f.title}</span>
                  </div>
                  <div className="ob-feat-desc">{f.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── ROLES TABLE ── */}
        <div className="ob-card">
          <div className="ob-card-header">
            <div className="ob-card-header-icon">🔐</div>
            <div>
              <div className="ob-card-title">User Roles at a Glance</div>
              <div className="ob-card-subtitle">All staff register as Employee — admin upgrades roles after registration</div>
            </div>
          </div>
          <div className="ob-card-body" style={{ padding: '0' }}>
            <table className="ob-ref">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Who Gets It</th>
                  <th>Key Permissions</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Employee ⭐', 'All staff (default)', 'View & update own tasks · Log work · Submit leave · View contract & payslips · Join projects'],
                  ['Data Collector', 'Field data entry staff', 'Record site visits · View assigned MMP sites · Submit field data'],
                  ['Coordinator', 'MMP coordinators', 'Manage site visits · View MMP plans · Track coverage & reporting'],
                  ['Supervisor', 'Field supervisors', 'All above + review & approve site visit submissions · Monitor team'],
                  ['Project Manager', 'Project leads', 'Full project management · Assign team · Approve finances · View reports'],
                  ['Field Operation Manager (FOM)', 'Operations managers', 'Create & approve MMPs · Manage field operations · View financial data'],
                  ['Country Director', 'Country-level leadership', 'Portfolio view · Cross-project analytics · Budget approvals · Financial dashboards'],
                  ['HR / HR Manager', 'HR team', 'Full HR hub — payroll runs, contracts, salary management, EOSB & gratuity calculations'],
                  ['Financial Admin', 'Finance team', 'Full accounting — GL, budgets, procurement (P2P), reconciliation, donor reporting'],
                  ['Admin', 'IT / System admin', 'Full platform access — user management, audit logs, system settings'],
                ].map(([role, who, perms]) => (
                  <tr key={role}><td><strong>{role}</strong></td><td>{who}</td><td>{perms}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── CTA ── */}
        <div className="ob-cta-wrap">
          <h2>Ready? Register Now</h2>
          <p>
            Open your browser, go to the link below, and complete registration in under 3 minutes.<br />
            Then send your WhatsApp message to <strong style={{ color: '#fff' }}>+256 751 900 013</strong> to enable notifications.
          </p>
          <a className="ob-cta-btn" href="https://app.pactorg.com" target="_blank" rel="noreferrer">
            🌐 &nbsp; app.pactorg.com
          </a>
        </div>

        {/* ── FOOTER ── */}
        <div className="ob-footer">
          <p>
            <strong style={{ color: '#475569' }}>PACT Sudan — Command Center</strong><br />
            Internal communication — do not share your login credentials with anyone.<br />
            Platform: <a href="https://app.pactorg.com" style={{ color: '#2563eb', fontWeight: 600 }}>app.pactorg.com</a>
            &nbsp;·&nbsp; WhatsApp Support: <strong style={{ color: '#16a34a' }}>+256 751 900 013</strong>
            &nbsp;·&nbsp; IT Help Desk
          </p>
          <p style={{ marginTop: '8px', color: '#94a3b8', fontSize: '13px' }}>
            © 2026 PACT — All rights reserved.
          </p>
        </div>

      </div>
    </div>
  );
}
