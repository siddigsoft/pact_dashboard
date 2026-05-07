/**
 * Generates PACT Command Center Staff Onboarding PowerPoint presentation.
 * Run with: node scripts/generate-onboarding-pptx.cjs
 */

const PptxGenJS = require('pptxgenjs');
const path      = require('path');
const fs        = require('fs');

const pptx = new PptxGenJS();

// ── Theme ────────────────────────────────────────────────────────────────────
const C = {
  navy:      '1A3A6B',
  blue:      '2563EB',
  lightBlue: 'BFDBFE',
  white:     'FFFFFF',
  offWhite:  'F8FAFC',
  slate:     '334155',
  gray:      '64748B',
  yellow:    'FCD34D',
  yellowBg:  'FEF9C3',
  green:     '059669',
  purple:    '7C3AED',
  orange:    'D97706',
  darkText:  '1E293B',
};

const FONT = 'Calibri';

pptx.layout  = 'LAYOUT_WIDE'; // 13.33 x 7.5 inches
pptx.author  = 'PACT Sudan';
pptx.company = 'PACT';
pptx.subject = 'Staff Onboarding — PACT Command Center';
pptx.title   = 'PACT Command Center Staff Onboarding';

// ── Slide master background helper ──────────────────────────────────────────
function addSlide(titleText, subtitle) {
  const slide = pptx.addSlide();
  // White background
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: '100%', fill: { color: C.white } });
  // Left accent bar
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.08, h: '100%', fill: { color: C.blue } });
  // Footer bar
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 6.9, w: '100%', h: 0.6, fill: { color: C.navy } });
  slide.addText('PACT Command Center  ·  Internal Onboarding  ·  app.pactorg.com', {
    x: 0.2, y: 6.95, w: 12.8, h: 0.4, fontSize: 9, color: C.lightBlue, fontFace: FONT, align: 'center',
  });

  if (titleText) {
    slide.addText(titleText, {
      x: 0.25, y: 0.2, w: 12.8, h: 0.55,
      fontSize: 22, bold: true, color: C.navy, fontFace: FONT,
    });
    // Title underline
    slide.addShape(pptx.ShapeType.rect, { x: 0.25, y: 0.78, w: 12.8, h: 0.04, fill: { color: C.lightBlue } });
  }
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.25, y: 0.85, w: 12.8, h: 0.4,
      fontSize: 13, color: C.gray, fontFace: FONT, italic: true,
    });
  }
  return slide;
}

// ── SLIDE 1 — Title ──────────────────────────────────────────────────────────
{
  const slide = pptx.addSlide();
  // Gradient-style background via two rectangles
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: '100%', fill: { color: C.navy } });
  slide.addShape(pptx.ShapeType.rect, { x: 6.5, y: 0, w: 6.83, h: '100%', fill: { color: C.blue }, transparency: 30 });

  // Decorative circles
  slide.addShape(pptx.ShapeType.ellipse, { x: 10.5, y: -1, w: 4, h: 4, fill: { color: C.lightBlue }, transparency: 85, line: { color: C.lightBlue } });
  slide.addShape(pptx.ShapeType.ellipse, { x: 11.5, y: 4.5, w: 2.5, h: 2.5, fill: { color: C.white }, transparency: 90, line: { color: C.white } });

  slide.addText('PACT', { x: 0.6, y: 0.6, w: 3, h: 0.5, fontSize: 28, bold: true, color: C.white, fontFace: FONT });
  slide.addShape(pptx.ShapeType.rect, { x: 0.6, y: 1.15, w: 1.2, h: 0.06, fill: { color: C.yellow } });

  slide.addText('Command Center', {
    x: 0.6, y: 1.3, w: 9, h: 0.7,
    fontSize: 38, bold: true, color: C.white, fontFace: FONT,
  });
  slide.addText('Staff Onboarding & Registration Guide', {
    x: 0.6, y: 2.15, w: 9, h: 0.55,
    fontSize: 20, color: C.lightBlue, fontFace: FONT,
  });
  slide.addText('How to register · What you can do · Contracts & Payroll kickoff', {
    x: 0.6, y: 2.8, w: 9, h: 0.45,
    fontSize: 13, color: C.lightBlue, fontFace: FONT, italic: true,
  });

  // Badges
  const badges = ['🔒 Secure', '📱 Mobile Ready', '🌐 app.pactorg.com'];
  badges.forEach((b, i) => {
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.6 + i * 2.3, y: 5.6, w: 2.1, h: 0.45,
      fill: { color: C.white }, transparency: 85,
      line: { color: C.white, width: 1 }, rectRadius: 0.1,
    });
    slide.addText(b, {
      x: 0.6 + i * 2.3, y: 5.6, w: 2.1, h: 0.45,
      fontSize: 11, color: C.white, fontFace: FONT, align: 'center', bold: true,
    });
  });

  slide.addText('Confidential — Internal Use Only', {
    x: 0, y: 6.9, w: '100%', h: 0.5,
    fontSize: 9, color: C.lightBlue, fontFace: FONT, align: 'center',
  });
}

