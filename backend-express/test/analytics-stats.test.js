const test = require('node:test');
const assert = require('node:assert/strict');
const { User, Document, DocumentClause, QAHistory, Session } = require('../models');

test('models export Session and QAHistory supports rating and feedback', () => {
  assert.ok(Session, 'Session model should be defined and exported');
  assert.ok(QAHistory, 'QAHistory model should be defined and exported');

  const qa = new QAHistory({
    documentId: '507f191e810c19729de860ea',
    userId: '507f191e810c19729de860eb',
    question: 'What is the liability cap?',
    answer: 'The cap is $100,000.',
    rating: 1,
    feedbackText: 'Very helpful and accurate'
  });

  assert.equal(qa.rating, 1);
  assert.equal(qa.feedbackText, 'Very helpful and accurate');

  const session = new Session({
    userId: '507f191e810c19729de860eb',
    sessionToken: 'test-token',
    userAgent: 'Mozilla/5.0',
    ip: '127.0.0.1'
  });

  assert.equal(session.sessionToken, 'test-token');
  assert.equal(session.userAgent, 'Mozilla/5.0');
});
