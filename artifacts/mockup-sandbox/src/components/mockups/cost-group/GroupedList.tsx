import { useState } from "react";
import {
  ChevronDown, ChevronRight, Wifi, Car, Package, Gift, Building2, Printer, Coffee,
  ThumbsUp, ThumbsDown, Eye, CheckCircle2, Clock, XCircle, MoreHorizontal,
  Users, Layers, AlertCircle
} from "lucide-react";

const CATS: Record<string, { label: string; Icon: any; color: string }> = {
  communications: { label: "Internet & Comms", Icon: Wifi, color: "text-blue-600" },
  transport: { label: "Transportation", Icon: Car, color: "text-orange-600" },
  equipment: { label: "Equipment & Supplies", Icon: Package, color: "text-purple-600" },
  incentives: { label: "Incentives & Allowances", Icon: Gift, color: "text-pink-600" },
  office_admin: { label: "Office Admin", Icon: Building2, color: "text-slate-600" },
  printing: { label: "Printing & Stationery", Icon: Printer, color: "text-teal-600" },
  meetings: { label: "Meetings & Events", Icon: Coffee, color: "text-amber-600" },
  other: { label: "Other", Icon: MoreHorizontal, color: "text-gray-500" },
};

const STATUS_CFG: Record<string, { label: string; cls: string; Icon: any }> = {
  pending: { label: "Pending T1", cls: "bg-amber-100 text-amber-700", Icon: Clock },
  t2_pending: { label: "Pending T2", cls: "bg-blue-100 text-blue-700", Icon: Clock },
  approved: { label: "Approved", cls: "bg-green-100 text-green-700", Icon: CheckCircle2 },
  rejected: { label: "Rejected", cls: "bg-red-100 text-red-700", Icon: XCircle },
};

type Item = {
  id: string;
  cat: keyof typeof CATS;
  description: string;
  amount: number;
  currency: string;
  date: string;
  vendor?: string;
  status: keyof typeof STATUS_CFG;
};

type Group = {
  id: string;
  title: string;
  submitter: string;
  project: string;
  date: string;
  items: Item[];
};

const GROUP: Group = {
  id: "g1",
  title: "New Halfa in Kassala – Food Speciality Agricultural Services (1-2 April 2026)",
  submitter: "Tarig Elsir Mustafa ElHaj",
  project: "AECF TPM Project",
  date: "1 Apr 2026",
  items: [
    { id: "i1", cat: "communications", description: "Internet data bundle for field team – April", amount: 50000, currency: "SDG", date: "1 Apr 2026", vendor: "Sudatel", status: "approved" },
    { id: "i2", cat: "transport", description: "Vehicle rental – Kassala to New Halfa (2 days)", amount: 800000, currency: "SDG", date: "1 Apr 2026", vendor: "Haj Transport", status: "t2_pending" },
    { id: "i3", cat: "incentives", description: "Field enumerator daily allowances × 12 persons", amount: 4200000, currency: "SDG", date: "2 Apr 2026", status: "pending" },
    { id: "i4", cat: "equipment", description: "Survey tablets (3 units) – temporary rental", amount: 960000, currency: "SDG", date: "1 Apr 2026", vendor: "Tech Rent Co.", status: "pending" },
    { id: "i5", cat: "printing", description: "Data collection forms – 500 copies", amount: 120000, currency: "SDG", date: "1 Apr 2026", status: "pending" },
    { id: "i6", cat: "meetings", description: "Community engagement session – venue & refreshments", amount: 350000, currency: "SDG", date: "2 Apr 2026", vendor: "Nile Hall", status: "rejected" },
    { id: "i7", cat: "office_admin", description: "Stationery & office supplies for field use", amount: 75000, currency: "SDG", date: "1 Apr 2026", status: "pending" },
    { id: "i8", cat: "other", description: "Miscellaneous field expenses", amount: 325000, currency: "SDG", date: "2 Apr 2026", status: "pending" },
  ],
};

const STANDALONE: Item = {
  id: "s1", cat: "transport", description: "Fuel reimbursement – Khartoum office vehicle",
  amount: 185000, currency: "SDG", date: "31 Mar 2026", vendor: "Shell Station", status: "t2_pending",
};