// ── SLIDE 2 — What is PACT Command Center? ───────────────────────────────────
{
  const slide = addSlide('What is PACT Command Center?', 'A unified platform for all PACT operations — from field work to payroll');

  const items = [
    { icon: '🗂️', title: 'Projects & Tasks',     desc: 'Plan, assign, and track all work in structured projects with Gantt views, milestones, and health scores.' },
    { icon: '📊', title: 'Finance & Budgets',     desc: 'Full accounting suite — GL, budgets, procurement (P2P), donor reporting, and payroll generation.' },
    { icon: '👥', title: 'HR & People',           desc: 'Contracts, payroll runs, leave management, performance reviews, salary increments, and EOSB calculations.' },
    { icon: '🗺️', title: 'Field Operations',      desc: 'Site visits, MMP planning, GPS tracking, survey distribution, and coverage analytics.' },
    { icon: '📋', title: 'Daily Work & Tasks',    desc: 'Every staff member logs daily output, timesheets, and task progress — all feeding into performance and payroll.' },
    { icon: '🔔', title: 'Notifications & CRM',   desc: 'Real-time alerts, WhatsApp integration, partner management, and a full broadcast center.' },
  ];

  items.forEach((item, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 0.25 + col * 4.37;
    const y = 1.25 + row * 2.5;

    slide.addShape(pptx.ShapeType.roundRect, {
      x, y, w: 4.1, h: 2.2,
      fill: { color: C.offWhite }, line: { color: C.lightBlue, width: 1 }, rectRadius: 0.12,
    });
    slide.addText(item.icon, { x, y: y + 0.15, w: 4.1, h: 0.5, fontSize: 26, align: 'center' });
    slide.addText(item.title, {
      x: x + 0.15, y: y + 0.7, w: 3.8, h: 0.4,
      fontSize: 13, bold: true, color: C.navy, fontFace: FONT, align: 'center',
    });
    slide.addText(item.desc, {
      x: x + 0.15, y: y + 1.1, w: 3.8, h: 0.95,
      fontSize: 10, color: C.slate, fontFace: FONT, align: 'center',
    });
  });
}

