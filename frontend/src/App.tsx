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
  const [docs, setDocs] = useState<any[]>([]);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    axios.get('/api/documents').then(res => setDocs(res.data)).catch(console.error);
  }, []);

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

  const handleSelectCompare = (id: string) => {
    setSelectedForCompare(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h1>LexPilot Dashboard</h1>
      <p>Upload a contract (PDF/DOCX) for analysis.</p>
      
      <div style={{ border: '1px solid #ccc', padding: '1rem', marginTop: '1rem', borderRadius: '4px' }}>
        <input type="file" accept=".pdf,.docx" onChange={e => setFile(e.target.files?.[0] || null)} aria-label="Upload document" />
        <button onClick={handleUpload} disabled={!file} style={{ marginLeft: '1rem' }}>Analyze Document</button>
        <p style={{ color: 'red' }}>{status}</p>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <h2>Your Documents</h2>
        {selectedForCompare.length === 2 && (
          <button onClick={() => navigate(`/compare/${selectedForCompare[0]}/${selectedForCompare[1]}`)} style={{ marginBottom: '1rem', backgroundColor: '#4caf50', color: 'white', padding: '0.5rem 1rem', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Compare Selected ({selectedForCompare.length}/2)
          </button>
        )}
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {docs.map(doc => (
            <li key={doc._id} style={{ padding: '1rem', border: '1px solid #eee', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <Link to={`/document/${doc._id}`} style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{doc.filename}</Link>
                <span style={{ marginLeft: '1rem', color: '#666' }}>Status: {doc.status}</span>
              </div>
              <label>
                <input type="checkbox" checked={selectedForCompare.includes(doc._id)} onChange={() => handleSelectCompare(doc._id)} /> Compare
              </label>
            </li>
          ))}
        </ul>
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
  const [checklist, setChecklist] = useState<any>(null);
  const [loadingChecklist, setLoadingChecklist] = useState(false);

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

  const generateChecklist = async () => {
    setLoadingChecklist(true);
    try {
      const res = await axios.post(`/api/documents/${id}/checklist`);
      setChecklist(res.data);
    } catch (err: any) {
      alert('Failed to generate checklist');
    }
    setLoadingChecklist(false);
  };

  if (loading) return <div style={{ padding: '2rem' }}>Loading document status...</div>;
  if (!doc) return <div style={{ padding: '2rem' }}>Document not found.</div>;

  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column' }}>
      <div>
        <Link to="/">← Back to Dashboard</Link>
        <h2>{doc.filename} (Status: {doc.status})</h2>
        <button onClick={generateChecklist} disabled={loadingChecklist || doc.status === 'pending'}>
          {loadingChecklist ? 'Generating Checklist...' : 'Generate Lawyer Checklist'}
        </button>
      </div>
      
      {checklist && (
        <div style={{ backgroundColor: '#fffbe6', border: '1px solid #ffe58f', padding: '1rem', marginTop: '1rem', borderRadius: '4px' }}>
          <h3>Questions for Lawyer</h3>
          <p><strong>Summary:</strong> {checklist.summary}</p>
          <ul>
            {checklist.items.map((item: any, i: number) => (
              <li key={i} style={{ marginBottom: '0.5rem' }}>
                {item.action_item} 
                <a href={`#clause-${item.cited_clause_id}`} style={{ marginLeft: '0.5rem', fontSize: '0.8rem' }}>[Source Clause]</a>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {doc.status === 'pending' && <p>Processing document, please wait...</p>}
      
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem', marginTop: '1rem' }}>
        <div style={{ flex: '2 1 600px', maxHeight: '80vh', overflowY: 'auto', paddingRight: '1rem' }}>
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

function CompareView() {
  const { id1, id2 } = useParams();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  
  useEffect(() => {
    axios.get(`/api/documents/${id1}/compare/${id2}`)
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.data?.error || 'Comparison failed'));
  }, [id1, id2]);

  if (error) return <div style={{ padding: '2rem', color: 'red' }}>Error: {error}</div>;
  if (!data) return <div style={{ padding: '2rem' }}>Loading comparison...</div>;

  return (
    <div style={{ padding: '2rem' }}>
      <Link to="/">← Back to Dashboard</Link>
      <h2>Compare Documents</h2>
      <div style={{ display: 'flex', gap: '1rem', borderBottom: '2px solid #ccc', paddingBottom: '1rem' }}>
        <h3 style={{ flex: 1 }}>{data.doc1.filename}</h3>
        <h3 style={{ flex: 1 }}>{data.doc2.filename}</h3>
      </div>
      
      {data.comparison.map((comp: any, i: number) => (
        <div key={i} style={{ borderBottom: '1px solid #eee', padding: '1rem 0' }}>
          <h4 style={{ textTransform: 'capitalize' }}>{comp.clauseType || 'General'}</h4>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 300px', backgroundColor: '#f9f9f9', padding: '1rem' }}>
              {comp.doc1Clauses.length > 0 ? comp.doc1Clauses.map((c: any) => <p key={c._id}>{c.originalText}</p>) : <em>Not present</em>}
            </div>
            <div style={{ flex: '1 1 300px', backgroundColor: '#f9f9f9', padding: '1rem' }}>
              {comp.doc2Clauses.length > 0 ? comp.doc2Clauses.map((c: any) => <p key={c._id}>{c.originalText}</p>) : <em>Not present</em>}
            </div>
          </div>
        </div>
      ))}
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
        <button onClick={() => setToken(null)} aria-label="Logout">Logout</button>
      </div>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/document/:id" element={<DocumentView />} />
        <Route path="/compare/:id1/:id2" element={<CompareView />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
