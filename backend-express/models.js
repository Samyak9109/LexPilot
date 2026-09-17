const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
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
  docType: { type: String }
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
  keyDates: [{ type: String }],
  confidence: { type: Number }
});

const qaHistorySchema = new mongoose.Schema({
  documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  question: { type: String, required: true },
  answer: { type: String, required: true },
  citedClauseIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'DocumentClause' }],
  timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Document = mongoose.model('Document', documentSchema);
const DocumentClause = mongoose.model('DocumentClause', documentClauseSchema);
const QAHistory = mongoose.model('QAHistory', qaHistorySchema);

module.exports = { User, Document, DocumentClause, QAHistory };