// ── SLIDE 3 — Registration Steps ─────────────────────────────────────────────
{
  const slide = addSlide('Registration Steps', 'Complete all 7 steps to activate your PACT Command Center account');

  const steps = [
    { num: '1', title: 'Open the Platform',          desc: 'Go to  https://app.pactorg.com  in any browser (Chrome recommended)' },
    { num: '2', title: 'Click "Sign Up"',             desc: 'Find the Sign Up link below the login form on the homepage' },
    { num: '3', title: 'Enter Work Email & Password', desc: 'Use your official PACT email. Password must be 8+ characters with numbers & symbols' },
    { num: '4', title: 'Select Role: Employee',       desc: '⭐ Choose "Employee" — do NOT select any other role at registration' },
    { num: '5', title: 'Complete Your Profile',        desc: 'Add your full name, department, job title, and phone number' },
    { num: '6', title: 'Wait for Activation',          desc: 'Admin will review and activate your account. You\'ll receive a confirmation email' },
    { num: '7', title: 'Log In & Explore',             desc: 'Once active, go to My Tasks and My Board to see your assignments' },
  ];

  steps.forEach((s, i) => {
    const col = i < 4 ? 0 : 1;
    const row = i < 4 ? i : i - 4;
    const x = 0.25 + col * 6.6;
    const y = 1.25 + row * 1.38;
    const w = 6.2;

    slide.addShape(pptx.ShapeType.roundRect, {
      x, y, w, h: 1.2,
      fill: { color: i === 3 ? 'EFF6FF' : C.offWhite },
      line: { color: i === 3 ? C.blue : C.lightBlue, width: i === 3 ? 2 : 1 },
      rectRadius: 0.1,
    });
    // Step circle
    slide.addShape(pptx.ShapeType.ellipse, {
      x: x + 0.15, y: y + 0.3, w: 0.55, h: 0.55,
      fill: { color: i === 3 ? C.blue : C.navy }, line: { color: C.offWhite },
    });
    slide.addText(s.num, {
      x: x + 0.15, y: y + 0.3, w: 0.55, h: 0.55,
      fontSize: 13, bold: true, color: C.white, fontFace: FONT, align: 'center', valign: 'middle',
    });
    slide.addText(s.title, {
      x: x + 0.82, y: y + 0.12, w: w - 1, h: 0.38,
      fontSize: 13, bold: true, color: i === 3 ? C.blue : C.navy, fontFace: FONT,
    });
    slide.addText(s.desc, {
      x: x + 0.82, y: y + 0.5, w: w - 1, h: 0.58,
      fontSize: 10.5, color: C.slate, fontFace: FONT,
    });
  });
}

// ── SLIDE 4 — Your Role as Employee ──────────────────────────────────────────
{
  const slide = addSlide('Your Role: Employee', 'What every staff member can do once registered');

  // Role badge
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.25, y: 1.1, w: 12.8, h: 0.75,
    fill: { color: 'EFF6FF' }, line: { color: C.blue, width: 1.5 }, rectRadius: 0.1,
  });
  slide.addText('👤  Role: EMPLOYEE — Default role for ALL staff. Assigned automatically at registration. Managers will be upgraded by the system admin.', {
    x: 0.45, y: 1.1, w: 12.4, h: 0.75,
    fontSize: 13, bold: true, color: C.blue, fontFace: FONT, valign: 'middle',
  });

  const caps = [
    { icon: '📋', label: 'View & update tasks assigned to me' },
    { icon: '📌', label: 'Manage my Kanban board (drag & drop)' },
    { icon: '🗂️', label: 'Participate in projects I am part of' },
    { icon: '⏱️', label: 'Submit daily timesheets' },
    { icon: '📝', label: 'Log daily work output & upload proof' },
    { icon: '🏖️', label: 'Submit & track leave requests' },
    { icon: '📄', label: 'View my contract & download payslips' },
    { icon: '🔔', label: 'Receive task & approval notifications' },
    { icon: '📊', label: 'View my project dashboards' },
    { icon: '🌐', label: 'Access from any device — mobile ready' },
  ];

  caps.forEach((c, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.25 + col * 6.4;
    const y = 2.1 + row * 0.88;

    slide.addShape(pptx.ShapeType.rect, {
      x: x + 0.08, y: y + 0.25, w: 0.04, h: 0.35, fill: { color: C.blue },
    });
    slide.addText(c.icon + '  ' + c.label, {
      x: x + 0.25, y, w: 6, h: 0.7,
      fontSize: 12, color: C.slate, fontFace: FONT, valign: 'middle',
    });
  });
}

