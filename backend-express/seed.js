const mongoose = require('mongoose');
const { User, Document, DocumentClause, QAHistory } = require('./models');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lexpilot';

async function seedDatabase() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB. Clearing existing data...');
    
    // Clear existing data
    await User.deleteMany({});
    await Document.deleteMany({});
    await DocumentClause.deleteMany({});
    await QAHistory.deleteMany({});
    await mongoose.connection.collection('document_chunks').deleteMany({});

    console.log('Creating sample user...');
    const user = new User({ username: 'testuser', password: 'password123' });
    await user.save();

    console.log('Creating sample document...');
    const doc = new Document({
      userId: user._id,
      filename: 'Sample_NDA.pdf',
      status: 'processed',
      docType: 'NDA',
      jurisdiction: 'US'
    });
    await doc.save();

    console.log('Creating sample clauses and chunks...');
    const clauses = [
      {
        clauseType: 'confidentiality',
        originalText: 'The Receiving Party shall hold and maintain the Confidential Information in strictest confidence for the sole and exclusive benefit of the Disclosing Party.',
        simpleExplanation: 'You must keep the information completely secret and only use it for the benefit of the other party.',
        riskTier: 'green',
        riskReasoning: 'Standard mutual confidentiality terms.',
        confidence: 0.95
      },
      {
        clauseType: 'termination_conditions',
        originalText: 'This Agreement shall remain in effect for a period of five (5) years from the Effective Date, unless terminated earlier by either party upon thirty (30) days written notice.',
        simpleExplanation: 'This contract lasts for 5 years, but either side can cancel it early by giving 30 days notice.',
        riskTier: 'yellow',
        riskReasoning: 'Five years is slightly longer than the standard 2-3 year term for NDAs.',
        confidence: 0.90
      },
      {
        clauseType: 'liability',
        originalText: 'In no event shall the Disclosing Party be liable for any indirect, special, or consequential damages arising out of this Agreement.',
        simpleExplanation: 'The disclosing party is not responsible for indirect or accidental damages that result from this contract.',
        riskTier: 'red',
        riskReasoning: 'This limitation of liability is highly one-sided in favor of the Disclosing Party.',
        confidence: 0.88
      }
    ];

    const savedClauses = [];
    for (const c of clauses) {
      const docClause = new DocumentClause({
        documentId: doc._id,
        ...c,
        sourceSpan: [0, c.originalText.length]
      });
      await docClause.save();
      savedClauses.push(docClause);

      // Create a mock document chunk with a dummy embedding (768 dimensions for text-embedding-004)
      const mockEmbedding = Array(768).fill(0.01);
      await mongoose.connection.collection('document_chunks').insertOne({
        documentId: doc._id,
        clauseId: docClause._id,
        chunkText: c.originalText,
        clauseType: c.clauseType,
        embedding: mockEmbedding
      });
    }

    console.log('Creating sample QA history...');
    const qa = new QAHistory({
      documentId: doc._id,
      userId: user._id,
      question: 'How long does this NDA last?',
      answer: 'This contract lasts for 5 years, but either side can cancel it early by giving 30 days notice.',
      citedClauseIds: [savedClauses[1]._id]
    });
    await qa.save();

    console.log('Database seeded successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding database:', err);
    process.exit(1);
  }
}

seedDatabase();