function StatusBadge({ status }: { status: keyof typeof STATUS_CFG }) {
  const cfg = STATUS_CFG[status];
  const { Icon } = cfg;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg.cls}`}>
      <Icon className="h-2.5 w-2.5" />
      {cfg.label}
    </span>
  );
}

function StandaloneRow({ item }: { item: Item }) {
  const cfg = CATS[item.cat];
  const { Icon } = cfg;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <div className="mt-0.5 h-9 w-9 rounded-lg bg-gray-100 flex items-center justify-center flex-none">
          <Icon className={`h-4 w-4 ${cfg.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{item.description}</p>
          <p className="text-xs text-gray-500 mt-0.5">{cfg.label} · {item.date}{item.vendor ? ` · ${item.vendor}` : ""}</p>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <StatusBadge status={item.status} />
            <span className="text-[10px] text-gray-400">ID: A1B2C3D</span>
          </div>
        </div>
        <div className="text-right flex-none">
          <p className="text-base font-bold text-gray-900 tabular-nums">{item.currency} {item.amount.toLocaleString()}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">ELSIDDIG IBRAHIM</p>
        </div>
      </div>
      <div className="border-t border-gray-100 flex items-center gap-2 px-4 py-2.5 bg-gray-50">
        <button className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium border border-gray-200 bg-white text-gray-600 hover:bg-gray-100">
          <Eye className="h-3 w-3" /> View Details
        </button>
        <button className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700">
          <ThumbsUp className="h-3 w-3" /> Approve T2
        </button>
        <button className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium border border-gray-200 bg-white text-red-600 hover:bg-red-50">
          <ThumbsDown className="h-3 w-3" /> Reject
        </button>
      </div>
    </div>
  );
}

