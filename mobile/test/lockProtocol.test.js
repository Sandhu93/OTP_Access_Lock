const test = require('node:test');
const assert = require('node:assert/strict');

const protocol = require('../src/ble/lockProtocol');

test('builds versioned request unlock frame', () => {
  assert.deepEqual(protocol.requestUnlockFrame(), [0x01, 0x01]);
});

test('builds versioned cancel frame', () => {
  assert.deepEqual(protocol.cancelFrame(), [0x01, 0x03]);
});

test('builds submit token frame with simulated token', () => {
  assert.deepEqual(protocol.submitTokenFrame(), [0x01, 0x02, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36]);
});

test('builds requester session frame with an explicit session id', () => {
  assert.deepEqual(
    protocol.openSessionFrame(protocol.SESSION_ROLES.requester, [1, 2, 3, 4, 5, 6, 7, 8]),
    [0x01, 0x10, 0x01, 1, 2, 3, 4, 5, 6, 7, 8],
  );
});

test('builds session heartbeat and close frames', () => {
  assert.deepEqual(protocol.sessionHeartbeatFrame(), [0x01, 0x11]);
  assert.deepEqual(protocol.closeSessionFrame(), [0x01, 0x12]);
});

test('rejects invalid session ids and roles', () => {
  assert.throws(() => protocol.openSessionFrame(protocol.SESSION_ROLES.requester, [1]), /8 bytes/);
  assert.throws(() => protocol.openSessionFrame(protocol.SESSION_ROLES.requester, [0, 0, 0, 0, 0, 0, 0, 0]), /zeroes/);
  assert.throws(() => protocol.openSessionFrame(0x99, [1, 2, 3, 4, 5, 6, 7, 8]), /role/);
});

test('encodes and decodes base64 without external dependencies', () => {
  const frame = [0x01, 0x02, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36];
  const encoded = protocol.bytesToBase64(frame);

  assert.equal(encoded, 'AQIxMjM0NTY=');
  assert.deepEqual(protocol.base64ToBytes(encoded), frame);
});

test('parses successful response frame', () => {
  const bytes = [0x01, 0x12, ...protocol.asciiToBytes('UNLOCK_OK')];

  assert.deepEqual(protocol.parseResponseFrame(bytes), {
    valid: true,
    version: 0x01,
    statusCode: 0x12,
    statusText: 'UNLOCK_OK',
    mappedText: 'UNLOCK_OK',
    rawHex: '01 12 55 4E 4C 4F 43 4B 5F 4F 4B',
  });
});

test('rejects unsupported response version', () => {
  const parsed = protocol.parseResponseFrame([0x02, 0x12]);

  assert.equal(parsed.valid, false);
  assert.equal(parsed.version, 0x02);
  assert.equal(parsed.statusText, 'UNLOCK_OK');
});

test('handles malformed short response', () => {
  const parsed = protocol.parseResponseFrame([0x01]);

  assert.equal(parsed.valid, false);
  assert.equal(parsed.statusText, 'ERR_BAD_RESPONSE');
  assert.equal(parsed.rawHex, '01');
});

test('blocks non-ascii token payloads', () => {
  assert.throws(() => protocol.submitTokenFrame('12\u20ac456'), /ASCII/);
});
