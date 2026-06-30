import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import {
  Key, Webhook, BarChart2, Copy, Eye, EyeOff, Trash2, Plus, RefreshCw,
  Shield, Globe, CheckCircle, XCircle, Clock, Filter, Code, Download,
  Lock, Unlock, ChevronDown, Info, Zap, ArrowRight, Database
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

type TabId = 'keys' | 'endpoints' | 'usage';

const BASE_URL = `${import.meta.env.VITE_SUPABASE_URL ?? ''}/functions/v1/fd-api`;

// ── Helpers ──────────────────────────────────────────────────────────────────
function ago(ts: string) {
  const d = Date.now() - new Date(ts).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleDateString();
}

function copyText(text: string, toast: (o: any) => void) {
  navigator.clipboard.writeText(text).then(() => toast({ title: 'Copied to clipboard' }));
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1: API Keys
// ─────────────────────────────────────────────────────────────────────────────
function APIKeysTab() {
  const { user } = useUser();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [showCreate, setShowCreate]       = useState(false);
  const [keyName, setKeyName]             = useState('');
  const [keyScope, setKeyScope]           = useState<'global' | 'form'>('global');
  const [keyFormId, setKeyFormId]         = useState('');
  const [keyAccess, setKeyAccess]         = useState<'read' | 'read_write'>('read');
  const [ipWhitelist, setIpWhitelist]     = useState('');
  const [revealedKey, setRevealedKey]     = useState<string | null>(null);
  const [newKeyValue, setNewKeyValue]     = useState('');
  const [revokeId, setRevokeId]           = useState<string | null>(null);

  const { data: forms = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['fd-forms-api'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fd_forms').select('id, name').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: apiKeys = [], isLoading } = useQuery<any[]>({
    queryKey: ['fd-api-keys'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fd_api_keys')
        .select('id, name, key_prefix, key_scope, form_id, access_level, ip_whitelist, is_active, last_used_at, usage_count, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const generateKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const arr = new Uint8Array(40);
    crypto.getRandomValues(arr);
    return 'pact_' + Array.from(arr).map(b => chars[b % chars.length]).join('');
  };

  const createKey = useMutation({
    mutationFn: async () => {
      if (!keyName.trim()) throw new Error('Key name is required');
      const raw = generateKey();
      const ips = ipWhitelist.trim() ? ipWhitelist.split(',').map(s => s.trim()).filter(Boolean) : [];
      const { error } = await supabase.from('fd_api_keys').insert({
        name: keyName.trim(),
        key_hash: await hashKey(raw),
        key_prefix: raw.slice(0, 12),
        key_scope: keyScope,
        form_id: keyScope === 'form' ? keyFormId || null : null,
        access_level: keyAccess,
        ip_whitelist: ips,
        is_active: true,
        created_by: user?.id,
      });
      if (error) throw error;
      return raw;
    },
    onSuccess: (raw) => {
      qc.invalidateQueries({ queryKey: ['fd-api-keys'] });
      setNewKeyValue(raw);
      setShowCreate(false);
      setKeyName(''); setKeyScope('global'); setKeyFormId(''); setKeyAccess('read'); setIpWhitelist('');
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const revokeKey = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fd_api_keys').update({ is_active: false }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fd-api-keys'] });
      setRevokeId(null);
      toast({ title: 'API key revoked' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  async function hashKey(raw: string): Promise<string> {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  return (
    <div className="flex flex-col gap-4">
      {/* New key success banner */}
      {newKeyValue && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-green-50 border border-green-200">
          <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-green-800">API key created — copy it now</p>
            <p className="text-xs text-green-700 mt-0.5">This value will not be shown again.</p>
            <div className="flex items-center gap-2 mt-2">
              <code className="text-xs bg-white border border-green-300 rounded px-2 py-1 flex-1 break-all">
                {newKeyValue}
              </code>
              <Button size="sm" variant="outline" className="flex-shrink-0"
                onClick={() => copyText(newKeyValue, toast)} data-testid="copy-new-key">
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>
          <Button size="icon" variant="ghost" className="h-6 w-6 flex-shrink-0"
            onClick={() => setNewKeyValue('')}>
            <XCircle className="h-4 w-4 text-green-600" />
          </Button>
        </div>
      )}

      {/* Actions row */}
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{apiKeys.length} key{apiKeys.length !== 1 ? 's' : ''} configured</p>
        <Button size="sm" onClick={() => setShowCreate(true)} data-testid="btn-create-key">
          <Plus className="h-4 w-4 mr-1" /> Generate Key
        </Button>
      </div>

      {/* Keys table */}
      {isLoading && (
        <div className="flex items-center gap-2 justify-center py-8 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" /> Loading keys…
        </div>
      )}

      {!isLoading && apiKeys.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <Key className="h-10 w-10 opacity-30" />
          <p className="text-sm">No API keys yet. Generate one to get started.</p>
        </div>
      )}

      {apiKeys.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="p-3 text-left">Name</th>
                <th className="p-3 text-left">Key prefix</th>
                <th className="p-3 text-left">Access</th>
                <th className="p-3 text-left">Scope</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Last used</th>
                <th className="p-3 text-left">Calls</th>
                <th className="p-3 text-left">IP whitelist</th>
                <th className="p-3 text-left"></th>
              </tr>
            </thead>
            <tbody>
              {apiKeys.map((k, i) => (
                <tr key={k.id}
                  className={cn('border-b last:border-0 hover:bg-muted/30', i % 2 === 0 && 'bg-background')}
                  data-testid={`api-key-row-${k.id}`}>
                  <td className="p-3 font-medium">{k.name}</td>
                  <td className="p-3">
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{k.key_prefix}…</code>
                  </td>
                  <td className="p-3">
                    {k.access_level === 'read_write'
                      ? <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs"><Unlock className="h-3 w-3 mr-1" />Read/Write</Badge>
                      : <Badge variant="outline" className="text-xs"><Lock className="h-3 w-3 mr-1" />Read-only</Badge>}
                  </td>
                  <td className="p-3">
                    {k.key_scope === 'form' && k.form_id
                      ? <span className="text-xs text-muted-foreground">
                          {forms.find(f => f.id === k.form_id)?.name ?? k.form_id.slice(0, 8) + '…'}
                        </span>
                      : <Badge variant="outline" className="text-xs"><Globe className="h-3 w-3 mr-1" />Global</Badge>}
                  </td>
                  <td className="p-3">
                    {k.is_active
                      ? <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">Active</Badge>
                      : <Badge variant="outline" className="text-xs text-muted-foreground">Revoked</Badge>}
                  </td>
                  <td className="p-3 text-muted-foreground text-xs">
                    {k.last_used_at ? ago(k.last_used_at) : '—'}
                  </td>
                  <td className="p-3 text-muted-foreground">{k.usage_count ?? 0}</td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {(k.ip_whitelist ?? []).length > 0
                      ? (k.ip_whitelist as string[]).join(', ')
                      : <span className="opacity-50">Any IP</span>}
                  </td>
                  <td className="p-3">
                    {k.is_active && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                        onClick={() => setRevokeId(k.id)}
                        data-testid={`revoke-key-${k.id}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create key dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" /> Generate API Key
            </DialogTitle>
            <DialogDescription>
              Keys are hashed on creation. Copy the value immediately — it won't be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-1">
            <div className="flex flex-col gap-1.5">
              <Label>Key name</Label>
              <Input placeholder="e.g. PowerBI integration" value={keyName}
                onChange={e => setKeyName(e.target.value)} data-testid="input-key-name" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Access level</Label>
              <Select value={keyAccess} onValueChange={v => setKeyAccess(v as any)}>
                <SelectTrigger data-testid="select-key-access">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="read">Read-only (GET endpoints only)</SelectItem>
                  <SelectItem value="read_write">Read/Write (includes POST inbound)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Scope</Label>
              <Select value={keyScope} onValueChange={v => setKeyScope(v as any)}>
                <SelectTrigger data-testid="select-key-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global — all forms</SelectItem>
                  <SelectItem value="form">Single form</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {keyScope === 'form' && (
              <div className="flex flex-col gap-1.5">
                <Label>Form</Label>
                <Select value={keyFormId} onValueChange={setKeyFormId}>
                  <SelectTrigger data-testid="select-key-form">
                    <SelectValue placeholder="Select form…" />
                  </SelectTrigger>
                  <SelectContent>
                    {forms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label>IP whitelist <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input placeholder="192.168.1.1, 10.0.0.0/8" value={ipWhitelist}
                onChange={e => setIpWhitelist(e.target.value)} data-testid="input-ip-whitelist" />
              <p className="text-xs text-muted-foreground">Comma-separated IPs or CIDR ranges. Leave empty to allow any IP.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button disabled={!keyName.trim() || createKey.isPending}
              onClick={() => createKey.mutate()} data-testid="btn-save-new-key">
              {createKey.isPending ? 'Generating…' : 'Generate Key'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke confirm dialog */}
      <Dialog open={!!revokeId} onOpenChange={() => setRevokeId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" /> Revoke API Key
            </DialogTitle>
            <DialogDescription>
              This key will immediately stop working. Any integrations using it will fail. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeId(null)}>Cancel</Button>
            <Button variant="destructive" disabled={revokeKey.isPending}
              onClick={() => revokeId && revokeKey.mutate(revokeId)}
              data-testid="btn-confirm-revoke">
              {revokeKey.isPending ? 'Revoking…' : 'Revoke Key'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2: Endpoint Reference
// ─────────────────────────────────────────────────────────────────────────────
interface Endpoint {
  method: 'GET' | 'POST';
  path: string;
  desc: string;
  auth: 'api_key' | 'hmac';
  access: 'read' | 'write';
  params?: { name: string; desc: string }[];
  example?: string;
  responseNote?: string;
}

const ENDPOINTS: Endpoint[] = [
  // ── Outbound ──────────────────────────────────────────────────────────────
  {
    method: 'GET', path: '/forms', auth: 'api_key', access: 'read',
    desc: 'List all forms accessible by the API key.',
    responseNote: 'Returns array of form objects (id, name, version, status, submission_count).',
    example: `curl -H "X-API-Key: pact_..." \\\n  ${BASE_URL}/forms`,
  },
  {
    method: 'GET', path: '/forms/:id/submissions', auth: 'api_key', access: 'read',
    desc: 'Paginated list of submissions for a form.',
    params: [
      { name: 'page',    desc: 'Page number (default: 1)' },
      { name: 'limit',   desc: 'Results per page (max: 1000, default: 100)' },
      { name: 'since',   desc: 'ISO 8601 timestamp — return submissions after this date' },
      { name: 'status',  desc: 'Filter by review_status (pending|approved|rejected)' },
    ],
    example: `curl -H "X-API-Key: pact_..." \\\n  "${BASE_URL}/forms/FORM_ID/submissions?page=1&limit=100"`,
    responseNote: 'Returns { data: Submission[], total, page, limit, has_more }.',
  },
  {
    method: 'GET', path: '/forms/:id/submissions/:uuid', auth: 'api_key', access: 'read',
    desc: 'Fetch a single submission by its UUID.',
    example: `curl -H "X-API-Key: pact_..." \\\n  ${BASE_URL}/forms/FORM_ID/submissions/SUBMISSION_UUID`,
  },
  {
    method: 'GET', path: '/forms/:id/submissions.csv', auth: 'api_key', access: 'read',
    desc: 'Download all submissions as a flat CSV file (data field is flattened into columns).',
    example: `curl -H "X-API-Key: pact_..." \\\n  -o submissions.csv \\\n  ${BASE_URL}/forms/FORM_ID/submissions.csv`,
    responseNote: 'Content-Type: text/csv. Includes all question fields as columns.',
  },
  {
    method: 'GET', path: '/forms/:id/stats', auth: 'api_key', access: 'read',
    desc: 'Submission statistics for a form: total, by status, by date, completion rate.',
    example: `curl -H "X-API-Key: pact_..." \\\n  ${BASE_URL}/forms/FORM_ID/stats`,
  },
  {
    method: 'GET', path: '/studies/:id/rounds', auth: 'api_key', access: 'read',
    desc: 'List all rounds in a multi-round study with completion status.',
    example: `curl -H "X-API-Key: pact_..." \\\n  ${BASE_URL}/studies/STUDY_ID/rounds`,
  },
  {
    method: 'GET', path: '/studies/:id/comparison', auth: 'api_key', access: 'read',
    desc: 'Cross-round comparison data for a study (coverage, averages, delta by indicator).',
    example: `curl -H "X-API-Key: pact_..." \\\n  ${BASE_URL}/studies/STUDY_ID/comparison`,
  },
  {
    method: 'GET', path: '/datasets/:id', auth: 'api_key', access: 'read',
    desc: 'Fetch a server dataset (reference data) by ID.',
    example: `curl -H "X-API-Key: pact_..." \\\n  ${BASE_URL}/datasets/DATASET_ID`,
  },
  {
    method: 'GET', path: '/forms/:id/odata', auth: 'api_key', access: 'read',
    desc: 'OData v4 feed — connect Power BI, Tableau, or Excel directly.',
    params: [
      { name: '$top',    desc: 'Max rows to return' },
      { name: '$skip',   desc: 'Rows to skip (pagination)' },
      { name: '$filter', desc: 'OData filter expression (e.g. status eq \'approved\')' },
    ],
    example: `# Power BI OData URL:\n${BASE_URL}/forms/FORM_ID/odata\n# Auth header: X-API-Key: pact_...`,
    responseNote: 'Returns OData JSON format with @odata.context and value array.',
  },
  // ── Inbound ───────────────────────────────────────────────────────────────
  {
    method: 'POST', path: '/webhook/:form_id', auth: 'hmac', access: 'write',
    desc: 'Inbound webhook endpoint. Ona, MoDa, and ODK Central push new submissions here.',
    params: [
      { name: 'X-Hub-Signature-256', desc: 'HMAC-SHA256 of the raw body (header)' },
    ],
    example: `# Configure in Ona/ODK Central:\nEndpoint: ${BASE_URL}/webhook/FORM_ID\nSecret:   <webhook_secret stored in fd_webhook_secrets>`,
    responseNote: 'Returns 200 on success, 401 on bad HMAC, 422 on parse error.',
  },
  {
    method: 'POST', path: '/submissions/:form_id', auth: 'api_key', access: 'write',
    desc: 'Direct submission via REST (custom mobile apps, IoT devices). Requires read_write key.',
    example: `curl -X POST \\\n  -H "X-API-Key: pact_..." \\\n  -H "Content-Type: application/json" \\\n  -d '{"name":"Alice","age":32}' \\\n  ${BASE_URL}/submissions/FORM_ID`,
    responseNote: 'Returns { id, submitted_at } of the created submission.',
  },
];

function EndpointsTab() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<'all' | 'GET' | 'POST'>('all');
  const [expandedPath, setExpandedPath] = useState<string | null>(null);

  const filtered = ENDPOINTS.filter(e => filter === 'all' || e.method === filter);

  return (
    <div className="flex flex-col gap-4">
      {/* Base URL */}
      <div className="rounded-lg border bg-muted/40 p-4 flex items-center gap-3">
        <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">Base URL</p>
          <code className="text-sm break-all">{BASE_URL}</code>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0"
          onClick={() => copyText(BASE_URL, toast)} data-testid="copy-base-url">
          <Copy className="h-4 w-4" />
        </Button>
      </div>

      {/* Auth note */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-lg border p-3 flex items-start gap-2 bg-blue-50 border-blue-200">
          <Key className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm text-blue-800">API Key Auth</p>
            <p className="text-xs text-blue-700 mt-0.5">Send <code>X-API-Key: pact_…</code> header on every request.</p>
          </div>
        </div>
        <div className="rounded-lg border p-3 flex items-start gap-2 bg-purple-50 border-purple-200">
          <Shield className="h-4 w-4 text-purple-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm text-purple-800">HMAC Webhook Auth</p>
            <p className="text-xs text-purple-700 mt-0.5">Send <code>X-Hub-Signature-256: sha256=…</code> computed from the webhook secret.</p>
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {(['all', 'GET', 'POST'] as const).map(f => (
          <Button key={f} variant={filter === f ? 'default' : 'outline'} size="sm"
            onClick={() => setFilter(f)} data-testid={`filter-${f}`}>
            {f === 'all' ? 'All' : f}
          </Button>
        ))}
      </div>

      {/* Endpoint cards */}
      <div className="flex flex-col gap-2">
        {filtered.map(ep => {
          const key = `${ep.method}:${ep.path}`;
          const expanded = expandedPath === key;
          return (
            <div key={key} className="rounded-lg border bg-card overflow-hidden"
              data-testid={`endpoint-${ep.method}-${ep.path.replace(/\//g, '-')}`}>
              <button
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                onClick={() => setExpandedPath(expanded ? null : key)}>
                <Badge className={cn('text-xs font-mono w-14 justify-center flex-shrink-0',
                  ep.method === 'GET' ? 'bg-green-100 text-green-800 border-green-200' : 'bg-orange-100 text-orange-800 border-orange-200')}>
                  {ep.method}
                </Badge>
                <code className="text-sm font-mono text-primary">{ep.path}</code>
                <span className="text-sm text-muted-foreground flex-1 hidden sm:block">{ep.desc}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {ep.auth === 'hmac'
                    ? <Badge variant="outline" className="text-xs"><Shield className="h-3 w-3 mr-1" />HMAC</Badge>
                    : <Badge variant="outline" className="text-xs"><Key className="h-3 w-3 mr-1" />API Key</Badge>}
                  <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
                </div>
              </button>

              {expanded && (
                <div className="border-t px-4 py-4 flex flex-col gap-3 bg-muted/20">
                  <p className="text-sm">{ep.desc}</p>

                  {ep.params && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1.5">PARAMETERS</p>
                      <table className="w-full text-xs">
                        <tbody>
                          {ep.params.map(p => (
                            <tr key={p.name} className="border-b last:border-0">
                              <td className="py-1.5 pr-4"><code className="bg-muted px-1 py-0.5 rounded">{p.name}</code></td>
                              <td className="py-1.5 text-muted-foreground">{p.desc}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {ep.example && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-semibold text-muted-foreground">EXAMPLE</p>
                        <Button variant="ghost" size="sm" className="h-6 text-xs"
                          onClick={() => copyText(ep.example!, toast)}>
                          <Copy className="h-3 w-3 mr-1" /> Copy
                        </Button>
                      </div>
                      <pre className="text-xs bg-zinc-900 text-zinc-100 rounded p-3 overflow-x-auto whitespace-pre-wrap">
                        {ep.example}
                      </pre>
                    </div>
                  )}

                  {ep.responseNote && (
                    <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted rounded p-2">
                      <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                      {ep.responseNote}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3: Usage Log
// ─────────────────────────────────────────────────────────────────────────────
function UsageLogTab() {
  const { toast } = useToast();
  const [filterKeyId, setFilterKeyId]       = useState('');
  const [filterMethod, setFilterMethod]     = useState('');
  const [filterStatus, setFilterStatus]     = useState('');
  const [dateRange, setDateRange]           = useState('7');

  const { data: apiKeys = [] } = useQuery<any[]>({
    queryKey: ['fd-api-keys'],
    queryFn: async () => {
      const { data } = await supabase.from('fd_api_keys').select('id, name, key_prefix').order('name');
      return data ?? [];
    },
  });

  const { data: usageLogs = [], isLoading } = useQuery<any[]>({
    queryKey: ['fd-api-usage', filterKeyId, filterMethod, filterStatus, dateRange],
    queryFn: async () => {
      const since = new Date(Date.now() - parseInt(dateRange, 10) * 86400000).toISOString();
      let q = supabase
        .from('fd_api_usage_logs')
        .select('id, api_key_id, method, path, status_code, response_ms, ip_address, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(200);
      if (filterKeyId) q = q.eq('api_key_id', filterKeyId);
      if (filterMethod) q = q.eq('method', filterMethod);
      if (filterStatus) {
        if (filterStatus === '2xx') q = q.gte('status_code', 200).lte('status_code', 299);
        else if (filterStatus === '4xx') q = q.gte('status_code', 400).lte('status_code', 499);
        else if (filterStatus === '5xx') q = q.gte('status_code', 500);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  // Daily summary
  const dailyCounts = usageLogs.reduce<Record<string, number>>((acc, l) => {
    const d = new Date(l.created_at).toLocaleDateString();
    acc[d] = (acc[d] ?? 0) + 1;
    return acc;
  }, {});

  const totalRequests = usageLogs.length;
  const successCount  = usageLogs.filter(l => l.status_code >= 200 && l.status_code < 300).length;
  const errorCount    = usageLogs.filter(l => l.status_code >= 400).length;
  const avgMs = usageLogs.length ? Math.round(usageLogs.reduce((s, l) => s + (l.response_ms ?? 0), 0) / usageLogs.length) : 0;

  const exportCSV = () => {
    if (!usageLogs.length) return;
    const headers = ['Date', 'Method', 'Path', 'Status', 'Response ms', 'IP'];
    const rows = usageLogs.map(l => [
      new Date(l.created_at).toLocaleString(),
      l.method, l.path, l.status_code, l.response_ms ?? '', l.ip_address ?? ''
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'api-usage-log.csv';
    a.click();
  };

  return (
    <div className="flex flex-col gap-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Requests',  value: totalRequests, icon: Zap,       color: 'text-blue-600' },
          { label: 'Successful',      value: successCount,  icon: CheckCircle, color: 'text-green-600' },
          { label: 'Errors',          value: errorCount,    icon: XCircle,   color: 'text-red-600' },
          { label: 'Avg Latency',     value: `${avgMs} ms`, icon: Clock,     color: 'text-amber-600' },
        ].map(kv => (
          <div key={kv.label} className="rounded-lg border bg-card p-4 flex items-center gap-3">
            <kv.icon className={cn('h-5 w-5 flex-shrink-0', kv.color)} />
            <div>
              <p className="text-2xl font-bold">{kv.value}</p>
              <p className="text-xs text-muted-foreground">{kv.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-36" data-testid="select-date-range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Last 24h</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterKeyId} onValueChange={setFilterKeyId}>
          <SelectTrigger className="w-44" data-testid="select-filter-key">
            <SelectValue placeholder="All keys" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All keys</SelectItem>
            {apiKeys.map(k => (
              <SelectItem key={k.id} value={k.id}>{k.name} ({k.key_prefix}…)</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterMethod} onValueChange={setFilterMethod}>
          <SelectTrigger className="w-32" data-testid="select-filter-method">
            <SelectValue placeholder="All methods" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All methods</SelectItem>
            <SelectItem value="GET">GET</SelectItem>
            <SelectItem value="POST">POST</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-32" data-testid="select-filter-status">
            <SelectValue placeholder="All status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All status</SelectItem>
            <SelectItem value="2xx">2xx — Success</SelectItem>
            <SelectItem value="4xx">4xx — Client error</SelectItem>
            <SelectItem value="5xx">5xx — Server error</SelectItem>
          </SelectContent>
        </Select>
        {usageLogs.length > 0 && (
          <Button variant="outline" size="sm" onClick={exportCSV} className="ml-auto"
            data-testid="btn-export-usage">
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
        )}
      </div>

      {/* Daily bar chart (CSS-based) */}
      {Object.keys(dailyCounts).length > 1 && (
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground mb-3">REQUESTS PER DAY</p>
          <div className="flex items-end gap-1 h-20">
            {Object.entries(dailyCounts).slice(-14).map(([day, count]) => {
              const max = Math.max(...Object.values(dailyCounts));
              const pct = max > 0 ? (count / max) * 100 : 0;
              return (
                <div key={day} className="flex-1 flex flex-col items-center gap-1" title={`${day}: ${count}`}>
                  <div className="w-full bg-primary/80 rounded-t transition-all"
                    style={{ height: `${Math.max(pct, 4)}%` }} />
                  <span className="text-[9px] text-muted-foreground rotate-45 origin-left whitespace-nowrap hidden sm:block">
                    {day.slice(0, 5)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Log table */}
      {isLoading && (
        <div className="flex items-center gap-2 justify-center py-8 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" /> Loading usage log…
        </div>
      )}
      {!isLoading && usageLogs.length === 0 && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          No API calls recorded in this period.
        </div>
      )}

      {usageLogs.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="p-3 text-left">Time</th>
                <th className="p-3 text-left">Method</th>
                <th className="p-3 text-left">Path</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Latency</th>
                <th className="p-3 text-left">IP</th>
                <th className="p-3 text-left">Key</th>
              </tr>
            </thead>
            <tbody>
              {usageLogs.map((l, i) => (
                <tr key={l.id}
                  className={cn('border-b last:border-0 hover:bg-muted/30', i % 2 === 0 && 'bg-background')}
                  data-testid={`usage-row-${l.id}`}>
                  <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{ago(l.created_at)}</td>
                  <td className="p-3">
                    <Badge className={cn('text-xs font-mono',
                      l.method === 'GET' ? 'bg-green-100 text-green-800 border-green-200' : 'bg-orange-100 text-orange-800 border-orange-200')}>
                      {l.method}
                    </Badge>
                  </td>
                  <td className="p-3 font-mono text-xs max-w-[200px] truncate" title={l.path}>{l.path}</td>
                  <td className="p-3">
                    <span className={cn('font-mono text-xs font-semibold',
                      l.status_code < 300 ? 'text-green-600' :
                      l.status_code < 500 ? 'text-amber-600' : 'text-red-600')}>
                      {l.status_code}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{l.response_ms != null ? `${l.response_ms}ms` : '—'}</td>
                  <td className="p-3 text-xs text-muted-foreground font-mono">{l.ip_address ?? '—'}</td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {apiKeys.find(k => k.id === l.api_key_id)?.name ?? l.api_key_id?.slice(0, 8) ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {usageLogs.length >= 200 && (
            <div className="p-3 text-center text-xs text-muted-foreground border-t">
              Showing most recent 200 records. Use the date filter or Export CSV for the full log.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function FieldDataAPI() {
  const [tab, setTab] = useState<TabId>('keys');

  const TABS: { id: TabId; label: string; icon: React.ElementType; desc: string }[] = [
    { id: 'keys',      label: 'API Keys',          icon: Key,      desc: 'Generate, revoke, and configure API keys' },
    { id: 'endpoints', label: 'Endpoint Reference', icon: Code,     desc: 'All available endpoints with curl examples' },
    { id: 'usage',     label: 'Usage Log',          icon: BarChart2, desc: 'Request history, latency, and error rates' },
  ];

  const ActiveTab = tab === 'keys' ? APIKeysTab : tab === 'endpoints' ? EndpointsTab : UsageLogTab;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Webhook className="h-6 w-6 text-primary" />
          API &amp; Integrations
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          REST API for inbound/outbound data exchange, webhook endpoints, OData feed, and API key management.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn(
              'text-left rounded-xl border p-4 flex items-start gap-3 transition-all',
              tab === t.id
                ? 'border-primary bg-primary/5 shadow-sm'
                : 'border-border bg-card hover:border-primary/40 hover:bg-muted/30'
            )}
            data-testid={`tab-card-${t.id}`}>
            <div className={cn('rounded-lg p-2 flex-shrink-0',
              tab === t.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
              <t.icon className="h-5 w-5" />
            </div>
            <div>
              <p className={cn('font-semibold text-sm', tab === t.id && 'text-primary')}>{t.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="rounded-xl border bg-card p-5">
        <ActiveTab />
      </div>
    </div>
  );
}
