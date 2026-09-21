import React, { useState, useEffect, useRef } from 'react';
import {
  BrowserRouter, Routes, Route, useNavigate, useParams, Link, useLocation
} from 'react-router-dom';
import axios from 'axios';
import {
  Scale, LayoutDashboard, FileText, GitCompare, LogOut, Shield,
  Upload, Sparkles, CheckCircle, Clock, AlertCircle, Send, Loader2,
  ChevronLeft, BookOpen, Calendar, FileSearch, Eye, EyeOff, X,
  AlertTriangle
} from 'lucide-react';

// ─── Global styles injected once ─────────────────────────────────────────────
const GLOBAL_CSS = `
  @keyframes spin   { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes pulse  { 0%,100% { opacity:1; } 50% { opacity:0.35; } }
  @keyframes fadein { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
  .lp-btn-primary:hover  { background: #4338ca !important; }
  .lp-btn-navy:hover     { background: #1e293b !important; }
  .lp-btn-ghost:hover    { background: #f1f5f9 !important; }
  .lp-nav-link:hover     { background: #1e293b !important; color: white !important; }
  .lp-doc-row:hover      { background: #f8fafc !important; }
  .lp-clause-card:hover  { border-color: #cbd5e1 !important; }
  .lp-input:focus        { border-color:#4f46e5!important; box-shadow:0 0 0 1px #4f46e5!important; }
`;

function StyleInjector() {
  useEffect(() => {
    const el = document.createElement('style');
    el.textContent = GLOBAL_CSS;
    document.head.appendChild(el);
    return () => { document.head.removeChild(el); };
  }, []);
  return null;
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  navy:   '#0f172a',
  indigo: '#4f46e5',
  emerald:'#059669',
  slate:  '#64748b',
  bg:     '#f8fafc',
  white:  '#ffffff',
  border: '#e2e8f0',
  borderLight: '#f1f5f9',
  textMuted: '#64748b',
  textDim:   '#94a3b8',
  riskHigh:   { bg:'#fef2f2', color:'#991b1b', border:'#fecaca' },
  riskMid:    { bg:'#fffbeb', color:'#92400e', border:'#fde68a' },
  riskLow:    { bg:'#ecfdf5', color:'#065f46', border:'#a7f3d0' },
};

// ─── Reusable components ──────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg:string; color:string; border:string; icon:any; label:string }> = {
    pending:   { ...C.riskMid,  icon: Clock,        label: 'Processing' },
    processed: { ...C.riskLow,  icon: CheckCircle,   label: 'Ready'      },
    failed:    { ...C.riskHigh, icon: AlertCircle,   label: 'Failed'     },
  };
  const s = map[status] ?? map.pending;
  const Icon = s.icon;
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:4,
      padding:'2px 8px', borderRadius:999, fontSize:11, fontWeight:700,
      background:s.bg, color:s.color, border:`1px solid ${s.border}`,
      letterSpacing:'0.04em', textTransform:'uppercase', whiteSpace:'nowrap',
    }}>
      <Icon size={10} />{s.label}
    </span>
  );
}

function RiskBadge({ tier }: { tier: string }) {
  if (!tier) return null;
  const map: Record<string, { bg:string; color:string; border:string; dot:string }> = {
    red:    { ...C.riskHigh, dot:'#ef4444' },
    yellow: { ...C.riskMid,  dot:'#f59e0b' },
    green:  { ...C.riskLow,  dot:'#10b981' },
  };
  const s = map[tier] ?? map.green;
  const label = tier === 'red' ? 'HIGH RISK' : tier === 'yellow' ? 'MEDIUM RISK' : 'STANDARD';
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:5,
      padding:'2px 8px', borderRadius:999, fontSize:10, fontWeight:700,
      background:s.bg, color:s.color, border:`1px solid ${s.border}`,
      letterSpacing:'0.05em',
    }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:s.dot, display:'inline-block' }} />
      {label}
    </span>
  );
}

