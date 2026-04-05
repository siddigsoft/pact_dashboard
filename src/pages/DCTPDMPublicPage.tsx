import { useState, useEffect } from 'react';
import { Eye, EyeOff, Lock, BarChart3, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import DCTPDMDashboard from './DCTPDMDashboard';

const GUEST_USER = 'WFP-Sudan';
const GUEST_PASS = 'PACT@2026';
const SESSION_KEY = 'pdm_public_access';

export default function DCTPDMPublicPage() {
  const [authed, setAuthed]     = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY) === '1') setAuthed(true);
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    setTimeout(() => {
      if (username.trim().toLowerCase() === GUEST_USER.toLowerCase() && password.trim() === GUEST_PASS) {
        sessionStorage.setItem(SESSION_KEY, '1');
        setAuthed(true);
      } else {
        setError('Invalid username or password. Please try again.');
      }
      setLoading(false);
    }, 400);
  };

  const handleLogout = () => {
    sessionStorage.removeItem(SESSION_KEY);
    setAuthed(false); setUsername(''); setPassword('');
  };

  if (!authed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0F2041] to-[#1D3461] flex flex-col items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-2xl border-0">
          <CardContent className="p-8">
            <div className="flex flex-col items-center mb-7">
              <div className="w-14 h-14 rounded-2xl bg-[#0F2041] flex items-center justify-center mb-4 shadow-lg">
                <BarChart3 className="h-7 w-7 text-white" />
              </div>
              <h1 className="text-xl font-bold text-foreground">DCT PDM Dashboard</h1>
              <p className="text-xs text-muted-foreground mt-1 text-center">
                2026 Digital Cash Transfer · Post-Distribution Monitoring
              </p>
              <p className="text-[11px] text-muted-foreground mt-3 bg-muted px-3 py-1.5 rounded-lg text-center">
                This report is restricted. Enter your access credentials to continue.
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Username</label>
                <Input
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="e.g. WFP-Sudan"
                  autoComplete="username"
                  className="h-10"
                  data-testid="input-pdm-username"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Password</label>
                <div className="relative">
                  <Input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter password"
                    autoComplete="current-password"
                    className="h-10 pr-10"
                    data-testid="input-pdm-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-xs text-red-500 font-medium">{error}</p>
              )}

              <Button
                type="submit"
                className="w-full h-10 bg-[#1D3461] hover:bg-[#0F2041] text-white font-semibold"
                disabled={loading || !username || !password}
                data-testid="button-pdm-login"
              >
                {loading ? (
                  <span className="flex items-center gap-2"><Lock className="h-4 w-4 animate-pulse" />Verifying…</span>
                ) : (
                  <span className="flex items-center gap-2"><Lock className="h-4 w-4" />Access Dashboard</span>
                )}
              </Button>
            </form>

            <p className="text-center text-[10px] text-muted-foreground mt-5">
              PACT Sudan · Field Operations · Confidential Report
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-[#0F2041] text-white px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          <span className="text-sm font-semibold">PACT · DCT PDM Dashboard 2026</span>
          <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full">Public Report Access</span>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-[11px] text-white/70 hover:text-white transition-colors"
          data-testid="button-pdm-logout"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
      <DCTPDMDashboard publicMode />
    </div>
  );
}
