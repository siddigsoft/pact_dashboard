import { useState, useEffect } from 'react';
import { Eye, EyeOff, Lock, LogOut } from 'lucide-react';
import DCTPDMDashboard from './DCTPDMDashboard';

const PACT_LOGO_URL = '/pact-logo.png';

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
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0F2041 0%, #1D3461 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
        <div style={{ width: '100%', maxWidth: '420px', background: '#ffffff', borderRadius: '16px', boxShadow: '0 25px 50px rgba(0,0,0,0.4)', padding: '40px 36px' }}>
          {/* Header */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '28px' }}>
            <img
              src={PACT_LOGO_URL}
              alt="PACT Logo"
              style={{ height: '56px', width: 'auto', objectFit: 'contain', marginBottom: '16px' }}
            />
            <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#111827', margin: '0 0 4px 0' }}>DCT PDM Dashboard</h1>
            <p style={{ fontSize: '12px', color: '#6B7280', margin: '0 0 12px 0', textAlign: 'center' }}>
              2026 Digital Cash Transfer · Post-Distribution Monitoring
            </p>
            <p style={{ fontSize: '11px', color: '#6B7280', background: '#F3F4F6', padding: '8px 12px', borderRadius: '8px', textAlign: 'center', margin: 0 }}>
              This report is restricted. Enter your access credentials to continue.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="e.g. WFP-Sudan"
                autoComplete="username"
                autoFocus
                data-testid="input-pdm-username"
                style={{ width: '100%', height: '40px', padding: '0 12px', fontSize: '14px', color: '#111827', background: '#ffffff', border: '1px solid #D1D5DB', borderRadius: '8px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', pointerEvents: 'auto' }}
                onFocus={e => { e.currentTarget.style.borderColor = '#1D3461'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(29,52,97,0.15)'; }}
                onBlur={e  => { e.currentTarget.style.borderColor = '#D1D5DB'; e.currentTarget.style.boxShadow = 'none'; }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  data-testid="input-pdm-password"
                  style={{ width: '100%', height: '40px', padding: '0 40px 0 12px', fontSize: '14px', color: '#111827', background: '#ffffff', border: '1px solid #D1D5DB', borderRadius: '8px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', pointerEvents: 'auto' }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#1D3461'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(29,52,97,0.15)'; }}
                  onBlur={e  => { e.currentTarget.style.borderColor = '#D1D5DB'; e.currentTarget.style.boxShadow = 'none'; }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: '4px', display: 'flex', alignItems: 'center' }}
                >
                  {showPw ? <EyeOff style={{ width: '16px', height: '16px' }} /> : <Eye style={{ width: '16px', height: '16px' }} />}
                </button>
              </div>
            </div>

            {error && (
              <p style={{ fontSize: '12px', color: '#DC2626', fontWeight: '500', margin: 0 }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !username || !password}
              data-testid="button-pdm-login"
              style={{ width: '100%', height: '42px', background: (!loading && username && password) ? '#1D3461' : '#9CA3AF', color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: (!loading && username && password) ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontFamily: 'inherit', transition: 'background 0.2s' }}
            >
              <Lock style={{ width: '15px', height: '15px' }} />
              {loading ? 'Verifying…' : 'Access Dashboard'}
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: '10px', color: '#9CA3AF', marginTop: '20px', marginBottom: 0 }}>
            PACT Sudan · Field Operations · Confidential Report
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-[#0F2041] text-white px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src={PACT_LOGO_URL} alt="PACT" style={{ height: '22px', width: 'auto', objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
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
