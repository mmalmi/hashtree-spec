import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, createHash, hkdfSync } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeManifest } from './manifest.mjs';
import { encodeBech32 } from './bech32.mjs';

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
  } else if (vector.kind === 'nhash') {
    assert.match(vector.root_hash, /^[0-9a-f]{64}$/);
    assert.equal(vector.payload, '0020' + vector.root_hash);
    assert.equal(encodeBech32('nhash', Buffer.from(vector.payload, 'hex')), vector.nhash);
    for (const field of ['root_hash', 'payload', 'nhash']) {
      assert(document.includes(`${field}: ${vector[field]}`));
    }
  } else {
    throw new Error(`Unknown vector kind: ${vector.kind}`);
  }
  console.log(`PASS ${vector.name}`);
}

assert.equal(vectors.length, 8, 'Update the expected count when adding reviewed vectors');
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
for (const source of [...sources.proposals, sources.license, sources.implementation]) {
  assert.match(source.revision, /^[0-9a-f]{40}$/);
  if (source.sha256) assert.match(source.sha256, /^[0-9a-f]{64}$/);
  if (source.destination) assert(existsSync(resolve(root, source.destination)));
}
console.log(`PASS ${docs.length} documents, ${links} local links, pinned source provenance`);
console.log(`${vectors.length} vectors passed; 0 failures`);
