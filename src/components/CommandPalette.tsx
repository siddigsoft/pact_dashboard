import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  LayoutDashboard, CreditCard, Receipt, FolderKanban, Database,
  Building2, ClipboardList, Activity, MapPin, CheckCircle, Archive,
  Link2, Calendar, Users, Shield, ShieldCheck, Award, TrendingUp,
  DollarSign, Settings, BarChart3, BookOpen, FileSignature, Phone,
  MessageSquare, Bell, FileText, Map, ScrollText, Mail, Banknote,
  ClipboardCheck, Smartphone, HelpCircle, PenTool, PhoneCall, RefreshCw,
  Search
} from 'lucide-react';

interface PageEntry {
  title: string;
  url: string;
  icon: any;
  group: string;
  keywords?: string[];
}

const ALL_PAGES: PageEntry[] = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard, group: 'Overview', keywords: ['home', 'main', 'stats'] },
  { title: 'Signatures', url: '/signatures', icon: FileSignature, group: 'Overview', keywords: ['sign', 'digital'] },

  { title: 'Chat', url: '/chat', icon: MessageSquare, group: 'Communication', keywords: ['message', 'talk'] },
  { title: 'Calls', url: '/calls', icon: Phone, group: 'Communication', keywords: ['phone', 'voice', 'video'] },
  { title: 'Notifications', url: '/notifications', icon: Bell, group: 'Communication', keywords: ['alerts', 'bell'] },

  { title: 'Projects', url: '/projects', icon: FolderKanban, group: 'Planning & Setup', keywords: ['project'] },
  { title: 'MMP Management', url: '/mmp', icon: Database, group: 'Planning & Setup', keywords: ['monthly monitoring', 'plan'] },
  { title: 'MMP Upload', url: '/mmp/upload', icon: Database, group: 'Planning & Setup', keywords: ['upload', 'csv'] },
  { title: 'Hub Operations', url: '/hub-operations', icon: Building2, group: 'Planning & Setup', keywords: ['hub'] },
  { title: 'Hub Management', url: '/hub-management', icon: Building2, group: 'Planning & Setup', keywords: ['hub'] },
  { title: 'Monitoring Plan', url: '/monitoring-plan', icon: ClipboardList, group: 'Planning & Setup', keywords: ['monitor'] },

  { title: 'Site Visits', url: '/site-visits', icon: ClipboardList, group: 'Field Operations', keywords: ['visit', 'field'] },
  { title: 'Create Site Visit', url: '/site-visits/create', icon: ClipboardList, group: 'Field Operations', keywords: ['new visit'] },
  { title: 'Field Team', url: '/field-team', icon: Activity, group: 'Field Operations', keywords: ['team', 'map'] },

  { title: 'Site Verification', url: '/coordinator/sites', icon: CheckCircle, group: 'Verification', keywords: ['verify', 'coordinator'] },
  { title: 'Coordinator Dashboard', url: '/coordinator-dashboard', icon: CheckCircle, group: 'Verification', keywords: ['coordinator'] },
  { title: 'Archive', url: '/archive', icon: Archive, group: 'Verification', keywords: ['old', 'history'] },

  { title: 'Data Visibility', url: '/data-visibility', icon: Link2, group: 'Data & Reports', keywords: ['data'] },
  { title: 'Reports', url: '/reports', icon: BarChart3, group: 'Data & Reports', keywords: ['report', 'analytics'] },
  { title: 'Calendar', url: '/calendar', icon: Calendar, group: 'Data & Reports', keywords: ['date', 'schedule'] },
  { title: 'Tracker Preparation', url: '/tracker-preparation-plan', icon: BarChart3, group: 'Data & Reports', keywords: ['tracker'] },
  { title: 'Documents', url: '/documents', icon: FileText, group: 'Data & Reports', keywords: ['file', 'doc'] },
  { title: 'Advanced Map', url: '/map', icon: Map, group: 'Data & Reports', keywords: ['map', 'geo', 'location'] },

  { title: 'My Wallet', url: '/wallet', icon: CreditCard, group: 'My Money', keywords: ['wallet', 'balance', 'money'] },
  { title: 'Cost Submission', url: '/cost-submission', icon: Receipt, group: 'My Money', keywords: ['expense', 'cost', 'submit'] },
  { title: 'Cost Submission Reports', url: '/cost-submission/reports', icon: Receipt, group: 'My Money', keywords: ['expense report'] },

  { title: 'Tier 1 Approvals', url: '/supervisor-approvals', icon: ClipboardCheck, group: 'Approvals', keywords: ['approve', 'supervisor'] },
  { title: 'Tier 2 Approvals', url: '/withdrawal-approval', icon: ClipboardCheck, group: 'Approvals', keywords: ['approve', 'withdrawal'] },
  { title: 'Down-Payment Approval', url: '/down-payment-approval', icon: DollarSign, group: 'Approvals', keywords: ['advance', 'payment'] },
  { title: 'Finance Processing', url: '/finance-approval', icon: Banknote, group: 'Approvals', keywords: ['finance', 'process'] },
  { title: 'Approval Dashboard', url: '/approval-dashboard', icon: ClipboardCheck, group: 'Approvals', keywords: ['approve', 'overview'] },

  { title: 'Budget', url: '/budget', icon: DollarSign, group: 'Financial Management', keywords: ['budget', 'money'] },
  { title: 'Wallets Admin', url: '/admin/wallets', icon: CreditCard, group: 'Financial Management', keywords: ['wallet', 'admin'] },
  { title: 'Financial Operations', url: '/financial-operations', icon: TrendingUp, group: 'Financial Management', keywords: ['finance', 'ops'] },
  { title: 'Retainer Management', url: '/retainer-management', icon: Banknote, group: 'Financial Management', keywords: ['retainer', 'payment'] },
  { title: 'Reconciliation Dashboard', url: '/reconciliation-dashboard', icon: ClipboardCheck, group: 'Financial Management', keywords: ['reconcile'] },

  { title: 'Wallet Reports', url: '/wallet-reports', icon: BarChart3, group: 'Financial Reports', keywords: ['wallet', 'report'] },
  { title: 'Transport Advance Report', url: '/advance-requests-report', icon: BarChart3, group: 'Financial Reports', keywords: ['advance', 'transport'] },
  { title: 'Cost Predictions', url: '/cost-predictions', icon: TrendingUp, group: 'Financial Reports', keywords: ['predict', 'forecast'] },
  { title: 'Exchange Rates', url: '/exchange-rates', icon: DollarSign, group: 'Financial Reports', keywords: ['currency', 'rate', 'usd', 'sdg'] },

  { title: 'User Management', url: '/users', icon: Users, group: 'Administration', keywords: ['user', 'team', 'people'] },
  { title: 'Role Management', url: '/role-management', icon: Shield, group: 'Administration', keywords: ['role', 'permission'] },
  { title: 'Classifications', url: '/classifications', icon: Award, group: 'Administration', keywords: ['class', 'grade'] },
  { title: 'Classification Fees', url: '/classification-fees', icon: DollarSign, group: 'Administration', keywords: ['fee', 'rate'] },
  { title: 'Settings', url: '/settings', icon: Settings, group: 'Administration', keywords: ['config', 'preferences'] },
  { title: 'Permissions Management', url: '/permissions-management', icon: ShieldCheck, group: 'Administration', keywords: ['access', 'permission'] },
  { title: 'Role Perspective Viewer', url: '/role-perspective', icon: ShieldCheck, group: 'Administration', keywords: ['simulate', 'perspective'] },

  { title: 'Documentation', url: '/documentation', icon: BookOpen, group: 'Help & Support', keywords: ['help', 'guide', 'manual'] },
  { title: 'Mobile User Manual', url: '/mobile-documentation', icon: Smartphone, group: 'Help & Support', keywords: ['mobile', 'guide'] },
  { title: 'Support Contacts', url: '/support-contacts', icon: Phone, group: 'Help & Support', keywords: ['contact', 'help'] },

  { title: 'Super Admin Management', url: '/super-admin-management', icon: ShieldCheck, group: 'Super Admin', keywords: ['admin'] },
  { title: 'Data Management', url: '/super-admin-data', icon: Database, group: 'Super Admin', keywords: ['data'] },
  { title: 'Audit Logs', url: '/audit-logs', icon: ScrollText, group: 'Super Admin', keywords: ['audit', 'log'] },
  { title: 'Staff Directory', url: '/admin/staff-profiles', icon: Users, group: 'Administration', keywords: ['staff', 'profiles', 'directory', 'team', 'bank', 'account', 'online'] },
  { title: 'Email Tracking', url: '/email-tracking', icon: Mail, group: 'Super Admin', keywords: ['email'] },
  { title: 'Email Management', url: '/email-management', icon: Mail, group: 'Super Admin', keywords: ['email'] },
  { title: 'Mobile Support Tickets', url: '/mobile-support-tickets', icon: Smartphone, group: 'Super Admin', keywords: ['ticket'] },
  { title: 'Mobile Help Articles', url: '/mobile-help-articles', icon: HelpCircle, group: 'Super Admin', keywords: ['article'] },
  { title: 'Mobile Signatures', url: '/mobile-signatures', icon: PenTool, group: 'Super Admin', keywords: ['sign'] },
  { title: 'Mobile Call Scheduling', url: '/mobile-call-scheduling', icon: PhoneCall, group: 'Super Admin', keywords: ['call'] },
  { title: 'Mobile Document Sync', url: '/mobile-document-sync', icon: RefreshCw, group: 'Super Admin', keywords: ['sync'] },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && !isInputFocused()) {
        e.preventDefault();
        setOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const grouped = useMemo(() => {
    const map: Record<string, PageEntry[]> = {};
    ALL_PAGES.forEach((page) => {
      if (!map[page.group]) map[page.group] = [];
      map[page.group].push(page);
    });
    return map;
  }, []);

  const handleSelect = (url: string) => {
    setOpen(false);
    navigate(url);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground bg-muted/50 border border-border rounded-lg hover:bg-muted transition-colors cursor-pointer"
        data-testid="button-command-palette"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Search pages...</span>
        <kbd className="hidden md:inline-flex items-center gap-0.5 rounded border bg-background px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
          /
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Type a page name or / to search..." data-testid="input-command-search" />
        <CommandList>
          <CommandEmpty>No pages found.</CommandEmpty>
          {Object.entries(grouped).map(([group, pages], idx) => (
            <span key={group}>
              {idx > 0 && <CommandSeparator />}
              <CommandGroup heading={group}>
                {pages.map((page) => (
                  <CommandItem
                    key={page.url}
                    value={`${page.title} ${page.url} ${(page.keywords || []).join(' ')}`}
                    onSelect={() => handleSelect(page.url)}
                    className="cursor-pointer"
                    data-testid={`command-item-${page.url.replace(/\//g, '-').slice(1)}`}
                  >
                    <page.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span>{page.title}</span>
                    <span className="ml-auto text-xs text-muted-foreground font-mono">{page.url}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </span>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}