// ── SLIDE 5 — Projects & Tasks ────────────────────────────────────────────────
{
  const slide = addSlide('Projects & Tasks — The Core of Your Work', 'Everything starts with a project and flows down to individual tasks');

  // Three columns
  const cols = [
    {
      color: C.navy, icon: '🗂️', title: 'Projects',
      points: [
        'Structured project lifecycle (10 types)',
        'Gantt chart & milestones',
        'Budget tracking vs actuals',
        'Health score & risk alerts',
        'PDF reports & archive',
        'Field task tracker with dependencies',
      ],
    },
    {
      color: C.blue, icon: '📌', title: 'My Board (Kanban)',
      points: [
        'Personal Kanban: To Do → In Progress → Done',
        'Drag cards to update status instantly',
        'All tasks across all projects in one view',
        'Priority flags (High / Medium / Low)',
        'Due date alerts & deadline tracking',
        'Filter by project, priority, or date',
      ],
    },
    {
      color: C.green, icon: '✅', title: 'My Tasks',
      points: [
        'See every task assigned to you',
        'Add subtasks and set progress %',
        'Attach files and add comments',
        'Log daily output with proof uploads',
        'Recurring tasks auto-generate',
        'Earn completion rewards',
      ],
    },
  ];

  cols.forEach((col, i) => {
    const x = 0.25 + i * 4.37;
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y: 1.1, w: 4.1, h: 5.55,
      fill: { color: C.offWhite }, line: { color: C.lightBlue, width: 1 }, rectRadius: 0.12,
    });
    // Header
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y: 1.1, w: 4.1, h: 1.0,
      fill: { color: col.color }, line: { color: C.offWhite }, rectRadius: 0.12,
    });
    slide.addText(col.icon + '  ' + col.title, {
      x: x + 0.15, y: 1.15, w: 3.8, h: 0.85,
      fontSize: 15, bold: true, color: C.white, fontFace: FONT, valign: 'middle',
    });
    col.points.forEach((p, pi) => {
      slide.addShape(pptx.ShapeType.ellipse, {
        x: x + 0.22, y: 2.25 + pi * 0.73 + 0.18, w: 0.12, h: 0.12,
        fill: { color: col.color }, line: { color: C.offWhite },
      });
      slide.addText(p, {
        x: x + 0.42, y: 2.25 + pi * 0.73, w: 3.5, h: 0.58,
        fontSize: 10.5, color: C.slate, fontFace: FONT,
      });
    });
  });
}

// ── SLIDE 6 — Contracts & Payroll ────────────────────────────────────────────
{
  const slide = addSlide('Contracts & Payroll — Why You Need to Register NOW', 'Payroll and contract processing is ready — we just need all staff on board');

  // Urgency banner
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.25, y: 1.1, w: 12.8, h: 0.8,
    fill: { color: C.yellowBg }, line: { color: C.yellow, width: 2 }, rectRadius: 0.1,
  });
  slide.addText('⚡  IMPORTANT: Contract generation and the first payroll run will begin as soon as all staff complete registration. Every day of delay impacts your payroll timeline.', {
    x: 0.45, y: 1.1, w: 12.4, h: 0.8,
    fontSize: 12, bold: true, color: '92400E', fontFace: FONT, valign: 'middle',
  });

  const items = [
    {
      icon: '📄', color: C.navy, title: 'Digital Contracts',
      points: ['Employment contracts stored securely in the platform', 'View and e-sign your contract from any device', 'Contract history and amendments tracked with audit trail', 'HR admin generates contracts in bulk once all staff registered'],
    },
    {
      icon: '💰', color: C.blue, title: 'Payroll Processing',
      points: ['Automated payroll based on staff records and timesheets', 'Salary advances, EOSB & gratuity calculated automatically', 'Download payslips as PDF from your profile', 'Multi-currency support for international staff'],
    },
    {
      icon: '✅', color: C.green, title: 'Your Action Required',
      points: ['Register at app.pactorg.com TODAY', 'Select role: Employee', 'Complete your profile fully (name, title, dept, phone)', 'Confirm your registration with your line manager'],
    },
  ];

  items.forEach((item, i) => {
    const x = 0.25 + i * 4.37;
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y: 2.1, w: 4.1, h: 4.5,
      fill: { color: C.offWhite }, line: { color: C.lightBlue, width: 1 }, rectRadius: 0.12,
    });
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y: 2.1, w: 4.1, h: 0.85,
      fill: { color: item.color }, line: { color: C.offWhite }, rectRadius: 0.12,
    });
    slide.addText(item.icon + '  ' + item.title, {
      x: x + 0.15, y: 2.12, w: 3.8, h: 0.8,
      fontSize: 14, bold: true, color: C.white, fontFace: FONT, valign: 'middle',
    });
    item.points.forEach((p, pi) => {
      slide.addShape(pptx.ShapeType.rect, {
        x: x + 0.22, y: 3.05 + pi * 0.85 + 0.22, w: 0.04, h: 0.3, fill: { color: item.color },
      });
      slide.addText(p, {
        x: x + 0.38, y: 3.05 + pi * 0.85, w: 3.55, h: 0.72,
        fontSize: 10.5, color: C.slate, fontFace: FONT,
      });
    });
  });
}

