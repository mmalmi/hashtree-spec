import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, createHash, hkdfSync } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeManifest } from './manifest.mjs';
import { encodeBech32 } from './bech32.mjs';
import { encodeBencode } from './bencode.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(resolve(root, path), 'utf8');
const sha256 = bytes => createHash('sha256').update(bytes).digest();
const vectors = JSON.parse(read('test-vectors/spec-vectors.json'));
const seen = new Set();

for (const vector of vectors) {
  assert(!seen.has(vector.name), `Duplicate vector: ${vector.name}`);
  seen.add(vector.name);
  const document = read(vector.document);
  if (vector.kind === 'manifest') {
    const encoded = encodeManifest(vector.node);
    assert.equal(encoded.toString('hex'), vector.msgpack, vector.name);
    assert.equal(sha256(encoded).toString('hex'), vector.hash, vector.name);
    assert(document.includes(`manifest_msgpack: ${vector.msgpack}`));
    assert(document.includes(`manifest_hash: ${vector.hash}`));
  } else if (vector.kind === 'chk') {
    const plaintext = Buffer.from(vector.plaintext, 'hex');
    const key = sha256(plaintext);
    assert.equal(key.toString('hex'), vector.chk_key);
    if (vector.encoded_key) {
      assert.equal(vector.encoded_key, '01' + vector.chk_key);
      assert(document.includes(`versioned_chk_key: ${vector.encoded_key}`));
    }
    const aes = hkdfSync('sha256', key, 'hashtree-chk', 'encryption-key', 32);
    const cipher = createCipheriv('aes-256-gcm', aes, Buffer.alloc(12));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
    assert.equal(ciphertext.toString('hex'), vector.ciphertext);
    assert.equal(sha256(ciphertext).toString('hex'), vector.blob_hash);
    const decrypt = bytes => {
      const decipher = createDecipheriv('aes-256-gcm', aes, Buffer.alloc(12));
      decipher.setAuthTag(bytes.subarray(-16));
      return Buffer.concat([decipher.update(bytes.subarray(0, -16)), decipher.final()]);
    };
    assert.deepEqual(decrypt(ciphertext), plaintext);
    const corrupted = Buffer.from(ciphertext);
    corrupted[0] ^= 1;
    assert.throws(() => decrypt(corrupted));
    for (const field of ['chk_key', 'ciphertext', 'blob_hash']) {
      assert(document.includes(`${field}: ${vector[field]}`));
    }
  } else if (vector.kind === 'rnd') {
    const key = Buffer.from(vector.raw_key, 'hex');
    const nonce = Buffer.from(vector.nonce, 'hex');
    const plain = Buffer.from(vector.plaintext, 'hex');
    assert.equal(vector.encoded_key, '02' + vector.raw_key);
    assert.equal(nonce.length, 12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    const stored = Buffer.concat([nonce, cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
    assert.equal(stored.toString('hex'), vector.ciphertext);
    assert.equal(sha256(stored).toString('hex'), vector.blob_hash);
    const decipher = createDecipheriv('aes-256-gcm', key, stored.subarray(0, 12));
    decipher.setAuthTag(stored.subarray(-16));
    assert.deepEqual(Buffer.concat([decipher.update(stored.subarray(12, -16)), decipher.final()]), plain);
    for (const value of [vector.ciphertext, vector.blob_hash, vector.encoded_key]) assert(document.includes(value));
  } else if (vector.kind === 'mask') {
    const key = Buffer.from(vector.encoded_key, 'hex');
    const secret = Buffer.from(vector.secret, 'hex');
    assert.equal(key.length, secret.length);
    assert.equal(key.map((x, i) => x ^ secret[i]).toString('hex'), vector.masked);
    assert.equal(sha256(secret).subarray(0, 8).toString('hex'), vector.key_id);
    for (const value of [vector.masked, vector.key_id, vector.secret]) assert(document.includes(value));
  } else if (vector.kind === 'nhash') {
    assert.match(vector.root_hash, /^[0-9a-f]{64}$/);
    const keyTlv = vector.encoded_key ? '0521' + vector.encoded_key : '';
    assert.equal(vector.payload, '0020' + vector.root_hash + keyTlv);
    assert.equal(encodeBech32('nhash', Buffer.from(vector.payload, 'hex')), vector.nhash);
    for (const field of ['root_hash', 'payload', 'nhash']) {
      assert(document.includes(`${field}: ${vector[field]}`));
    }
  } else if (vector.kind === 'paid-message') {
    const header = encodeBencode(vector.fields);
    assert(header.length <= 65536, vector.name);
    const payload = Buffer.from(vector.payload, 'hex');
    assert.equal(Buffer.concat([header, payload]).toString('hex'), vector.wire, vector.name);
    if (vector.fields.t.text === 'data') assert.equal(vector.fields.n, payload.length, vector.name);
    else assert.equal(payload.length, 0, vector.name);
    const digest = { undefined: 32, sha1: 20 }[vector.fields.y?.text];
    if (vector.fields.h) assert.equal(Buffer.from(vector.fields.h.hex, 'hex').length, digest, vector.name);
    assert(document.includes(`wire: ${vector.wire}`), vector.name);
  } else if (vector.kind === 'paid-price') {
    const [msat, perBytes, minimum, bytes] = ['msat', 'per_bytes', 'min_msat', 'bytes'].map(key => BigInt(vector[key]));
    const per = perBytes === 0n ? 1n : perBytes;
    const due = (bytes * msat + per - 1n) / per;
    assert.equal(String(due > minimum ? due : minimum), vector.price_msat, vector.name);
    assert(document.includes(`| \`${vector.bytes}\` | \`price_msat: ${vector.price_msat}\` |`), vector.name);
  } else {
    throw new Error(`Unknown vector kind: ${vector.kind}`);
  }
  console.log(`PASS ${vector.name}`);
}

assert.equal(vectors.length, 24, 'Update the expected count when adding reviewed vectors');
const docs = ['README.md', 'CONTRIBUTING.md', ...readdirSync(resolve(root, 'specs')).map(name => `specs/${name}`)];
let links = 0;
for (const path of docs) {
  const body = read(path);
  for (const match of body.matchAll(/\[[^\]\n]+\]\(([^)\s]+)\)/g)) {
    const target = match[1];
    if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('#')) continue;
    const destination = resolve(root, dirname(path), target.split('#')[0]);
    assert(destination.startsWith(root), `Link escapes repository: ${path}: ${target}`);
    assert(existsSync(destination), `Missing link: ${path}: ${target}`);
    links++;
  }
  assert(!body.includes('/Users/'), `Private path in ${path}`);
  assert(!body.includes('htree://self/'), `Machine-local identity in ${path}`);
}

const sources = JSON.parse(read('sources.json'));
assert.equal(sources.proposals.length, 4);
for (const source of [
  ...sources.proposals,
  sources.license,
  sources.implementation,
  sources.encryption_suites,
  sources.paid_retrieval,
]) {
  assert.match(source.revision, /^[0-9a-f]{40}$/);
  if (source.sha256) assert.match(source.sha256, /^[0-9a-f]{64}$/);
  if (source.destination) assert(existsSync(resolve(root, source.destination)));
}
console.log(`PASS ${docs.length} documents, ${links} local links, pinned source provenance`);
console.log(`${vectors.length} vectors passed; 0 failures`);
