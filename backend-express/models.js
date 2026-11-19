const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const documentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  filename: { type: String, required: true },
  uploadDate: { type: Date, default: Date.now },
  status: { type: String, default: 'pending' },
  jurisdiction: { type: String },
  language: { type: String, default: 'English' },
  docType: { type: String },
  keyDates: [{ type: String }],
  glossary: { type: Map, of: String }
});

const documentClauseSchema = new mongoose.Schema({
  documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
  clauseType: { type: String },
  originalText: { type: String },
  sourceSpan: { type: [Number] },
  simpleExplanation: { type: String },
  detailedExplanation: { type: String },
  riskTier: { type: String },
  riskReasoning: { type: String },
  marketBenchmark: { type: String },
  keyDates: [{ type: String }],
  glossary: { type: Map, of: String },
  confidence: { type: Number }
});

const qaHistorySchema = new mongoose.Schema({
  documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  question: { type: String, required: true },
  answer: { type: String, required: true },
  citedClauseIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'DocumentClause' }],
  rating: { type: Number }, // 1 = thumbs up, -1 = thumbs down
  feedbackText: { type: String },
  feedbackTimestamp: { type: Date },
  timestamp: { type: Date, default: Date.now }
});

const sessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sessionToken: { type: String },
  userAgent: { type: String },
  ip: { type: String },
  createdAt: { type: Date, default: Date.now },
  lastActive: { type: Date, default: Date.now }
});

const summarySchema = new mongoose.Schema({
  documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  shareToken: { type: String, required: true, unique: true },
  summary: { type: String, required: true },
  riskSummary: { type: String },
  clauseCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date }
});

const User = mongoose.model('User', userSchema);
const Document = mongoose.model('Document', documentSchema);
const DocumentClause = mongoose.model('DocumentClause', documentClauseSchema);
const QAHistory = mongoose.model('QAHistory', qaHistorySchema);
const Session = mongoose.model('Session', sessionSchema);
const Summary = mongoose.model('Summary', summarySchema);

module.exports = { User, Document, DocumentClause, QAHistory, Session, Summary };