// ── SLIDE 7 — For Managers ───────────────────────────────────────────────────
{
  const slide = addSlide('For Managers & Directors', 'Once your team is registered, unlock full management capabilities');

  const mgmt = [
    { icon: '👥', title: 'Team Monitor',        desc: 'Real-time dashboard of your team\'s task load, completion rates, and daily activity. Spot overloaded or underperforming staff instantly.' },
    { icon: '✅', title: 'Approval Hub',         desc: 'Approve leave requests, timesheets, procurement, and expense submissions — all with a full audit trail and digital signatures.' },
    { icon: '💰', title: 'Payroll & HR',         desc: 'Run payroll cycles, generate payslips, manage salary increments, EOSB calculations, and retainer contracts for all staff.' },
    { icon: '📈', title: 'Portfolio Dashboard', desc: 'Cross-project KPI overview, budget utilization, milestone tracking, and project health matrix for director-level visibility.' },
    { icon: '📋', title: 'Task Assignment',      desc: 'Assign tasks individually or bulk-assign to the whole department. Set priorities, due dates, and dependencies with one click.' },
    { icon: '📊', title: 'Reports & Analytics', desc: 'Generate PDF and Excel reports for donors, management, and auditors. Covering projects, finance, HR, and field operations.' },
  ];

  mgmt.forEach((m, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 0.25 + col * 4.37;
    const y = 1.3 + row * 2.65;

    slide.addShape(pptx.ShapeType.roundRect, {
      x, y, w: 4.1, h: 2.4,
      fill: { color: C.offWhite }, line: { color: C.lightBlue, width: 1 }, rectRadius: 0.12,
    });
    slide.addText(m.icon, { x, y: y + 0.2, w: 4.1, h: 0.5, fontSize: 26, align: 'center' });
    slide.addText(m.title, {
      x: x + 0.15, y: y + 0.72, w: 3.8, h: 0.38,
      fontSize: 13, bold: true, color: C.navy, fontFace: FONT, align: 'center',
    });
    slide.addText(m.desc, {
      x: x + 0.15, y: y + 1.1, w: 3.8, h: 1.15,
      fontSize: 10, color: C.slate, fontFace: FONT, align: 'center',
    });
  });
}

