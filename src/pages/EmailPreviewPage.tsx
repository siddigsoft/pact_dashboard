import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PACT_LOGO_B64 } from '@/services/pact-logo-b64';

const SAMPLE = {
  recipientName: 'Finance Team',
  approverName: 'ELSIDDIG IBRAHIM',
  requestId: 'BULK-135',
  groupLabel: 'All Approved',
  mmpLabel: 'FEBRUARY MMP',
  totalAmount: 9602000,
  count: 135,
  date: 'Feb 28, 2026',
  project: 'WFP TPM',
  actionUrl: '/down-payment-approval',
};

function buildEnhancedPaymentEmailHTML(d: typeof SAMPLE): string {
  const fmt = (n: number) => `SDG ${n.toLocaleString()}`;
  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Request — ${d.requestId}</title>
</head>
<body style="margin:0;padding:0;background:#EAECF0;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#EAECF0;padding:32px 16px;">
<tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#FFFFFF;border-radius:10px;overflow:hidden;box-shadow:0 6px 32px rgba(0,0,0,0.13);">

  <!-- ── LETTERHEAD HEADER ─────────────────────────────────────── -->
  <tr>
    <td style="background:#0F2041;padding:0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:26px 36px 22px;">
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="vertical-align:middle;padding-right:14px;">
                <img src="${PACT_LOGO_B64}" alt="PACT" width="44" height="44" style="display:block;border-radius:8px;border:0;" />
              </td>
              <td style="vertical-align:middle;">
                <p style="margin:0;font-size:26px;font-weight:900;color:#FFFFFF;letter-spacing:0.5px;line-height:1;">PACT</p>
                <p style="margin:3px 0 0 0;font-size:10.5px;color:#7FA5CC;letter-spacing:2px;text-transform:uppercase;">Command Center &nbsp;·&nbsp; Field Operations Platform</p>
              </td>
            </tr></table>
          </td>
          <td style="padding:22px 36px 22px;text-align:right;vertical-align:top;">
            <table cellpadding="0" cellspacing="0" style="margin-left:auto;">
              <tr><td style="padding:2px 0;font-size:10px;color:#8FADD4;white-space:nowrap;">
                <span style="color:#BFD3F0;font-weight:600;">Ref No:&nbsp;</span>${d.requestId}
              </td></tr>
              <tr><td style="padding:2px 0;font-size:10px;color:#8FADD4;white-space:nowrap;">
                <span style="color:#BFD3F0;font-weight:600;">Date:&nbsp;</span>${d.date}
              </td></tr>
              <tr><td style="padding:2px 0;font-size:10px;white-space:nowrap;">
                <span style="color:#BFD3F0;font-weight:600;">Priority:&nbsp;</span><span style="color:#FCD34D;font-weight:700;">&#9679; HIGH</span>
              </td></tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- ── PRIORITY RIBBON ──────────────────────────────────────── -->
  <tr>
    <td style="background:#B45309;padding:9px 36px;text-align:center;">
      <p style="margin:0;font-size:11.5px;font-weight:700;color:#FFFFFF;letter-spacing:1.2px;text-transform:uppercase;">
        &#9888;&nbsp; HIGH PRIORITY — PAYMENT AUTHORIZATION REQUIRED &nbsp;|&nbsp; أولوية عالية — مطلوب تفويض الدفع
      </p>
    </td>
  </tr>

  <!-- ── BLUE ACCENT LINE ──────────────────────────────────────── -->
  <tr><td style="height:3px;background:linear-gradient(90deg,#2962FF,#00C6FF);"></td></tr>

  <!-- ── BODY ─────────────────────────────────────────────────── -->
  <tr>
    <td style="padding:38px 36px 32px;">

      <!-- Document label -->
      <p style="margin:0 0 6px 0;font-size:10.5px;color:#6B7280;text-transform:uppercase;letter-spacing:1.2px;font-weight:600;">Official Payment Request &nbsp;/&nbsp; طلب دفع رسمي</p>
      <!-- Greeting -->
      <p style="margin:0 0 28px 0;font-size:16px;color:#111827;">Dear <strong>${d.recipientName}</strong>,</p>

      <!-- ── FINANCIAL HIGHLIGHT CARD ─────────────────────────── -->
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F4FF;border:2px solid #2962FF;border-radius:8px;margin-bottom:26px;overflow:hidden;">
        <tr>
          <td style="padding:20px 20px;border-right:1px solid #C7D7FF;text-align:center;width:34%;">
            <p style="margin:0;font-size:10px;color:#2962FF;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Total Approved</p>
            <p style="margin:8px 0 2px 0;font-size:20px;font-weight:900;color:#0F2041;line-height:1;">${fmt(d.totalAmount)}</p>
            <p style="margin:0;font-size:9px;color:#6B7280;">المبلغ الإجمالي المعتمد</p>
          </td>
          <td style="padding:20px 20px;border-right:1px solid #C7D7FF;text-align:center;width:33%;">
            <p style="margin:0;font-size:10px;color:#2962FF;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Requests</p>
            <p style="margin:8px 0 2px 0;font-size:28px;font-weight:900;color:#0F2041;line-height:1;">${d.count}</p>
            <p style="margin:0;font-size:9px;color:#6B7280;">عدد الطلبات</p>
          </td>
          <td style="padding:20px 20px;text-align:center;width:33%;">
            <p style="margin:0;font-size:10px;color:#2962FF;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Group</p>
            <p style="margin:8px 0 2px 0;font-size:14px;font-weight:800;color:#0F2041;line-height:1.2;">${d.groupLabel}</p>
            <p style="margin:0;font-size:9px;color:#6B7280;">المجموعة</p>
          </td>
        </tr>
      </table>

      <!-- ── INSTRUCTION ──────────────────────────────────────── -->
      <p style="margin:0 0 22px 0;font-size:14.5px;color:#374151;line-height:1.75;">
        Please find the attached Excel report containing <strong>${d.count} approved transportation advance requests</strong>
        from <strong>${d.mmpLabel}</strong>. Kindly review the details, authorize the disbursements, and
        confirm receipt at your earliest convenience.
      </p>

      <!-- ── DETAILS TABLE ────────────────────────────────────── -->
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 26px 0;font-size:13.5px;border-radius:6px;overflow:hidden;border:1px solid #E5E7EB;">
        <tr style="background:#0F2041;">
          <td style="padding:10px 14px;color:#FFFFFF;font-weight:700;font-size:11px;letter-spacing:0.8px;text-transform:uppercase;width:42%;">Field &nbsp;/&nbsp; الحقل</td>
          <td style="padding:10px 14px;color:#FFFFFF;font-weight:700;font-size:11px;letter-spacing:0.8px;text-transform:uppercase;">Detail &nbsp;/&nbsp; التفصيل</td>
        </tr>
        <tr style="background:#F8FAFC;">
          <td style="padding:11px 14px;font-weight:600;color:#374151;border-bottom:1px solid #E5E7EB;border-right:1px solid #E5E7EB;">Reference No / رقم المرجع</td>
          <td style="padding:11px 14px;color:#1F2937;border-bottom:1px solid #E5E7EB;">${d.requestId}</td>
        </tr>
        <tr style="background:#FFFFFF;">
          <td style="padding:11px 14px;font-weight:600;color:#374151;border-bottom:1px solid #E5E7EB;border-right:1px solid #E5E7EB;">MMP / الخطة الشهرية</td>
          <td style="padding:11px 14px;color:#1F2937;border-bottom:1px solid #E5E7EB;font-weight:600;">${d.mmpLabel} Advance Request</td>
        </tr>
        <tr style="background:#F8FAFC;">
          <td style="padding:11px 14px;font-weight:600;color:#374151;border-bottom:1px solid #E5E7EB;border-right:1px solid #E5E7EB;">Type / النوع</td>
          <td style="padding:11px 14px;color:#1F2937;border-bottom:1px solid #E5E7EB;">Advance Request / طلب سلفة</td>
        </tr>
        <tr style="background:#FFFFFF;">
          <td style="padding:11px 14px;font-weight:600;color:#374151;border-bottom:1px solid #E5E7EB;border-right:1px solid #E5E7EB;">Category / الفئة</td>
          <td style="padding:11px 14px;color:#1F2937;border-bottom:1px solid #E5E7EB;">Transportation Advance (Bulk)</td>
        </tr>
        <tr style="background:#F8FAFC;">
          <td style="padding:11px 14px;font-weight:600;color:#374151;border-bottom:1px solid #E5E7EB;border-right:1px solid #E5E7EB;">Total Amount / المبلغ الإجمالي</td>
          <td style="padding:11px 14px;color:#065F46;font-weight:700;border-bottom:1px solid #E5E7EB;font-size:15px;">${fmt(d.totalAmount)}</td>
        </tr>
        <tr style="background:#FFFFFF;">
          <td style="padding:11px 14px;font-weight:600;color:#374151;border-bottom:1px solid #E5E7EB;border-right:1px solid #E5E7EB;">Project / المشروع</td>
          <td style="padding:11px 14px;color:#1F2937;border-bottom:1px solid #E5E7EB;">${d.project}</td>
        </tr>
        <tr style="background:#F8FAFC;">
          <td style="padding:11px 14px;font-weight:600;color:#374151;border-bottom:1px solid #E5E7EB;border-right:1px solid #E5E7EB;">Approved By / تمت الموافقة من</td>
          <td style="padding:11px 14px;color:#1F2937;border-bottom:1px solid #E5E7EB;">${d.approverName}</td>
        </tr>
        <tr style="background:#FFFFFF;">
          <td style="padding:11px 14px;font-weight:600;color:#374151;border-right:1px solid #E5E7EB;">Attachment / المرفق</td>
          <td style="padding:11px 14px;color:#1F2937;">Excel Report (4 sheets: Statement · Full Details · By State · By Enumerator)</td>
        </tr>
      </table>

      <!-- ── ACTION BUTTONS ───────────────────────────────────── -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 30px 0;">
        <tr>
          <td style="padding:0 6px 0 0;width:50%;">
            <a href="#" style="display:block;padding:15px 20px;background:#0F2041;color:#FFFFFF;text-decoration:none;border-radius:7px;font-weight:700;font-size:14px;text-align:center;line-height:1.4;">
              View &amp; Process Payment
              <span style="display:block;font-size:11.5px;font-weight:400;opacity:0.8;margin-top:3px;">عرض ومعالجة الدفع</span>
            </a>
          </td>
          <td style="padding:0 0 0 6px;width:50%;">
            <a href="#" style="display:block;padding:14px 20px;background:#FFFFFF;color:#0F2041;text-decoration:none;border-radius:7px;font-weight:700;font-size:14px;border:2px solid #0F2041;text-align:center;line-height:1.4;">
              Download Report
              <span style="display:block;font-size:11.5px;font-weight:400;opacity:0.65;margin-top:3px;">تحميل التقرير</span>
            </a>
          </td>
        </tr>
      </table>

      <!-- ── COMPLIANCE NOTICE ────────────────────────────────── -->
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFFBEB;border:1px solid #FDE68A;border-left:4px solid #F59E0B;border-radius:5px;margin-bottom:30px;">
        <tr>
          <td style="padding:14px 16px;">
            <p style="margin:0 0 5px 0;font-size:13px;font-weight:700;color:#92400E;">&#9888; Reconciliation Requirement / اشتراط التسوية</p>
            <p style="margin:0;font-size:12.5px;color:#78350F;line-height:1.65;">
              All recipients must submit receipts and return any unused funds within <strong>5 working days</strong> of disbursement.
            </p>
            <p dir="rtl" style="margin:5px 0 0 0;font-size:12.5px;color:#78350F;line-height:1.65;text-align:right;">
              يجب على جميع المستلمين تقديم الإيصالات وإرجاع أي أموال غير مستخدمة خلال <strong>5 أيام عمل</strong> من صرف المبلغ.
            </p>
          </td>
        </tr>
      </table>

      <!-- ── DIVIDER ───────────────────────────────────────────── -->
      <hr style="border:none;border-top:1px solid #E5E7EB;margin:26px 0;">

      <!-- ── ARABIC SECTION ───────────────────────────────────── -->
      <div dir="rtl" style="text-align:right;">
        <p style="margin:0 0 6px 0;font-size:15px;color:#111827;">عزيزي <strong>فريق المالية</strong>،</p>
        <h3 style="margin:12px 0 8px 0;font-size:17px;font-weight:700;color:#0F2041;">طلب دفع رقم ${d.requestId} | ${d.mmpLabel} | طلب سلفة</h3>
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.85;">
          تمت الموافقة الكاملة على طلبات السلفة المرفقة وهي جاهزة للمعالجة المالية. يرجى مراجعة التقرير المرفق
          واعتماد الصرف وتأكيد الاستلام في أقرب وقت ممكن.<br><br>
          <strong>ملاحظة:</strong> يجب على المستلمين تقديم الإيصالات وإعادة أي أموال غير مستخدمة خلال فترة التسوية المحددة.
        </p>
      </div>

      <!-- ── DIVIDER ───────────────────────────────────────────── -->
      <hr style="border:none;border-top:1px solid #E5E7EB;margin:26px 0;">

      <!-- ── SIGN-OFF ──────────────────────────────────────────── -->
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="vertical-align:top;">
            <p style="margin:0 0 3px 0;font-size:14px;color:#374151;">Yours faithfully,</p>
            <p style="margin:6px 0 2px 0;font-size:15px;font-weight:700;color:#0F2041;">${d.approverName}</p>
            <p style="margin:0 0 1px 0;font-size:12.5px;color:#6B7280;">Approving Officer — PACT Command Center</p>
            <p style="margin:0;font-size:12.5px;color:#6B7280;">On behalf of the PACT Operations Team</p>
          </td>
          <td style="vertical-align:top;text-align:right;" dir="rtl">
            <p style="margin:0 0 3px 0;font-size:14px;color:#374151;">مع خالص التقدير،</p>
            <p style="margin:6px 0 2px 0;font-size:15px;font-weight:700;color:#0F2041;">${d.approverName}</p>
            <p style="margin:0;font-size:12.5px;color:#6B7280;">مسؤول الموافقة — مركز قيادة باكت</p>
          </td>
        </tr>
      </table>

    </td>
  </tr>

  <!-- ── FOOTER ────────────────────────────────────────────────── -->
  <tr>
    <td style="background:#F1F5F9;border-top:1px solid #E2E8F0;padding:18px 36px;">
      <p style="margin:0 0 8px 0;font-size:11px;color:#94A3B8;line-height:1.65;text-align:center;">
        <strong style="color:#64748B;">CONFIDENTIAL:</strong> This communication and any attachments are confidential and intended solely for the named recipient(s).
        If received in error, please notify the sender immediately and delete this message.
      </p>
      <p dir="rtl" style="margin:0 0 10px 0;font-size:11px;color:#94A3B8;line-height:1.65;text-align:center;">
        <strong style="color:#64748B;">سري:</strong> هذه الرسالة ومرفقاتها سرية وموجهة حصراً للمستلم المحدد. إذا وصلت إليك بالخطأ، يرجى إخطار المُرسِل فوراً وحذف الرسالة.
      </p>
      <hr style="border:none;border-top:1px solid #E2E8F0;margin:10px 0;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" style="padding-bottom:8px;">
            <img src="${PACT_LOGO_B64}" alt="PACT" width="28" height="28" style="display:inline-block;vertical-align:middle;border-radius:5px;border:0;margin-right:7px;" />
            <span style="font-size:13px;font-weight:700;color:#475569;vertical-align:middle;">PACT</span>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 4px 0;font-size:10.5px;color:#94A3B8;text-align:center;line-height:1.5;">
        Automated notification &nbsp;·&nbsp; PACT Command Center Platform &nbsp;·&nbsp; <strong>PACT Platform v2</strong><br>
        مركز قيادة باكت — رسالة آلية
      </p>
      <p style="margin:0;font-size:10px;color:#94A3B8;text-align:center;">© 2026 PACT. All rights reserved.</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

export default function EmailPreviewPage() {
  const [mode, setMode] = useState<'desktop' | 'mobile'>('desktop');
  const navigate = useNavigate();
  const html = buildEnhancedPaymentEmailHTML(SAMPLE);
  const blob = new Blob([html], { type: 'text/html' });
  const src = URL.createObjectURL(blob);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="sticky top-0 z-10 bg-white border-b px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="gap-1.5 text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="h-4 w-px bg-slate-200" />
          <span className="font-bold text-slate-800 text-sm">Email Preview</span>
          <Badge variant="default" className="text-xs bg-green-600">Live Template</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={mode === 'desktop' ? 'default' : 'outline'}
            onClick={() => setMode('desktop')}
          >
            Desktop
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === 'mobile' ? 'default' : 'outline'}
            onClick={() => setMode('mobile')}
          >
            Mobile
          </Button>
        </div>
        <div className="text-xs text-muted-foreground hidden md:block">
          This template is now used for all payment request emails.
        </div>
      </div>

      <div className="flex justify-center py-8 px-4">
        <div
          className="bg-white rounded-lg shadow-lg overflow-hidden transition-all duration-300"
          style={{ width: mode === 'mobile' ? 390 : 700 }}
        >
          <div className="bg-slate-50 border-b px-4 py-3 space-y-1">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold w-12 shrink-0">From:</span>
              <span>PACT Workflow &lt;noreply@pactorg.com&gt;</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold w-12 shrink-0">To:</span>
              <span>siddig@pactorg.com</span>
            </div>
            <div className="flex items-start gap-2 text-xs text-slate-700">
              <span className="font-semibold w-12 shrink-0 mt-0.5">Subject:</span>
              <span className="font-medium">[HIGH PRIORITY | أولوية عالية] Payment Request No. BULK-135 | For MMP: FEBRUARY MMP | Advance Request</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
              <span className="w-12 shrink-0"></span>
              <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 border border-green-200 rounded px-2 py-0.5">
                📎 Transport-Advance-Full-Report-FEBRUARY_MMP-2026-02-28.xlsx &nbsp; 46 KB
              </span>
            </div>
          </div>

          <iframe
            srcDoc={html}
            title="Email Preview"
            className="w-full border-0"
            style={{ height: 900 }}
            sandbox="allow-same-origin"
          />
        </div>
      </div>
    </div>
  );
}