function GroupItemRow({ item, idx }: { item: Item; idx: number }) {
  const cfg = CATS[item.cat];
  const { Icon } = cfg;
  const isApproved = item.status === "approved";
  const isRejected = item.status === "rejected";
  return (
    <div className={`border-b border-[#1D3461]/10 last:border-b-0 ${isApproved ? "bg-green-50/50" : isRejected ? "bg-red-50/40" : "bg-white"}`}>
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="w-5 flex-none text-center">
          <span className="text-[10px] font-bold text-gray-400">{idx + 1}</span>
        </div>
        <div className="flex-none h-7 w-7 rounded-md bg-gray-100 flex items-center justify-center">
          <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-gray-900 leading-snug">{item.description}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">{cfg.label}{item.vendor ? ` · ${item.vendor}` : ""} · {item.date}</p>
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            <StatusBadge status={item.status} />
            {item.status === "pending" && (
              <div className="flex items-center gap-1">
                <button className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700">
                  <ThumbsUp className="h-2.5 w-2.5" /> Approve T1
                </button>
                <button className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium border border-gray-200 text-red-600 hover:bg-red-50">
                  <ThumbsDown className="h-2.5 w-2.5" /> Reject
                </button>
              </div>
            )}
            {item.status === "t2_pending" && (
              <div className="flex items-center gap-1">
                <button className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700">
                  <ThumbsUp className="h-2.5 w-2.5" /> Approve T2
                </button>
                <button className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium border border-gray-200 text-red-600 hover:bg-red-50">
                  <ThumbsDown className="h-2.5 w-2.5" /> Reject
                </button>
              </div>
            )}
            {isApproved && <span className="text-[10px] text-green-600 font-medium">✓ Both tiers approved</span>}
            {isRejected && <span className="text-[10px] text-red-500 font-medium">Returned — needs revision</span>}
          </div>
        </div>
        <div className="text-right flex-none">
          <p className="text-sm font-bold text-gray-900 tabular-nums">{item.currency} {item.amount.toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}

function GroupCard({ group }: { group: Group }) {
  const [expanded, setExpanded] = useState(true);
  const total = group.items.reduce((s, i) => s + i.amount, 0);
  const approvedCount = group.items.filter(i => i.status === "approved").length;
  const pendingCount = group.items.filter(i => i.status === "pending" || i.status === "t2_pending").length;
  const rejectedCount = group.items.filter(i => i.status === "rejected").length;

  return (
    <div className="rounded-xl overflow-hidden shadow-md border border-[#1D3461]/20">
      {/* ── Group Header ── */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full text-left"
      >
        <div className="bg-gradient-to-r from-[#0F2041] to-[#1D3461] px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="flex-none mt-0.5">
              <Layers className="h-4 w-4 text-white/70" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white leading-snug line-clamp-2">{group.title}</p>
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-white/60">{group.submitter}</span>
                <span className="text-[10px] text-white/40">·</span>
                <span className="text-[10px] text-white/60">{group.project}</span>
                <span className="text-[10px] text-white/40">·</span>
                <span className="text-[10px] text-white/60">{group.date}</span>
              </div>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white">
                  <Users className="h-2.5 w-2.5" /> {group.items.length} expense items
                </span>
                {approvedCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-500/25 px-2 py-0.5 text-[10px] font-semibold text-green-300">
                    <CheckCircle2 className="h-2.5 w-2.5" /> {approvedCount} approved
                  </span>
                )}
                {pendingCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/25 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                    <Clock className="h-2.5 w-2.5" /> {pendingCount} pending
                  </span>
                )}
                {rejectedCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500/25 px-2 py-0.5 text-[10px] font-semibold text-red-300">
                    <AlertCircle className="h-2.5 w-2.5" /> {rejectedCount} rejected
                  </span>
                )}
              </div>
            </div>
            <div className="flex-none text-right">
              <p className="text-base font-bold text-white tabular-nums">SDG {total.toLocaleString()}</p>
              <p className="text-[10px] text-white/50 mt-0.5">Total</p>
              <div className="mt-2 flex items-center justify-end gap-1 text-white/60 text-[11px]">
                {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <span>{expanded ? "Collapse" : "Expand"}</span>
              </div>
            </div>
          </div>
        </div>
        {/* Progress bar */}
        <div className="h-1 bg-[#0F2041] flex">
          <div className="bg-green-400 transition-all" style={{ width: `${(approvedCount / group.items.length) * 100}%` }} />
          <div className="bg-amber-400 transition-all" style={{ width: `${(pendingCount / group.items.length) * 100}%` }} />
          <div className="bg-red-400 transition-all" style={{ width: `${(rejectedCount / group.items.length) * 100}%` }} />
        </div>
      </button>

      {/* ── Expanded items ── */}
      {expanded && (
        <div className="divide-y divide-gray-100 border-t border-[#1D3461]/10">
          {group.items.map((item, idx) => (
            <GroupItemRow key={item.id} item={item} idx={idx} />
          ))}
          {/* Group footer actions */}
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-[#0F2041]/5 border-t border-[#1D3461]/10">
            <span className="text-[11px] text-gray-500 font-medium">
              {approvedCount}/{group.items.length} items approved
            </span>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium border border-gray-200 bg-white text-gray-600 hover:bg-gray-100">
                <Eye className="h-3 w-3" /> View Details
              </button>
              <button className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700">
                <ThumbsUp className="h-3 w-3" /> Approve All Pending
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function GroupedList() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Page header */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Operational Cost Requests</h1>
            <p className="text-xs text-gray-500 mt-0.5">39 items · Pending tab</p>
          </div>
          <div className="flex gap-1.5">
            <span className="rounded-full px-2.5 py-0.5 bg-amber-100 text-amber-700 text-xs font-semibold">Pending 11</span>
            <span className="rounded-full px-2.5 py-0.5 bg-gray-100 text-gray-600 text-xs font-semibold">In Review 5</span>
          </div>
        </div>

        {/* Standalone item (non-grouped) */}
        <div>
          <p className="text-[10px] text-gray-400 uppercase font-semibold mb-1.5 tracking-wide">Single item (standalone)</p>
          <StandaloneRow item={STANDALONE} />
        </div>

        {/* Grouped request */}
        <div>
          <p className="text-[10px] text-gray-400 uppercase font-semibold mb-1.5 tracking-wide">Grouped request (click header to collapse/expand)</p>
          <GroupCard group={GROUP} />
        </div>

        {/* Collapsed state preview */}
        <div>
          <p className="text-[10px] text-gray-400 uppercase font-semibold mb-1.5 tracking-wide">Same group — collapsed state</p>
          <CollapsedPreview group={GROUP} total={GROUP.items.reduce((s,i) => s+i.amount, 0)} />
        </div>
      </div>
    </div>
  );
}

function CollapsedPreview({ group, total }: { group: Group; total: number }) {
  const approvedCount = group.items.filter(i => i.status === "approved").length;
  const pendingCount = group.items.filter(i => i.status === "pending" || i.status === "t2_pending").length;
  const rejectedCount = group.items.filter(i => i.status === "rejected").length;
  return (
    <div className="rounded-xl overflow-hidden shadow-md border border-[#1D3461]/20 cursor-pointer hover:shadow-lg transition-shadow">
      <div className="bg-gradient-to-r from-[#0F2041] to-[#1D3461] px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="flex-none mt-0.5"><Layers className="h-4 w-4 text-white/70" /></div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white leading-snug line-clamp-1">{group.title}</p>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-white/60">{group.submitter} · {group.project}</span>
            </div>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white">
                <Users className="h-2.5 w-2.5" /> {group.items.length} expense items
              </span>
              {approvedCount > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-green-500/25 px-2 py-0.5 text-[10px] font-semibold text-green-300"><CheckCircle2 className="h-2.5 w-2.5" /> {approvedCount} approved</span>}
              {pendingCount > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/25 px-2 py-0.5 text-[10px] font-semibold text-amber-300"><Clock className="h-2.5 w-2.5" /> {pendingCount} pending</span>}
              {rejectedCount > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-red-500/25 px-2 py-0.5 text-[10px] font-semibold text-red-300"><AlertCircle className="h-2.5 w-2.5" /> {rejectedCount} rejected</span>}
            </div>
          </div>
          <div className="flex-none text-right">
            <p className="text-base font-bold text-white tabular-nums">SDG {total.toLocaleString()}</p>
            <p className="text-[10px] text-white/50 mt-0.5">Total</p>
            <div className="mt-2 flex items-center justify-end gap-1 text-white/60 text-[11px]">
              <ChevronRight className="h-4 w-4" /><span>Expand</span>
            </div>
          </div>
        </div>
      </div>
      <div className="h-1 bg-[#0F2041] flex">
        <div className="bg-green-400" style={{ width: `${(approvedCount / group.items.length) * 100}%` }} />
        <div className="bg-amber-400" style={{ width: `${(pendingCount / group.items.length) * 100}%` }} />
        <div className="bg-red-400" style={{ width: `${(rejectedCount / group.items.length) * 100}%` }} />
      </div>
    </div>
  );
}