// ── SLIDE 8 — Roles at a Glance ──────────────────────────────────────────────
{
  const slide = addSlide('User Roles at a Glance', 'All staff register as Employee — role upgrades are done by admin after registration');

  const roles = [
    { role: 'Employee ⭐', who: 'All staff (default)',        color: C.blue,   perms: 'View own tasks · Log work · Submit leave · View contract & payslip · Join projects' },
    { role: 'Manager',     who: 'Team leads / Coordinators', color: C.navy,   perms: 'Everything above + Assign tasks · Approve leave & timesheets · Team dashboard' },
    { role: 'Director',    who: 'Department heads',          color: C.purple, perms: 'Portfolio view · Cross-project analytics · Budget approvals · Financial dashboards' },
    { role: 'HR Admin',    who: 'HR team',                   color: C.green,  perms: 'Full HR hub · Payroll runs · Contracts · Salary management · EOSB calculations' },
    { role: 'Finance Admin', who: 'Finance team',            color: C.orange, perms: 'Full accounting · GL · Budgets · Procurement (P2P) · Reconciliation · Donor reporting' },
    { role: 'Super Admin', who: 'IT / System admin',         color: '374151', perms: 'Full platform access · User management · Audit logs · System settings' },
  ];

  roles.forEach((r, i) => {
    const y = 1.25 + i * 0.88;
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.25, y, w: 12.8, h: 0.75,
      fill: { color: C.offWhite }, line: { color: C.lightBlue, width: 1 }, rectRadius: 0.08,
    });
    // Color tag
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.25, y, w: 2.2, h: 0.75,
      fill: { color: r.color }, line: { color: C.offWhite }, rectRadius: 0.08,
    });
    slide.addText(r.role, {
      x: 0.3, y, w: 2.1, h: 0.75,
      fontSize: 11, bold: true, color: C.white, fontFace: FONT, align: 'center', valign: 'middle',
    });
    slide.addText(r.who, {
      x: 2.55, y: y + 0.04, w: 2.8, h: 0.35,
      fontSize: 11, color: C.gray, fontFace: FONT, italic: true,
    });
    slide.addText(r.perms, {
      x: 2.55, y: y + 0.36, w: 10.3, h: 0.32,
      fontSize: 10, color: C.slate, fontFace: FONT,
    });
  });
}

// ── SLIDE 9 — Next Steps / Call to Action ────────────────────────────────────
{
  const slide = pptx.addSlide();
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: '100%', fill: { color: C.navy } });
  slide.addShape(pptx.ShapeType.rect, { x: 6.5, y: 0, w: 6.83, h: '100%', fill: { color: C.blue }, transparency: 40 });

  slide.addText('Your Next Steps', {
    x: 0.6, y: 0.5, w: 11, h: 0.7,
    fontSize: 32, bold: true, color: C.white, fontFace: FONT,
  });
  slide.addShape(pptx.ShapeType.rect, { x: 0.6, y: 1.25, w: 2, h: 0.06, fill: { color: C.yellow } });

  const actions = [
    { num: '01', text: 'Open app.pactorg.com right now',              sub: 'Use Chrome on your computer or mobile browser' },
    { num: '02', text: 'Register with your PACT work email',           sub: 'Select role: Employee — takes less than 3 minutes' },
    { num: '03', text: 'Complete your profile fully',                  sub: 'Name · Department · Job Title · Phone number' },
    { num: '04', text: 'Inform your manager you are registered',       sub: 'Admin will activate your account within 24 hours' },
    { num: '05', text: 'Log in and check My Tasks & My Board',         sub: 'Contracts and payroll will start once all staff are on board' },
  ];

  actions.forEach((a, i) => {
    const y = 1.45 + i * 1.0;
    slide.addText(a.num, {
      x: 0.6, y, w: 0.7, h: 0.55,
      fontSize: 22, bold: true, color: C.yellow, fontFace: FONT,
    });
    slide.addText(a.text, {
      x: 1.45, y, w: 11, h: 0.42,
      fontSize: 15, bold: true, color: C.white, fontFace: FONT,
    });
    slide.addText(a.sub, {
      x: 1.45, y: y + 0.42, w: 11, h: 0.35,
      fontSize: 11, color: C.lightBlue, fontFace: FONT,
    });
  });

  // Big CTA
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 3.5, y: 6.1, w: 6.3, h: 0.7,
    fill: { color: C.yellow }, line: { color: C.offWhite }, rectRadius: 0.12,
  });
  slide.addText('🌐  Register Now: app.pactorg.com', {
    x: 3.5, y: 6.1, w: 6.3, h: 0.7,
    fontSize: 16, bold: true, color: C.navy, fontFace: FONT, align: 'center', valign: 'middle',
  });
}

// ── Write file ───────────────────────────────────────────────────────────────
const outDir  = path.join(__dirname, '..', 'public');
const outPath = path.join(outDir, 'PACT_Command_Center_Staff_Onboarding.pptx');

pptx.writeFile({ fileName: outPath }).then(() => {
  console.log('✅  Saved:', outPath);
}).catch(err => {
  console.error('❌  Error:', err.message);
  process.exit(1);
});