function Toast({ msg, type, onClose }: { msg:string; type:'error'|'success'; onClose:()=>void }) {
  useEffect(() => { const t = setTimeout(onClose, 4500); return () => clearTimeout(t); }, [onClose]);
  const s = type === 'error' ? C.riskHigh : C.riskLow;
  const Icon = type === 'error' ? AlertCircle : CheckCircle;
  return (
    <div style={{
      position:'fixed', bottom:24, right:24, zIndex:9999,
      background:s.bg, border:`1px solid ${s.border}`, color:s.color,
      padding:'12px 16px', borderRadius:8, fontSize:13, fontWeight:500,
      display:'flex', alignItems:'center', gap:8, maxWidth:380,
      boxShadow:'0 10px 15px -3px rgba(15,23,42,0.1)',
      animation:'fadein 0.2s ease',
    }}>
      <Icon size={16} />
      <span style={{ flex:1 }}>{msg}</span>
      <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'inherit', padding:0, display:'flex' }}>
        <X size={14} />
      </button>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ onLogout }: { onLogout:()=>void }) {
  const location = useLocation();
  const navItems = [
    { to:'/',          icon:LayoutDashboard, label:'Dashboard'  },
    { to:'/documents', icon:FileText,        label:'Documents'  },
    { to:'/compare',   icon:GitCompare,      label:'Compare'    },
  ];
  return (
    <aside style={{
      width:240, minHeight:'100vh', background:C.navy,
      display:'flex', flexDirection:'column', flexShrink:0,
      borderRight:`1px solid #1e293b`,
      position:'fixed', top:0, left:0, bottom:0, zIndex:50,
    }}>
      {/* Brand */}
      <div style={{ padding:'22px 18px 18px', borderBottom:'1px solid #1e293b' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{
            width:36, height:36, background:C.indigo, borderRadius:8,
            display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
          }}>
            <Scale size={20} color="white" />
          </div>
          <div>
            <div style={{ color:'white', fontWeight:800, fontSize:16, letterSpacing:'-0.02em' }}>LexPilot</div>
            <div style={{ color:'#475569', fontSize:11, fontWeight:500 }}>Contract Intelligence</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex:1, padding:'10px 10px' }}>
        {navItems.map(({ to, icon:Icon, label }) => {
          const active = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
          return (
            <Link key={to} to={to} className="lp-nav-link" style={{
              display:'flex', alignItems:'center', gap:10,
              padding:'9px 12px', borderRadius:6, marginBottom:2,
              textDecoration:'none', fontSize:14, fontWeight:500,
              background: active ? '#1e293b' : 'transparent',
              color: active ? 'white' : '#94a3b8',
              transition:'all 0.15s',
            }}>
              <Icon size={16} />{label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding:'14px 10px', borderTop:'1px solid #1e293b' }}>
        <button onClick={onLogout} className="lp-btn-ghost" style={{
          width:'100%', display:'flex', alignItems:'center', gap:8,
          padding:'8px 12px', background:'transparent',
          border:'1px solid #334155', borderRadius:6,
          color:'#94a3b8', fontSize:13, fontWeight:500, cursor:'pointer',
          transition:'all 0.15s',
        }}>
          <LogOut size={14} />Sign Out
        </button>
        <div style={{ marginTop:12, fontSize:10, color:'#334155', textAlign:'center', letterSpacing:'0.04em' }}>
          <Shield size={9} style={{ display:'inline', marginRight:3, verticalAlign:'middle' }} />
          SOC2 TYPE II · 256-BIT TLS
        </div>
      </div>
    </aside>
  );
}

// ─── Login / Register ─────────────────────────────────────────────────────────
function Login({ setAuthToken }: { setAuthToken:(t:string)=>void }) {
  const [tab, setTab] = useState<'login'|'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{msg:string;type:'error'|'success'}|null>(null);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try {
      const res = await axios.post('/api/login', { username, password });
      setAuthToken(res.data.token);
      navigate('/');
    } catch (err: any) {
      setToast({ msg: err.response?.data?.error || 'Login failed', type:'error' });
    }
    setLoading(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try {
      await axios.post('/api/register', { username, password });
      setToast({ msg: 'Account created! Please sign in.', type:'success' });
      setTab('login');
    } catch (err: any) {
      setToast({ msg: err.response?.data?.error || 'Registration failed', type:'error' });
    }
    setLoading(false);
  };

  const inp: React.CSSProperties = {
    width:'100%', height:40, padding:'0 12px',
    border:`1px solid ${C.border}`, borderRadius:4, fontSize:14,
    background:'white', color:C.navy, fontFamily:'Inter, sans-serif',
  };

  return (
    <div style={{ display:'flex', minHeight:'100vh', fontFamily:'Inter, sans-serif' }}>
      {/* Left brand panel */}
      <div style={{
        width:'44%', background:C.navy,
        display:'flex', flexDirection:'column', justifyContent:'center',
        padding:'60px 52px', position:'relative', overflow:'hidden',
      }}>
        {/* Subtle grid */}
        <div style={{
          position:'absolute', inset:0, opacity:0.035,
          backgroundImage:'linear-gradient(#e2e8f0 1px,transparent 1px),linear-gradient(90deg,#e2e8f0 1px,transparent 1px)',
          backgroundSize:'40px 40px',
        }} />

        <div style={{ position:'relative' }}>
          {/* Logo */}
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:48 }}>
            <div style={{
              width:52, height:52, background:C.indigo, borderRadius:12,
              display:'flex', alignItems:'center', justifyContent:'center',
            }}>
              <Scale size={30} color="white" />
            </div>
            <div>
              <div style={{ color:'white', fontWeight:800, fontSize:24, letterSpacing:'-0.025em' }}>LexPilot</div>
              <div style={{ color:'#64748b', fontSize:12, fontWeight:500 }}>AI Contract Intelligence</div>
            </div>
          </div>

          <h1 style={{
            color:'white', fontSize:34, fontWeight:700,
            lineHeight:1.2, letterSpacing:'-0.025em', marginBottom:14,
          }}>Understand every<br />clause. Instantly.</h1>
          <p style={{ color:'#94a3b8', fontSize:15, lineHeight:1.65, marginBottom:40 }}>
            AI-powered contract analysis that translates complex legalese into clear, actionable insights for legal teams.
          </p>

          {[
            { icon:Sparkles,  title:'Instant risk analysis',     desc:'Real-time flagging of liabilities and deviations' },
            { icon:BookOpen,  title:'Plain English explanations', desc:'Complex legalese made simple and actionable'      },
            { icon:Shield,    title:'Secure and private',         desc:'Enterprise-grade encryption, zero-knowledge architecture' },
          ].map(({ icon:Icon, title, desc }) => (
            <div key={title} style={{ display:'flex', gap:14, marginBottom:20 }}>
              <div style={{
                width:36, height:36, background:'rgba(79,70,229,0.15)',
                borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
              }}>
                <Icon size={18} color="#818cf8" />
              </div>
              <div>
                <div style={{ color:'white', fontWeight:600, fontSize:14 }}>{title}</div>
                <div style={{ color:'#64748b', fontSize:13, marginTop:2 }}>{desc}</div>
              </div>
            </div>
          ))}

          <div style={{ display:'flex', gap:10, marginTop:40 }}>
            {['256-bit TLS','SOC2 Type II','GDPR Ready'].map(b => (
              <span key={b} style={{
                padding:'4px 10px', background:'rgba(255,255,255,0.05)',
                border:'1px solid rgba(255,255,255,0.08)',
                borderRadius:4, color:'#475569', fontSize:10, fontWeight:700, letterSpacing:'0.04em',
              }}>{b}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Right auth panel */}
      <div style={{
        flex:1, background:'#f8fafc',
        display:'flex', alignItems:'center', justifyContent:'center', padding:40,
      }}>
        <div style={{
          width:'100%', maxWidth:400, background:'white',
          borderRadius:8, border:`1px solid ${C.border}`,
          padding:'36px 32px',
          boxShadow:'0 1px 3px 0 rgba(15,23,42,0.06)',
          animation:'fadein 0.25s ease',
        }}>
          {/* Tabs */}
          <div style={{
            display:'flex', background:'#f1f5f9',
            borderRadius:6, padding:3, marginBottom:28,
          }}>
            {(['login','register'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                flex:1, padding:'8px', borderRadius:4, border:'none', cursor:'pointer',
                fontSize:13, fontWeight:600, fontFamily:'Inter, sans-serif',
                background: tab === t ? 'white' : 'transparent',
                color: tab === t ? C.navy : C.slate,
                boxShadow: tab === t ? '0 1px 3px rgba(15,23,42,0.08)' : 'none',
                transition:'all 0.15s',
              }}>
                {t === 'login' ? 'Sign In' : 'Register'}
              </button>
            ))}
          </div>

          <form onSubmit={tab === 'login' ? handleLogin : handleRegister}>
            <div style={{ marginBottom:16 }}>
              <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:5, letterSpacing:'0.01em' }}>
                Username
              </label>
              <input className="lp-input" style={inp} placeholder="Enter your username"
                value={username} onChange={e => setUsername(e.target.value)} required />
            </div>

            <div style={{ marginBottom:24 }}>
              <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#374151', marginBottom:5, letterSpacing:'0.01em' }}>
                Password
              </label>
              <div style={{ position:'relative' }}>
                <input className="lp-input" style={{ ...inp, paddingRight:40 }}
                  type={showPass ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password} onChange={e => setPassword(e.target.value)} required />
                <button type="button" onClick={() => setShowPass(v => !v)} style={{
                  position:'absolute', right:10, top:'50%', transform:'translateY(-50%)',
                  background:'none', border:'none', cursor:'pointer', color:'#94a3b8', padding:0, display:'flex',
                }}>
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="lp-btn-primary" style={{
              width:'100%', height:40,
              background: loading ? '#6366f1' : C.indigo,
              color:'white', border:'none', borderRadius:4,
              fontSize:14, fontWeight:600, cursor: loading ? 'not-allowed' : 'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              transition:'background 0.15s',
            }}>
              {loading && <Loader2 size={15} style={{ animation:'spin 1s linear infinite' }} />}
              {tab === 'login' ? 'Sign In to LexPilot' : 'Create Account'}
            </button>
          </form>

          <div style={{ marginTop:14, textAlign:'center' }}>
            <a href="#" style={{ fontSize:12, color:C.indigo, fontWeight:500 }}>Forgot password?</a>
          </div>

          <div style={{
            marginTop:24, paddingTop:18, borderTop:`1px solid ${C.borderLight}`,
            fontSize:11, color:'#94a3b8', textAlign:'center',
          }}>
            <Shield size={10} style={{ display:'inline', marginRight:4, verticalAlign:'middle' }} />
            Secure · Encrypted · Private
          </div>
        </div>
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard() {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [docs, setDocs] = useState<any[]>([]);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    axios.get('/api/documents').then(res => setDocs(res.data)).catch(console.error);
  }, []);

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { setUploadStatus('File exceeds 20MB limit.'); return; }
    setUploading(true);
    setUploadStatus('Uploading and analyzing…');
    const formData = new FormData(e.currentTarget);
    formData.append('document', file);
    try {
      const res = await axios.post('/api/documents', formData);
      navigate(`/document/${res.data.documentId}`);
    } catch (err: any) {
      setUploadStatus(err.response?.data?.error || 'Upload failed.');
      setUploading(false);
    }
  };

  const handleSelectCompare = (id: string) => {
    setSelectedForCompare(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const card: React.CSSProperties = {
    background:'white', border:`1px solid ${C.border}`,
    borderRadius:8, boxShadow:'0 1px 3px rgba(15,23,42,0.04)',
  };

  return (
    <div style={{ marginLeft:240, minHeight:'100vh', background:C.bg, fontFamily:'Inter, sans-serif' }}>
      {/* Page header */}
      <div style={{
        background:'white', borderBottom:`1px solid ${C.border}`,
        padding:'16px 28px', display:'flex', alignItems:'center', justifyContent:'space-between',
      }}>
        <div>
          <h1 style={{ margin:0, fontSize:19, fontWeight:700, color:C.navy, letterSpacing:'-0.015em' }}>Dashboard</h1>
          <p style={{ margin:0, fontSize:12, color:C.slate, marginTop:2 }}>Contract intake & analysis overview</p>
        </div>
        {selectedForCompare.length === 2 && (
          <button className="lp-btn-navy" onClick={() => navigate(`/compare/${selectedForCompare[0]}/${selectedForCompare[1]}`)} style={{
            display:'flex', alignItems:'center', gap:8,
            padding:'8px 16px', background:C.navy, color:'white',
            border:'none', borderRadius:4, fontSize:13, fontWeight:600, cursor:'pointer',
            transition:'background 0.15s',
          }}>
            <GitCompare size={14} />Compare Selected (2)
          </button>
        )}
      </div>

      <div style={{ padding:'24px 28px' }}>
        {/* Upload card */}
        <div style={{ ...card, marginBottom:20 }}>
          <div style={{ padding:'18px 22px', borderBottom:`1px solid ${C.borderLight}` }}>
            <h2 style={{ margin:0, fontSize:14, fontWeight:700, color:C.navy, display:'flex', alignItems:'center', gap:8 }}>
              <Upload size={14} color={C.indigo} />Contract Ingestion
            </h2>
            <p style={{ margin:'3px 0 0', fontSize:12, color:C.slate }}>Upload a PDF or DOCX for AI-powered clause analysis</p>
          </div>

          <form onSubmit={handleUpload} style={{ padding:'20px 22px' }}>
            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => {
                e.preventDefault(); setDragOver(false);
                const f = e.dataTransfer.files[0];
                if (f) { setFile(f); setUploadStatus(''); }
              }}
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? C.indigo : file ? C.emerald : '#cbd5e1'}`,
                borderRadius:8, padding:'28px 20px', textAlign:'center', cursor:'pointer',
                background: dragOver ? '#f0f0ff' : file ? '#ecfdf5' : C.bg,
                transition:'all 0.15s', marginBottom:16,
              }}
            >
              <input ref={fileRef} type="file" accept=".pdf,.docx"
                style={{ display:'none' }}
                onChange={e => { setFile(e.target.files?.[0] || null); setUploadStatus(''); }} />
              {file ? (
                <>
                  <CheckCircle size={28} color={C.emerald} style={{ marginBottom:6 }} />
                  <div style={{ fontWeight:600, color:'#065f46', fontSize:14 }}>{file.name}</div>
                  <div style={{ color:'#6b7280', fontSize:12, marginTop:3 }}>
                    {(file.size / 1024 / 1024).toFixed(2)} MB · Click to change
                  </div>
                </>
              ) : (
                <>
                  <Upload size={28} color="#94a3b8" style={{ marginBottom:6 }} />
                  <div style={{ fontWeight:600, color:'#374151', fontSize:14 }}>Drop PDF or DOCX here</div>
                  <div style={{ color:'#94a3b8', fontSize:12, marginTop:3 }}>or click to browse · max 20 MB</div>
                </>
              )}
            </div>

            {/* Config row */}
            <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
              <select name="jurisdiction" className="lp-input" style={{
                height:36, padding:'0 10px', border:`1px solid ${C.border}`,
                borderRadius:4, fontSize:13, background:'white', color:'#374151',
                fontFamily:'Inter, sans-serif', flex:1, minWidth:140,
              }}>
                <option value="Global/Agnostic">🌐 Global / Agnostic</option>
                <option value="US">🇺🇸 United States</option>
                <option value="UK">🇬🇧 United Kingdom</option>
                <option value="India">🇮🇳 India</option>
              </select>
              <select name="language" className="lp-input" style={{
                height:36, padding:'0 10px', border:`1px solid ${C.border}`,
                borderRadius:4, fontSize:13, background:'white', color:'#374151',
                fontFamily:'Inter, sans-serif', flex:1, minWidth:120,
              }}>
                <option value="English">English</option>
                <option value="Spanish">Español</option>
                <option value="French">Français</option>
                <option value="Hindi">हिन्दी</option>
              </select>
              <button type="submit" disabled={!file || uploading} className="lp-btn-primary" style={{
                height:36, padding:'0 18px', flexShrink:0,
                background: !file || uploading ? '#94a3b8' : C.indigo,
                color:'white', border:'none', borderRadius:4,
                fontSize:13, fontWeight:600, cursor: !file || uploading ? 'not-allowed' : 'pointer',
                display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap',
                transition:'background 0.15s',
              }}>
                {uploading
                  ? <><Loader2 size={13} style={{ animation:'spin 1s linear infinite' }} />Analyzing…</>
                  : <><Sparkles size={13} />Analyze Contract</>}
              </button>
            </div>

            {uploadStatus && (
              <div style={{
                marginTop:12, padding:'8px 12px',
                background:C.riskHigh.bg, border:`1px solid ${C.riskHigh.border}`,
                borderRadius:4, color:C.riskHigh.color,
                fontSize:13, display:'flex', alignItems:'center', gap:6,
              }}>
                <AlertCircle size={14} />{uploadStatus}
              </div>
            )}
          </form>
        </div>

        {/* Documents table */}
        <div style={card}>
          <div style={{
            padding:'14px 22px', borderBottom:`1px solid ${C.borderLight}`,
            display:'flex', alignItems:'center', justifyContent:'space-between',
          }}>
            <h2 style={{ margin:0, fontSize:14, fontWeight:700, color:C.navy, display:'flex', alignItems:'center', gap:8 }}>
              <FileText size={14} color={C.indigo} />
              Your Documents
              <span style={{
                marginLeft:4, fontSize:11, fontWeight:700, padding:'1px 7px',
                background:'#f1f5f9', borderRadius:999, color:'#475569',
              }}>{docs.length}</span>
            </h2>
            {selectedForCompare.length > 0 && (
              <span style={{ fontSize:12, color:C.indigo, fontWeight:600 }}>
                {selectedForCompare.length}/2 selected
              </span>
            )}
          </div>

          {docs.length === 0 ? (
            <div style={{ padding:'52px 20px', textAlign:'center' }}>
              <FileSearch size={36} color="#cbd5e1" style={{ marginBottom:12 }} />
              <div style={{ fontWeight:600, color:C.slate, fontSize:14 }}>No documents yet</div>
              <div style={{ color:C.textDim, fontSize:13, marginTop:4 }}>Upload your first contract to begin AI analysis</div>
            </div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:C.bg }}>
                  {['Document','Status','Date','Actions','Compare'].map(h => (
                    <th key={h} style={{
                      padding:'10px 16px', textAlign:'left', fontSize:10,
                      fontWeight:700, color:C.slate, letterSpacing:'0.06em',
                      textTransform:'uppercase', borderBottom:`1px solid ${C.border}`,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {docs.map((doc, i) => (
                  <tr key={doc._id} className="lp-doc-row" style={{
                    borderBottom: i < docs.length - 1 ? `1px solid ${C.borderLight}` : 'none',
                    transition:'background 0.1s',
                  }}>
                    <td style={{ padding:'12px 16px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div style={{
                          width:32, height:32, background:'#f1f5f9', borderRadius:6,
                          display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
                        }}>
                          <FileText size={15} color={C.slate} />
                        </div>
                        <div>
                          <Link to={`/document/${doc._id}`} style={{
                            color:C.navy, fontWeight:600, fontSize:13,
                            textDecoration:'none', display:'block',
                          }}>{doc.filename}</Link>
                          {doc.jurisdiction && (
                            <div style={{ fontSize:11, color:'#94a3b8', marginTop:1 }}>{doc.jurisdiction}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding:'12px 16px' }}><StatusBadge status={doc.status} /></td>
                    <td style={{ padding:'12px 16px', fontSize:12, color:C.slate }}>
                      {new Date(doc.uploadDate).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}
                    </td>
                    <td style={{ padding:'12px 16px' }}>
                      <Link to={`/document/${doc._id}`} style={{
                        padding:'5px 12px', background:C.navy, color:'white',
                        textDecoration:'none', borderRadius:4, fontSize:12, fontWeight:600,
                        display:'inline-block',
                      }}>View</Link>
                    </td>
                    <td style={{ padding:'12px 16px' }}>
                      <input type="checkbox"
                        checked={selectedForCompare.includes(doc._id)}
                        onChange={() => handleSelectCompare(doc._id)}
                        style={{ width:16, height:16, accentColor:C.indigo, cursor:'pointer' }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Chat Panel ───────────────────────────────────────────────────────────────
function ChatPanel({ docId }: { docId: string }) {
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }); }, [history, loading]);

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    setLoading(true); setQuestion('');
    try {
      const res = await axios.post(`/api/documents/${docId}/ask`, { question: q });
      setHistory(prev => [...prev, { q, a: res.data.answer, citations: res.data.citations }]);
    } catch (err: any) {
      setHistory(prev => [...prev, { q, a: 'Error: ' + (err.response?.data?.error || 'Failed to get answer') }]);
    }
    setLoading(false);
  };

  return (
    <div style={{
      width:'37%', minWidth:300, display:'flex', flexDirection:'column',
      background:'white', border:`1px solid ${C.border}`, borderRadius:8,
      boxShadow:'0 1px 3px rgba(15,23,42,0.04)',
      height:'calc(100vh - 130px)', position:'sticky', top:80, overflow:'hidden',
    }}>
      {/* Chat header */}
      <div style={{
        padding:'12px 16px', background:C.navy,
        display:'flex', alignItems:'center', gap:10,
      }}>
        <div style={{
          width:30, height:30, background:C.indigo, borderRadius:6,
          display:'flex', alignItems:'center', justifyContent:'center',
        }}>
          <Sparkles size={15} color="white" />
        </div>
        <div>
          <div style={{ color:'white', fontWeight:700, fontSize:13 }}>Ask LexPilot</div>
          <div style={{ color:'#64748b', fontSize:11 }}>AI Q&A about this contract</div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex:1, overflowY:'auto', padding:'14px 14px', display:'flex', flexDirection:'column', gap:10 }}>
        {history.length === 0 && !loading && (
          <div style={{ textAlign:'center', color:'#94a3b8', fontSize:13, marginTop:24, animation:'fadein 0.3s ease' }}>
            <BookOpen size={26} style={{ marginBottom:8, opacity:0.35 }} />
            <div style={{ fontWeight:500 }}>Ask anything about this contract</div>
            <div style={{ fontSize:12, marginTop:4 }}>e.g. "What are the termination clauses?"</div>
          </div>
        )}
        {history.map((h, i) => (
          <div key={i} style={{ animation:'fadein 0.2s ease' }}>
            <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:6 }}>
              <div style={{
                maxWidth:'80%', background:C.navy, color:'white',
                padding:'8px 12px', borderRadius:'8px 8px 2px 8px',
                fontSize:13, lineHeight:1.55,
              }}>{h.q}</div>
            </div>
            <div style={{ display:'flex', justifyContent:'flex-start' }}>
              <div style={{
                maxWidth:'88%', background:C.bg, border:`1px solid ${C.border}`,
                color:C.navy, padding:'8px 12px', borderRadius:'2px 8px 8px 8px',
                fontSize:13, lineHeight:1.65,
              }}>
                {h.a}
                {h.citations?.length > 0 && (
                  <div style={{ marginTop:7, display:'flex', flexWrap:'wrap', gap:4 }}>
                    {h.citations.map((c: string) => (
                      <span key={c} style={{
                        fontSize:10, fontWeight:700, padding:'2px 7px',
                        background:'#e0e7ff', color:C.indigo,
                        borderRadius:999,
                      }}>§ {c.slice(-4)}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display:'flex', justifyContent:'flex-start' }}>
            <div style={{
              background:C.bg, border:`1px solid ${C.border}`,
              padding:'10px 14px', borderRadius:'2px 8px 8px 8px',
              display:'flex', gap:5, alignItems:'center',
            }}>
              {[0,1,2].map(i => (
                <div key={i} style={{
                  width:6, height:6, borderRadius:'50%', background:'#94a3b8',
                  animation:`pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleAsk} style={{
        padding:'10px 12px', borderTop:`1px solid ${C.borderLight}`,
        display:'flex', gap:8,
      }}>
        <input className="lp-input" value={question} onChange={e => setQuestion(e.target.value)}
          placeholder="Ask about this contract…" style={{
            flex:1, height:36, padding:'0 10px',
            border:`1px solid ${C.border}`, borderRadius:4,
            fontSize:13, fontFamily:'Inter, sans-serif',
          }} />
        <button type="submit" disabled={loading || !question.trim()} style={{
          width:36, height:36, background:C.indigo, border:'none',
          borderRadius:4, cursor: loading ? 'not-allowed' : 'pointer',
          display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
          opacity: loading || !question.trim() ? 0.6 : 1,
        }}>
          {loading
            ? <Loader2 size={14} color="white" style={{ animation:'spin 1s linear infinite' }} />
            : <Send size={14} color="white" />}
        </button>
      </form>
    </div>
  );
}

