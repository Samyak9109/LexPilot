require('dotenv').config();
const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const { User, Document, DocumentClause } = require('./models');

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
    res.status(400).json({ error: err.message });
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
  if (!req.file.originalname.endsWith('.pdf') && !req.file.originalname.endsWith('.docx')) {
      return res.status(400).json({ error: 'Invalid file type. Only PDF and DOCX are allowed.' });
  }
  if (req.file.size > 20 * 1024 * 1024) {
      return res.status(400).json({ error: 'File size exceeds 20MB limit.' });
  }
  
  try {
    const doc = new Document({
      userId: req.user.userId,
      filename: req.file.originalname,
      status: 'pending'
    });
    await doc.save();

    // Proxy to FastAPI asynchronously
    const form = new FormData();
    form.append('file', fs.createReadStream(req.file.path), req.file.originalname);
    
    // We send documentId in the header or as part of form data?
    // Let's call /internal/upload on FastAPI and pass documentId
    form.append('documentId', doc._id.toString());

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

// Start Express Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Express API listening on port ${PORT}`);
});
