const crypto = require('crypto');
const config = require('../config');

// Encrypt trunk password for storage
function encryptPassword(password) {
  const iv = crypto.randomBytes(16);
  const key = Buffer.from(config.trunkEncryptKey, 'hex');
  const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

// Decrypt trunk password
function decryptPassword(encryptedStr) {
  const [ivHex, encrypted] = encryptedStr.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const key = Buffer.from(config.trunkEncryptKey, 'hex');
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Format phone number (strip non-digits, ensure E.164-ish)
function normalizePhone(phone) {
  let cleaned = phone.replace(/[^\d+]/g, '');
  if (!cleaned.startsWith('+') && !cleaned.startsWith('1') && cleaned.length === 10) {
    cleaned = '1' + cleaned;
  }
  return cleaned;
}

// Paginate query helper
function paginationParams(page = 1, limit = 50) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  return { limit: l, offset: (p - 1) * l, page: p };
}

// Generate random alphanumeric string
function randomString(length = 16) {
  return crypto.randomBytes(length).toString('hex').slice(0, length);
}

module.exports = {
  encryptPassword,
  decryptPassword,
  normalizePhone,
  paginationParams,
  randomString,
};