// ─── Document View ────────────────────────────────────────────────────────────
function DocumentView() {
  const { id } = useParams();
  const [doc, setDoc] = useState<any>(null);
  const [clauses, setClauses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [checklist, setChecklist] = useState<any>(null);
  const [loadingChecklist, setLoadingChecklist] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let timer: ReturnType<typeof setTimeout>;
    const fetch = async () => {
      try {
        const res = await axios.get(`/api/documents/${id}`);
        if (!isMounted) return;
        setDoc(res.data.document);
        setClauses(res.data.clauses);
        setLoading(false);
        if (res.data.document.status === 'pending') timer = setTimeout(fetch, 3000);
      } catch (err) {
        console.error(err);
        if (isMounted) setLoading(false);
      }
    };
    fetch();
    return () => { isMounted = false; if (timer) clearTimeout(timer); };
  }, [id]);

  const generateChecklist = async () => {
    setLoadingChecklist(true);
    try {
      const res = await axios.post(`/api/documents/${id}/checklist`);
      setChecklist(res.data);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to generate checklist');
    }
    setLoadingChecklist(false);
  };

  if (loading) return (
    <div style={{ marginLeft:240, display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', fontFamily:'Inter, sans-serif' }}>
      <div style={{ textAlign:'center' }}>
        <Loader2 size={32} color={C.indigo} style={{ animation:'spin 1s linear infinite', marginBottom:12 }} />
        <div style={{ color:C.slate, fontSize:14 }}>Loading document analysis…</div>
      </div>
    </div>
  );

  if (!doc) return (
    <div style={{ marginLeft:240, padding:32, fontFamily:'Inter, sans-serif' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'14px 18px', background:C.riskHigh.bg, border:`1px solid ${C.riskHigh.border}`, borderRadius:8, color:C.riskHigh.color, fontSize:14 }}>
        <AlertTriangle size={18} />Document not found.
      </div>
    </div>
  );

  const keyDates = clauses.flatMap(c => c.keyDates || []).filter(Boolean);
  const riskCount = {
    red:    clauses.filter(c => c.riskTier === 'red').length,
    yellow: clauses.filter(c => c.riskTier === 'yellow').length,
    green:  clauses.filter(c => c.riskTier === 'green').length,
  };

  return (
    <div style={{ marginLeft:240, minHeight:'100vh', background:C.bg, fontFamily:'Inter, sans-serif' }}>
      {/* Header */}
      <div style={{
        background:'white', borderBottom:`1px solid ${C.border}`,
        padding:'12px 24px', display:'flex', alignItems:'center',
        justifyContent:'space-between', gap:12, flexWrap:'wrap',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <Link to="/" style={{ display:'flex', alignItems:'center', gap:5, color:C.slate, fontSize:13, fontWeight:500 }}>
            <ChevronLeft size={15} />Dashboard
          </Link>
          <span style={{ color:C.border }}>|</span>
          <FileText size={15} color={C.indigo} />
          <span style={{
            fontWeight:700, fontSize:14, color:C.navy,
            maxWidth:320, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
          }}>{doc.filename}</span>
          <StatusBadge status={doc.status} />
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {/* Risk summary pills */}
          <div style={{ display:'flex', gap:5 }}>
            {riskCount.red > 0 && <span style={{ fontSize:11, fontWeight:700, padding:'3px 8px', background:C.riskHigh.bg, color:C.riskHigh.color, border:`1px solid ${C.riskHigh.border}`, borderRadius:999 }}>{riskCount.red} High</span>}
            {riskCount.yellow > 0 && <span style={{ fontSize:11, fontWeight:700, padding:'3px 8px', background:C.riskMid.bg, color:C.riskMid.color, border:`1px solid ${C.riskMid.border}`, borderRadius:999 }}>{riskCount.yellow} Medium</span>}
            {riskCount.green > 0 && <span style={{ fontSize:11, fontWeight:700, padding:'3px 8px', background:C.riskLow.bg, color:C.riskLow.color, border:`1px solid ${C.riskLow.border}`, borderRadius:999 }}>{riskCount.green} Standard</span>}
          </div>
          <button onClick={generateChecklist}
            disabled={loadingChecklist || doc.status === 'pending'}
            className="lp-btn-primary"
            style={{
              display:'flex', alignItems:'center', gap:6,
              padding:'7px 14px', background:C.indigo, color:'white',
              border:'none', borderRadius:4, fontSize:12, fontWeight:600,
              cursor: loadingChecklist || doc.status === 'pending' ? 'not-allowed' : 'pointer',
              opacity: doc.status === 'pending' ? 0.55 : 1,
              transition:'background 0.15s',
            }}>
            {loadingChecklist
              ? <Loader2 size={12} style={{ animation:'spin 1s linear infinite' }} />
              : <BookOpen size={12} />}
            {loadingChecklist ? 'Generating…' : 'Lawyer Checklist'}
          </button>
        </div>
      </div>

      {/* Key Dates banner */}
      {keyDates.length > 0 && (
        <div style={{
          background:'#eff6ff', borderBottom:'1px solid #bfdbfe',
          padding:'10px 24px', display:'flex', alignItems:'flex-start', gap:10,
        }}>
          <Calendar size={15} color="#3b82f6" style={{ flexShrink:0, marginTop:1 }} />
          <div>
            <span style={{ fontWeight:700, fontSize:11, color:'#1d4ed8', textTransform:'uppercase', letterSpacing:'0.06em' }}>
              Key Dates & Deadlines
            </span>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'4px 16px', marginTop:4 }}>
              {keyDates.map((d: string, i: number) => (
                <span key={i} style={{ fontSize:13, color:'#1e3a8a' }}>• {d}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Pending notice */}
      {doc.status === 'pending' && (
        <div style={{
          margin:'18px 24px 0', padding:'11px 16px',
          background:C.riskMid.bg, border:`1px solid ${C.riskMid.border}`,
          borderRadius:6, display:'flex', alignItems:'center', gap:10, fontSize:13,
        }}>
          <Loader2 size={15} color="#d97706" style={{ animation:'spin 1s linear infinite', flexShrink:0 }} />
          <span style={{ color:C.riskMid.color, fontWeight:500 }}>Processing with AI… This may take a minute.</span>
        </div>
      )}

      <div style={{ padding:'18px 24px', display:'flex', gap:18, alignItems:'flex-start' }}>
        {/* Clauses */}
        <div style={{ flex:1, minWidth:0 }}>
          {/* Checklist panel */}
          {checklist && (
            <div style={{
              background:'#fffbeb', border:`1px solid ${C.riskMid.border}`,
              borderRadius:8, padding:'16px 20px', marginBottom:16,
              animation:'fadein 0.25s ease',
            }}>
              <h3 style={{ margin:'0 0 8px', fontSize:13, fontWeight:700, color:C.riskMid.color, display:'flex', alignItems:'center', gap:7 }}>
                <BookOpen size={14} />Questions for Your Lawyer
              </h3>
              <p style={{ margin:'0 0 12px', fontSize:13, color:'#78350f' }}>{checklist.summary}</p>
              <ul style={{ margin:0, paddingLeft:18 }}>
                {checklist.items.map((item: any, i: number) => (
                  <li key={i} style={{ marginBottom:6, fontSize:13, color:'#451a03', lineHeight:1.6 }}>
                    {item.action_item}
                    <a href={`#clause-${item.cited_clause_id}`}
                      style={{ marginLeft:7, fontSize:11, color:C.indigo, fontWeight:700 }}>
                      [Source]
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Clause cards */}
          {clauses.map((c, i) => {
            const rc = { red:C.riskHigh, yellow:C.riskMid, green:C.riskLow }[c.riskTier as string] || C.riskLow;
            const expanded = expandedId === c._id;
            return (
              <div key={i} id={`clause-${c._id}`} className="lp-clause-card" style={{
                background:'white', border:`1px solid ${C.border}`,
                borderLeft:`4px solid ${rc.border}`,
                borderRadius:8, marginBottom:10,
                boxShadow:'0 1px 3px rgba(15,23,42,0.03)',
                transition:'border-color 0.15s',
                animation:'fadein 0.2s ease',
              }}>
                {/* Clause header — click to expand */}
                <div
                  onClick={() => setExpandedId(expanded ? null : c._id)}
                  style={{
                    padding:'11px 16px', cursor:'pointer',
                    display:'flex', alignItems:'center', justifyContent:'space-between', gap:12,
                    background: expanded ? C.bg : 'white', borderRadius: expanded ? '8px 8px 0 0' : 8,
                    transition:'background 0.1s',
                  }}
                >
                  <div style={{ display:'flex', alignItems:'center', gap:9, flex:1, minWidth:0 }}>
                    <span style={{
                      fontSize:10, fontWeight:700, padding:'2px 7px',
                      background:'#f1f5f9', color:'#475569', borderRadius:4,
                      textTransform:'capitalize', letterSpacing:'0.03em', whiteSpace:'nowrap', flexShrink:0,
                    }}>{c.clauseType || `Clause ${i + 1}`}</span>
                    <span style={{
                      fontSize:13, color:'#374151', overflow:'hidden',
                      textOverflow:'ellipsis', whiteSpace:'nowrap',
                    }}>{c.simpleExplanation || c.originalText?.slice(0, 90)}</span>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                    <RiskBadge tier={c.riskTier} />
                    <span style={{ fontSize:16, color:'#94a3b8', transition:'transform 0.2s', display:'inline-block', transform: expanded ? 'rotate(180deg)' : 'none' }}>⌄</span>
                  </div>
                </div>

                {/* Expanded detail */}
                {expanded && (
                  <div style={{ borderTop:`1px solid ${C.borderLight}` }}>
                    <div style={{ display:'flex' }}>
                      {/* Original */}
                      <div style={{ flex:1, padding:'14px 16px', background:C.bg, borderRight:`1px solid ${C.borderLight}` }}>
                        <div style={{ fontSize:10, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Original Text</div>
                        <p style={{ margin:0, fontSize:12, lineHeight:1.75, color:'#374151', fontFamily:'monospace' }}>{c.originalText}</p>
                      </div>
                      {/* Analysis */}
                      <div style={{ flex:1, padding:'14px 16px' }}>
                        <div style={{ fontSize:10, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Plain English</div>
                        <p style={{ margin:'0 0 12px', fontSize:13, lineHeight:1.65, color:C.navy }}>{c.simpleExplanation}</p>

                        {c.riskTier && (
                          <div style={{ padding:'10px 12px', background:rc.bg, border:`1px solid ${rc.border}`, borderRadius:6, marginBottom:10 }}>
                            <div style={{ fontSize:11, fontWeight:700, color:rc.color, marginBottom:3 }}>
                              {c.riskTier === 'red' ? '⚠ HIGH RISK' : c.riskTier === 'yellow' ? '● MEDIUM RISK' : '✓ STANDARD'}
                            </div>
                            {c.riskReasoning && <p style={{ margin:0, fontSize:12, color:rc.color, opacity:0.85, lineHeight:1.55 }}>{c.riskReasoning}</p>}
                          </div>
                        )}

                        {c.marketBenchmark && (
                          <div style={{ paddingLeft:10, borderLeft:'3px solid #cbd5e1', marginBottom:10 }}>
                            <div style={{ fontSize:10, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:3 }}>Market Benchmark</div>
                            <p style={{ margin:0, fontSize:12, color:'#475569', lineHeight:1.55 }}>{c.marketBenchmark}</p>
                          </div>
                        )}

                        {c.glossary && Object.keys(c.glossary).length > 0 && (
                          <div style={{ background:C.bg, borderRadius:4, padding:'8px 10px' }}>
                            <div style={{ fontSize:10, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:5 }}>Glossary</div>
                            {Object.entries(c.glossary).map(([term, def]: any) => (
                              <div key={term} style={{ fontSize:12, marginBottom:3, lineHeight:1.5 }}>
                                <span style={{ color:C.indigo, fontWeight:700 }}>{term}</span>
                                <span style={{ color:C.slate }}>: {def}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {clauses.length === 0 && doc.status === 'processed' && (
            <div style={{
              textAlign:'center', padding:40, background:'white',
              borderRadius:8, border:`1px solid ${C.border}`, color:C.slate,
            }}>
              No clauses were extracted from this document.
            </div>
          )}
        </div>

        {/* Chat panel */}
        <ChatPanel docId={doc._id} />
      </div>
    </div>
  );
}

// ─── Compare View ─────────────────────────────────────────────────────────────
function CompareView() {
  const { id1, id2 } = useParams();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get(`/api/documents/${id1}/compare/${id2}`)
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.data?.error || 'Comparison failed'));
  }, [id1, id2]);

  if (error) return (
    <div style={{ marginLeft:240, padding:28, fontFamily:'Inter, sans-serif' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'14px 18px', background:C.riskHigh.bg, border:`1px solid ${C.riskHigh.border}`, borderRadius:8, color:C.riskHigh.color, fontSize:14 }}>
        <AlertCircle size={18} />{error}
      </div>
    </div>
  );

  if (!data) return (
    <div style={{ marginLeft:240, display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', fontFamily:'Inter, sans-serif' }}>
      <div style={{ textAlign:'center' }}>
        <Loader2 size={30} color={C.indigo} style={{ animation:'spin 1s linear infinite', marginBottom:12 }} />
        <div style={{ color:C.slate, fontSize:14 }}>Loading comparison…</div>
      </div>
    </div>
  );

  return (
    <div style={{ marginLeft:240, minHeight:'100vh', background:C.bg, fontFamily:'Inter, sans-serif' }}>
      {/* Header */}
      <div style={{
        background:'white', borderBottom:`1px solid ${C.border}`,
        padding:'12px 24px', display:'flex', alignItems:'center', gap:10,
      }}>
        <Link to="/" style={{ display:'flex', alignItems:'center', gap:5, color:C.slate, fontSize:13, fontWeight:500 }}>
          <ChevronLeft size={15} />Dashboard
        </Link>
        <span style={{ color:C.border }}>|</span>
        <GitCompare size={15} color={C.indigo} />
        <span style={{ fontWeight:700, fontSize:14, color:C.navy }}>Document Comparison</span>
      </div>

      {/* Column headers */}
      <div style={{ display:'flex', gap:8, padding:'20px 24px 4px' }}>
        {[data.doc1, data.doc2].map((doc: any, i: number) => (
          <div key={i} style={{
            flex:1, padding:'10px 16px', background:C.navy,
            borderRadius:'8px 8px 0 0',
            display:'flex', alignItems:'center', gap:8,
          }}>
            <FileText size={13} color="#94a3b8" />
            <span style={{
              color:'white', fontWeight:700, fontSize:13,
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1,
            }}>{doc.filename}</span>
            <span style={{
              fontSize:10, fontWeight:700, padding:'2px 7px',
              background: i === 0 ? C.indigo : C.emerald,
              color:'white', borderRadius:999, flexShrink:0,
            }}>{i === 0 ? 'Doc A' : 'Doc B'}</span>
          </div>
        ))}
      </div>

      {/* Comparison rows */}
      <div style={{ padding:'0 24px 28px' }}>
        {data.comparison.map((comp: any, i: number) => (
          <div key={i} style={{ marginBottom:8 }}>
            <div style={{
              padding:'6px 14px', background:'#e2e8f0',
              fontSize:10, fontWeight:700, color:'#475569',
              letterSpacing:'0.06em', textTransform:'uppercase',
            }}>{comp.clauseType || 'General'}</div>
            <div style={{ display:'flex', gap:0, background:'white', border:`1px solid ${C.border}`, borderTop:'none', borderRadius:'0 0 6px 6px' }}>
              {[comp.doc1Clauses, comp.doc2Clauses].map((clauses: any[], ci: number) => (
                <div key={ci} style={{
                  flex:1, padding:'14px 16px',
                  borderRight: ci === 0 ? `1px solid ${C.borderLight}` : 'none',
                }}>
                  {clauses.length > 0
                    ? clauses.map((c: any) => (
                      <p key={c._id} style={{ margin:0, fontSize:13, lineHeight:1.7, color:'#374151' }}>{c.originalText}</p>
                    ))
                    : (
                      <div style={{
                        height:56, display:'flex', alignItems:'center', justifyContent:'center',
                        color:'#94a3b8', fontSize:13, fontStyle:'italic',
                      }}>Not present in this document</div>
                    )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── App Shell ────────────────────────────────────────────────────────────────
function AppShell({ setToken }: { setToken:(t:string|null)=>void }) {
  return (
    <div style={{ display:'flex' }}>
      <Sidebar onLogout={() => setToken(null)} />
      <div style={{ flex:1 }}>
        <Routes>
          <Route path="/"                    element={<Dashboard />}    />
          <Route path="/documents"           element={<Dashboard />}    />
          <Route path="/document/:id"        element={<DocumentView />} />
          <Route path="/compare/:id1/:id2"   element={<CompareView />}  />
        </Routes>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      localStorage.setItem('token', token);
    } else {
      delete axios.defaults.headers.common['Authorization'];
      localStorage.removeItem('token');
    }
  }, [token]);

  return (
    <BrowserRouter>
      <StyleInjector />
      {!token
        ? <Login setAuthToken={setToken} />
        : <AppShell setToken={setToken} />}
    </BrowserRouter>
  );
}

export default App;
