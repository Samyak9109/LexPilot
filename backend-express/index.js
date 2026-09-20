// Fix: local DNS does not support SRV record queries needed for mongodb+srv://
// Force Node.js to use Google's public DNS (8.8.8.8) which supports SRV lookups
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
const { Resolver } = dns;
const resolver = new Resolver();
resolver.setServers(['8.8.8.8', '8.8.4.4']);
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config();
const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const { User, Document, DocumentClause, QAHistory } = require('./models');

const app = express();
app.use(express.json());
app.use(cors());

const upload = multer({ dest: 'uploads/' });

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-lexpilot-key';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lexpilot';
const FASTAPI_URL = process.env.FASTAPI_URL || 'http://localhost:8000';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || 'internal-secret-token';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Auth Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (token == null) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Auth Routes
app.post('/api/register', async (req, res) => {
  try {
    const user = new User({ username: req.body.username, password: req.body.password });
    await user.save();
    res.status(201).json({ message: 'User registered' });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: 'Internal server error: ' + err.message });
  }
});

app.post('/api/login', async (req, res) => {
  const user = await User.findOne({ username: req.body.username });
  if (!user || !(await user.comparePassword(req.body.password))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token });
});

// Document Routes
app.post('/api/documents', authenticateToken, upload.single('document'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const validMimes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  if (!validMimes.includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'Invalid file type. Only PDF and DOCX are allowed.' });
  }
  if (req.file.size > 20 * 1024 * 1024) {
      return res.status(400).json({ error: 'File size exceeds 20MB limit.' });
  }
  
  try {
    const doc = new Document({
      userId: req.user.userId,
      filename: req.file.originalname,
      jurisdiction: req.body.jurisdiction || 'Global/Agnostic',
      language: req.body.language || 'English',
      status: 'pending'
    });
    await doc.save();

    const form = new FormData();
    form.append('file', fs.createReadStream(req.file.path), req.file.originalname);
    form.append('documentId', doc._id.toString());
    form.append('jurisdiction', doc.jurisdiction);
    form.append('language', doc.language);

    axios.post(`${FASTAPI_URL}/internal/upload`, form, {
      headers: {
        ...form.getHeaders(),
        'X-Internal-Secret': INTERNAL_SECRET
      }
    }).then(response => {
      console.log('FastAPI accepted document:', response.data);
    }).catch(err => {
      console.error('FastAPI proxy error:', err.message);
      Document.findByIdAndUpdate(doc._id, { status: 'failed' }).exec();
    });

    res.json({ documentId: doc._id, status: 'pending', filename: req.file.originalname });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/documents', authenticateToken, async (req, res) => {
  try {
    const docs = await Document.find({ userId: req.user.userId }).sort({ _id: -1 });
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/documents/:id', authenticateToken, async (req, res) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    
    const clauses = await DocumentClause.find({ documentId: doc._id });
    res.json({ document: doc, clauses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/documents/:id/ask', authenticateToken, async (req, res) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: 'Question is required' });

    // Call FastAPI internal ask endpoint
    const response = await axios.post(`${FASTAPI_URL}/internal/ask`, {
      documentId: doc._id.toString(),
      question: question
    }, {
      headers: { 'X-Internal-Secret': INTERNAL_SECRET }
    });

    // Save to QAHistory
    const qa = new QAHistory({
      documentId: doc._id,
      userId: req.user.userId,
      question: question,
      answer: response.data.answer,
      citedClauseIds: response.data.citations || []
    });
    await qa.save();

    res.json(response.data);
  } catch (err) {
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/documents/:id/checklist', authenticateToken, async (req, res) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    
    const response = await axios.post(`${FASTAPI_URL}/internal/generate_checklist`, {
      documentId: doc._id.toString()
    }, {
      headers: { 'X-Internal-Secret': INTERNAL_SECRET }
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/documents/:id1/compare/:id2', authenticateToken, async (req, res) => {
  try {
    const doc1 = await Document.findOne({ _id: req.params.id1, userId: req.user.userId });
    const doc2 = await Document.findOne({ _id: req.params.id2, userId: req.user.userId });
    if (!doc1 || !doc2) return res.status(404).json({ error: 'Documents not found' });

    const clauses1 = await DocumentClause.find({ documentId: doc1._id });
    const clauses2 = await DocumentClause.find({ documentId: doc2._id });

    // Group by clauseType
    const types1 = new Set(clauses1.map(c => c.clauseType).filter(Boolean));
    const types2 = new Set(clauses2.map(c => c.clauseType).filter(Boolean));
    
    const intersection = new Set([...types1].filter(x => types2.has(x)));
    const union = new Set([...types1, ...types2]);

    // Structural similarity check
    if (union.size > 0 && (intersection.size / union.size) < 0.2) {
      return res.status(400).json({ error: 'Cannot meaningfully compare structurally dissimilar documents.' });
    }

    const comparison = [];
    for (const type of union) {
      comparison.push({
        clauseType: type,
        doc1Clauses: clauses1.filter(c => c.clauseType === type),
        doc2Clauses: clauses2.filter(c => c.clauseType === type)
      });
    }

    res.json({
      doc1: { id: doc1._id, filename: doc1.filename },
      doc2: { id: doc2._id, filename: doc2.filename },
      comparison
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start Express Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Express API listening on port ${PORT}`);
});
