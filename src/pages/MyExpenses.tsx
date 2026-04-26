import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import {
  Receipt, ArrowRight, Info, Wallet,
} from 'lucide-react';
import { PersonalExpenseFlow } from '@/components/cost-submission/PersonalExpenseFlow';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';

/**
 * /my-expenses — personal reimbursement page.
 *
 * Behaviour, URL, data model, write path and notifications are identical to
 * the previous implementation. The actual claim-flow logic lives in the
 * shared <PersonalExpenseFlow /> component so the same flow can be embedded
 * inside the Cost Submission page (Task #56) without code duplication.
 *
 * Layout updated to match /cost-submission framing: bilingual EN/AR
 * "What does this page do?" PageInfoBanner with workflow steps, then the
 * comparison banner, then the shared expense-claim flow.
 */
export default function MyExpenses() {
  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-5 max-w-6xl" data-testid="page-my-expenses">
      <PageInfoBanner
        title="My Expenses"
        description="Submit personal reimbursement claims for money you paid out of your own pocket (taxi, lunch, supplies, communications, medical, etc.). Add line items grouped by category, attach receipts, then submit. Your line manager reviews first, then Finance approves and pays. Use the New Claim dialog to start — the right-side Request Summary keeps a live breakdown by category and a grand total in your chosen currency."
        descriptionAr="قدّم مطالبات استرداد المصاريف التي دفعتها من جيبك الخاص (مواصلات، غداء، مستلزمات، اتصالات، طبي، إلخ). أضف البنود مجمعة حسب الفئة، أرفق الإيصالات، ثم اضغط إرسال. يراجع المدير المباشر أولاً، ثم تعتمد المالية وتدفع. استخدم نافذة مطالبة جديدة للبدء — يعرض ملخص الطلب على اليمين توزيع البنود حسب الفئة والإجمالي بالعملة التي اخترتها."
        workflowSteps={[
          { step: 1, role: 'Field Staff',   action: 'Submit claim',   description: 'Enter title, pick currency, add line items by category, attach receipts.' },
          { step: 2, role: 'Supervisor',    action: 'Manager review', description: 'Your line manager gets a notification, reviews the request, and approves or rejects.' },
          { step: 3, role: 'Finance Admin', action: 'Finance review', description: 'Finance verifies receipts and approves the payment.' },
          { step: 4, role: 'Finance Admin', action: 'Pay & close',    description: 'Funds are released, payment proof is attached, and the claim is marked Paid.' },
        ]}
        workflowStepsAr={[
          { step: 1, role: 'موظف ميداني',  action: 'إرسال المطالبة', description: 'املأ العنوان واختر العملة وأضف البنود حسب الفئة وارفع الإيصالات.' },
          { step: 2, role: 'المشرف',       action: 'مراجعة المدير',  description: 'يصل إشعار للمدير المباشر للموافقة أو الرفض.' },
          { step: 3, role: 'مدير المالية', action: 'مراجعة المالية', description: 'تتحقق المالية من الإيصالات وتعتمد الدفع.' },
          { step: 4, role: 'مدير المالية', action: 'الدفع والإغلاق', description: 'يُصرف المبلغ، ويُرفق إثبات الدفع، وتُعلَّم المطالبة كمدفوعة.' },
        ]}
      />
      {/* When-to-use comparison banner — bilingual cross-link to Cost Submission */}
      <Card className="border-blue-200 bg-blue-50/40 dark:bg-blue-950/20 dark:border-blue-900">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2 text-sm">
              <div className="font-semibold text-blue-900 dark:text-blue-200">
                Two ways to request money — pick the right one. / طريقتان لطلب الأموال — اختر المناسبة:
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="rounded border bg-white dark:bg-background p-3">
                  <div className="flex items-center gap-2 font-semibold">
                    <Receipt className="w-4 h-4 text-primary" /> My Expenses (this page) / مصاريفي
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    You already paid (taxi, lunch, supplies). Upload receipts and get reimbursed.
                    Manager → Finance → Paid.
                  </div>
                  <div className="text-xs text-muted-foreground mt-1" dir="rtl">
                    دفعت من جيبك بالفعل (مواصلات، غداء، مستلزمات). ارفع الإيصالات واسترد المبلغ. مدير → مالية → مدفوع.
                  </div>
                </div>
                <Link to="/cost-submission" className="block group" data-testid="link-cost-submission">
                  <div className="rounded border bg-white dark:bg-background p-3 hover:border-primary transition-colors h-full">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-semibold">
                        <Wallet className="w-4 h-4 text-violet-600" /> Cost Submission / تقديم التكاليف
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Project funding requests &amp; advances. Multi-tier approval, signatures, reconciliation.
                    </div>
                    <div className="text-xs text-muted-foreground mt-1" dir="rtl">
                      طلبات تمويل المشاريع والسلف. موافقات متعددة المستويات، توقيعات، تسوية.
                    </div>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Discoverability nudge — Task #56 soft handoff hint
          Personal reimbursement is now also reachable from Cost Submission's
          top-of-page selector. We keep /my-expenses unchanged but mention it. */}
      <div
        className="rounded-md border border-dashed border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800 px-3 py-2 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2"
        data-testid="nudge-cost-submission-personal"
      >
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <div className="flex-1">
          <span>
            You can also submit a personal reimbursement from the{' '}
            <Link
              to="/cost-submission"
              className="underline font-medium"
              data-testid="link-cost-submission-personal"
            >
              Cost Submission page
            </Link>{' '}
            using the new "Personal Reimbursement" option at the top.
          </span>
          <span className="block mt-0.5" dir="rtl">
            يمكنك أيضاً تقديم استرداد شخصي من صفحة تقديم التكاليف عبر خيار "استرداد شخصي" الجديد في الأعلى.
          </span>
        </div>
      </div>

      {/* Shared flow — stats, filters, claims table, new-claim dialog */}
      <PersonalExpenseFlow embedded={false} />
    </div>
  );
}
