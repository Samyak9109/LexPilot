import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useParams, Link } from 'react-router-dom';
import axios from 'axios';

// --- Axios Config ---
axios.defaults.baseURL = 'http://localhost:3000';

function Login({ setAuthToken }: { setAuthToken: (token: string) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await axios.post('/api/login', { username, password });
      setAuthToken(res.data.token);
      navigate('/');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Login failed');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post('/api/register', { username, password });
      alert('Registered! You can now log in.');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Registration failed');
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h2>Login / Register</h2>
      <form onSubmit={handleLogin}>
        <input placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} required />
        <br/><br/>
        <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
        <br/><br/>
        <button type="submit">Login</button>
        <button type="button" onClick={handleRegister} style={{ marginLeft: '1rem' }}>Register</button>
      </form>
    </div>
  );
}

function Dashboard() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState('');
  const navigate = useNavigate();

  const handleUpload = async () => {
    if (!file) return;
    setStatus('Uploading...');
    
    if (file.size > 20 * 1024 * 1024) {
      setStatus('File exceeds 20MB limit.');
      return;
    }
    
    const formData = new FormData();
    formData.append('document', file);
    
    try {
      const res = await axios.post('/api/documents', formData);
      navigate(`/document/${res.data.documentId}`);
    } catch (e: any) {
      setStatus(e.response?.data?.error || 'Upload failed.');
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h1>LexPilot Dashboard</h1>
      <p>Upload a contract (PDF/DOCX) for analysis.</p>
      
      <div style={{ border: '1px solid #ccc', padding: '1rem', marginTop: '1rem' }}>
        <input type="file" accept=".pdf,.docx" onChange={e => setFile(e.target.files?.[0] || null)} />
        <button onClick={handleUpload} disabled={!file} style={{ marginLeft: '1rem' }}>Analyze Document</button>
        <p style={{ color: 'red' }}>{status}</p>
      </div>
    </div>
  );
}

function ChatPanel({ docId }: { docId: string }) {
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question) return;
    setLoading(true);
    try {
      const res = await axios.post(`/api/documents/${docId}/ask`, { question });
      setHistory(prev => [...prev, { q: question, a: res.data.answer, citations: res.data.citations }]);
      setQuestion('');
    } catch (err: any) {
      setHistory(prev => [...prev, { q: question, a: 'Error: ' + (err.response?.data?.error || 'Failed to get answer') }]);
    }
    setLoading(false);
  };

  return (
    <div style={{ flex: 1, padding: '1rem', borderLeft: '1px solid #ccc', maxHeight: '80vh', overflowY: 'auto' }}>
      <h3>Document Q&A</h3>
      <div style={{ marginBottom: '1rem' }}>
        {history.map((h, i) => (
          <div key={i} style={{ marginBottom: '1rem' }}>
            <p><strong>You:</strong> {h.q}</p>
            <p><strong>LexPilot:</strong> {h.a}</p>
            {h.citations?.length > 0 && (
              <div style={{ fontSize: '0.8rem', color: '#666' }}>
                Citations: {h.citations.map((c: string) => <span key={c} style={{ border: '1px solid #ccc', borderRadius: '4px', padding: '2px 4px', marginRight: '4px' }}>Clause {c}</span>)}
              </div>
            )}
          </div>
        ))}
        {loading && <p><em>Thinking...</em></p>}
      </div>
      <form onSubmit={handleAsk} style={{ display: 'flex', gap: '0.5rem' }}>
        <input type="text" value={question} onChange={e => setQuestion(e.target.value)} placeholder="Ask about this document..." style={{ flex: 1 }} />
        <button type="submit" disabled={loading}>Ask</button>
      </form>
    </div>
  );
}

function DocumentView() {
  const { id } = useParams();
  const [doc, setDoc] = useState<any>(null);
  const [clauses, setClauses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let interval = setInterval(() => {
      axios.get(`/api/documents/${id}`).then(res => {
        setDoc(res.data.document);
        setClauses(res.data.clauses);
        setLoading(false);
        if (res.data.document.status !== 'pending') clearInterval(interval);
      }).catch(err => {
        console.error(err);
        setLoading(false);
        clearInterval(interval);
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [id]);

  if (loading) return <div style={{ padding: '2rem' }}>Loading document status...</div>;
  if (!doc) return <div style={{ padding: '2rem' }}>Document not found.</div>;

  return (
    <div style={{ padding: '2rem' }}>
      <Link to="/">← Back to Dashboard</Link>
      <h2>{doc.filename} (Status: {doc.status})</h2>
      
      {doc.status === 'pending' && <p>Processing document, please wait...</p>}
      
      <div style={{ display: 'flex', gap: '2rem' }}>
        <div style={{ flex: 2, maxHeight: '80vh', overflowY: 'auto', paddingRight: '1rem' }}>
          {clauses.map((c, i) => {
            const riskColor = c.riskTier === 'red' ? '#ffebee' : c.riskTier === 'yellow' ? '#fff3e0' : '#e8f5e9';
            const riskLabel = c.riskTier === 'red' ? '🔴 HIGH RISK' : c.riskTier === 'yellow' ? '🟡 MEDIUM RISK' : '🟢 STANDARD';
            return (
              <div key={i} id={`clause-${c._id}`} style={{ border: '1px solid #eee', padding: '1rem', marginBottom: '1rem', display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <strong>Original Clause: {c.clauseType}</strong>
                  <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '0.5rem' }}>ID: {c._id}</div>
                  <p style={{ fontFamily: 'monospace', backgroundColor: '#f9f9f9', padding: '0.5rem' }}>{c.originalText}</p>
                </div>
                <div style={{ flex: 1, backgroundColor: '#f0f8ff', padding: '0.5rem' }}>
                  <strong>Plain English</strong>
                  <p>{c.simpleExplanation || 'No explanation available.'}</p>
                  {c.riskTier && (
                    <div style={{ marginTop: '1rem', backgroundColor: riskColor, border: '1px solid #ddd', padding: '0.5rem', borderRadius: '4px' }}>
                      <strong>{riskLabel}</strong>
                      <p style={{ margin: '0.5rem 0 0 0' }}>{c.riskReasoning}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Chat Panel */}
        <ChatPanel docId={doc._id} />
      </div>
    </div>
  );
}

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

  if (!token) return <BrowserRouter><Login setAuthToken={setToken} /></BrowserRouter>;

  return (
    <BrowserRouter>
      <div style={{ padding: '1rem', borderBottom: '1px solid #ccc' }}>
        <button onClick={() => setToken(null)}>Logout</button>
      </div>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/document/:id" element={<DocumentView />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
