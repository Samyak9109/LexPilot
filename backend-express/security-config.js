const MIN_SECRET_LENGTH = 32;
const PLACEHOLDER_SECRETS = new Set([
  'super-secret-lexpilot-key',
  'internal-secret-token',
  'your-secret-here',
]);

function allowedOrigins(rawOrigins) {
  if (!rawOrigins) return ['http://localhost:5173', 'http://localhost:3000'];
  return rawOrigins.split(',').map((origin) => origin.trim()).filter(Boolean);
}

function isStrongSecret(value) {
  return typeof value === 'string'
    && value.length >= MIN_SECRET_LENGTH
    && !PLACEHOLDER_SECRETS.has(value);
}

function validateProductionSecrets(environment) {
  if (environment.NODE_ENV !== 'production') return;
  for (const key of ['JWT_SECRET', 'INTERNAL_SECRET']) {
    if (!isStrongSecret(environment[key])) {
      throw new Error(`${key} must be a non-placeholder value of at least ${MIN_SECRET_LENGTH} characters in production.`);
    }
  }
}

function validateCredentials({ username, password }) {
  if (typeof username !== 'string' || !/^[a-zA-Z0-9_.-]{3,64}$/.test(username)) {
    return 'Username must be 3–64 characters and use only letters, numbers, dots, underscores, or hyphens.';
  }
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    return 'Password must be between 12 and 128 characters.';
  }
  return null;
}

module.exports = { allowedOrigins, validateCredentials, validateProductionSecrets };
