const test = require('node:test');
const assert = require('node:assert/strict');
const { allowedOrigins, validateProductionSecrets } = require('../security-config');

test('uses local frontend origins when no CORS configuration is supplied', () => {
  assert.deepEqual(allowedOrigins(), ['http://localhost:5173', 'http://localhost:3000']);
});

test('parses and trims configured CORS origins', () => {
  assert.deepEqual(
    allowedOrigins(' https://app.example.com,https://staging.example.com '),
    ['https://app.example.com', 'https://staging.example.com'],
  );
});

test('rejects placeholder secrets in production', () => {
  assert.throws(
    () => validateProductionSecrets({
      NODE_ENV: 'production',
      JWT_SECRET: 'super-secret-lexpilot-key',
      INTERNAL_SECRET: 'internal-secret-token',
    }),
    /JWT_SECRET/i,
  );
});

test('accepts strong production secrets', () => {
  assert.doesNotThrow(() => validateProductionSecrets({
    NODE_ENV: 'production',
    JWT_SECRET: 'a-long-random-jwt-secret-with-more-than-thirty-two-characters',
    INTERNAL_SECRET: 'another-long-random-internal-secret-value-here',
  }));
});
