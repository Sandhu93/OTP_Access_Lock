const LOCK_DEVICE_NAME = 'LOCK-TEST-01';
const LOCK_SERVICE_UUID = '7d2ea28a-f7bd-45ca-8f2c-2e9b7a5f0001';
const LOCK_COMMAND_CHARACTERISTIC_UUID = '7d2ea28a-f7bd-45ca-8f2c-2e9b7a5f0002';

const PROTOCOL_VERSION = 0x01;

const COMMANDS = Object.freeze({
  requestUnlock: 0x01,
  submitToken: 0x02,
  cancel: 0x03,
  openSession: 0x10,
  sessionHeartbeat: 0x11,
  closeSession: 0x12,
});

const SESSION_ROLES = Object.freeze({
  requester: 0x01,
  approver: 0x02,
});

const STATUS = Object.freeze({
  0x10: 'LOCK_IDLE',
  0x11: 'LOCK_WAITING_TOKEN',
  0x12: 'UNLOCK_OK',
  0x13: 'UNLOCK_DENIED',
  0x14: 'LOCK_CANCELLED',
  0x15: 'LOCK_RESET',
  0x16: 'SESSION_OPENED',
  0x17: 'SESSION_ACTIVE',
  0x18: 'SESSION_CLOSED',
  0x80: 'ERR_EMPTY',
  0x81: 'ERR_UNKNOWN_COMMAND',
  0x82: 'ERR_BAD_PAYLOAD',
  0x83: 'ERR_TOKEN_REQUIRED',
  0x84: 'ERR_VERSION_UNSUPPORTED',
  0x85: 'ERR_TIMEOUT',
  0x86: 'ERR_UNENCRYPTED',
  0x87: 'ERR_SESSION_REQUIRED',
  0x88: 'ERR_SESSION_ROLE',
  0x89: 'ERR_SESSION_CONFLICT',
});

// SECURITY-PLACEHOLDER: hardcoded simulated backend token for bench testing - must be replaced before production. See TODO_SECURITY_DEBT.md
const SIMULATED_TOKEN = '123456';

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function asciiToBytes(value) {
  const bytes = [];
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code > 0x7f) {
      throw new Error('Only ASCII payloads are supported in the MVP protocol');
    }
    bytes.push(code);
  }
  return bytes;
}

function bytesToAscii(bytes) {
  let output = '';
  for (const byte of bytes) {
    if (byte >= 0x20 && byte <= 0x7e) {
      output += String.fromCharCode(byte);
    }
  }
  return output;
}

function bytesToHex(bytes) {
  return bytes.map(byte => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

function bytesToCompactHex(bytes) {
  return bytes.map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64(bytes) {
  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triple = (a << 16) | (b << 8) | c;

    output += BASE64_ALPHABET[(triple >> 18) & 0x3f];
    output += BASE64_ALPHABET[(triple >> 12) & 0x3f];
    output += i + 1 < bytes.length ? BASE64_ALPHABET[(triple >> 6) & 0x3f] : '=';
    output += i + 2 < bytes.length ? BASE64_ALPHABET[triple & 0x3f] : '=';
  }
  return output;
}

function base64ToBytes(value) {
  const clean = value.replace(/\s/g, '');
  if (clean.length % 4 !== 0) {
    throw new Error('Invalid base64 length');
  }

  const bytes = [];
  for (let i = 0; i < clean.length; i += 4) {
    const chars = clean.slice(i, i + 4);
    const indexes = chars.split('').map(char => (char === '=' ? 0 : BASE64_ALPHABET.indexOf(char)));
    if (indexes.some(index => index < 0)) {
      throw new Error('Invalid base64 character');
    }

    const triple = (indexes[0] << 18) | (indexes[1] << 12) | (indexes[2] << 6) | indexes[3];
    bytes.push((triple >> 16) & 0xff);
    if (chars[2] !== '=') {
      bytes.push((triple >> 8) & 0xff);
    }
    if (chars[3] !== '=') {
      bytes.push(triple & 0xff);
    }
  }
  return bytes;
}

function makeFrame(command, payload = []) {
  return [PROTOCOL_VERSION, command, ...payload];
}

function requestUnlockFrame() {
  return makeFrame(COMMANDS.requestUnlock);
}

function submitTokenFrame(token = SIMULATED_TOKEN) {
  return makeFrame(COMMANDS.submitToken, asciiToBytes(token));
}

function cancelFrame() {
  return makeFrame(COMMANDS.cancel);
}

function sessionIdToBytes(sessionId) {
  if (!Array.isArray(sessionId) || sessionId.length !== 8 ||
      sessionId.some(byte => !Number.isInteger(byte) || byte < 0 || byte > 0xff)) {
    throw new Error('Session ID must contain exactly 8 bytes');
  }
  if (sessionId.every(byte => byte === 0)) {
    throw new Error('Session ID must not be all zeroes');
  }
  return sessionId;
}

// SECURITY-PLACEHOLDER: the bench session role is not backed by a signed backend grant yet - must be replaced before production. See TODO_SECURITY_DEBT.md
function openSessionFrame(role, sessionId) {
  if (role !== SESSION_ROLES.requester && role !== SESSION_ROLES.approver) {
    throw new Error('Unsupported session role');
  }
  return makeFrame(COMMANDS.openSession, [role, ...sessionIdToBytes(sessionId)]);
}

function sessionHeartbeatFrame() {
  return makeFrame(COMMANDS.sessionHeartbeat);
}

function closeSessionFrame() {
  return makeFrame(COMMANDS.closeSession);
}

function parseResponseFrame(bytes) {
  if (!Array.isArray(bytes) || bytes.length < 2) {
    return {
      valid: false,
      version: null,
      statusCode: null,
      statusText: 'ERR_BAD_RESPONSE',
      rawHex: Array.isArray(bytes) ? bytesToHex(bytes) : '',
    };
  }

  const version = bytes[0];
  const statusCode = bytes[1];
  const text = bytesToAscii(bytes.slice(2));
  const mappedText = STATUS[statusCode] || 'ERR_UNKNOWN_STATUS';

  return {
    valid: version === PROTOCOL_VERSION && mappedText !== 'ERR_UNKNOWN_STATUS',
    version,
    statusCode,
    statusText: text || mappedText,
    mappedText,
    rawHex: bytesToHex(bytes),
  };
}

function responseFromBase64(value) {
  return parseResponseFrame(base64ToBytes(value));
}

module.exports = {
  LOCK_DEVICE_NAME,
  LOCK_SERVICE_UUID,
  LOCK_COMMAND_CHARACTERISTIC_UUID,
  PROTOCOL_VERSION,
  COMMANDS,
  SESSION_ROLES,
  STATUS,
  SIMULATED_TOKEN,
  asciiToBytes,
  bytesToAscii,
  bytesToBase64,
  base64ToBytes,
  bytesToHex,
  bytesToCompactHex,
  makeFrame,
  requestUnlockFrame,
  submitTokenFrame,
  cancelFrame,
  openSessionFrame,
  sessionHeartbeatFrame,
  closeSessionFrame,
  parseResponseFrame,
  responseFromBase64,
};
