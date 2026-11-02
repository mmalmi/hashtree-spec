// Independent encoder for the published fixtures, not a general-purpose codec.
import assert from 'node:assert/strict';

const byte = n => Buffer.from([n]);
const concat = parts => Buffer.concat(parts);
const utf8Order = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));

function unsigned(value, width) {
  const result = Buffer.alloc(width);
  let n = BigInt(value);
  for (let i = width - 1; i >= 0; i--) {
    result[i] = Number(n & 255n);
    n >>= 8n;
  }
  return result;
}

function integer(value) {
  assert(Number.isSafeInteger(value), 'Fixture integers must be exact JS numbers');
  if (value >= 0) {
    if (value < 128) return byte(value);
    for (const [limit, prefix, width] of [
      [256, 0xcc, 1], [65536, 0xcd, 2], [4294967296, 0xce, 4],
    ]) {
      if (value < limit) return concat([byte(prefix), unsigned(value, width)]);
    }
    return concat([byte(0xcf), unsigned(value, 8)]);
  }
  if (value >= -32) return byte(256 + value);
  for (const [limit, prefix, width] of [
    [-128, 0xd0, 1], [-32768, 0xd1, 2], [-2147483648, 0xd2, 4],
    [Number.MIN_SAFE_INTEGER, 0xd3, 8],
  ]) {
    if (value >= limit) {
      return concat([byte(prefix), unsigned(BigInt.asUintN(width * 8, BigInt(value)), width)]);
    }
  }
  throw new Error('Unsupported fixture integer');
}

function header(length, smallLimit, smallPrefix, mediumPrefix, largePrefix) {
  if (length < smallLimit) return byte(smallPrefix + length);
  if (length < 65536) return concat([byte(mediumPrefix), unsigned(length, 2)]);
  return concat([byte(largePrefix), unsigned(length, 4)]);
}

function string(value) {
  const bytes = Buffer.from(value, 'utf8');
  assert.equal(bytes.toString('utf8'), value, 'Invalid Unicode in fixture');
  if (bytes.length < 32) return concat([byte(0xa0 + bytes.length), bytes]);
  if (bytes.length < 256) return concat([byte(0xd9), byte(bytes.length), bytes]);
  return concat([header(bytes.length, 0, 0, 0xda, 0xdb), bytes]);
}

function binary(hex, key = false) {
  assert.match(hex, key ? /^(?:0[12])?[0-9a-f]{64}$/ : /^[0-9a-f]{64}$/);
  const bytes = Buffer.from(hex, 'hex');
  return concat([Buffer.from([0xc4, bytes.length]), bytes]);
}

function array(values) {
  return concat([header(values.length, 16, 0x90, 0xdc, 0xdd), ...values]);
}

function map(entries) {
  return concat([
    header(entries.length, 16, 0x80, 0xde, 0xdf),
    ...entries.flatMap(([key, value]) => [string(key), value]),
  ]);
}

function metadata(value) {
  if (value === null) return byte(0xc0);
  if (typeof value === 'boolean') return byte(value ? 0xc3 : 0xc2);
  if (typeof value === 'string') return string(value);
  if (typeof value === 'number') {
    assert(Number.isFinite(value));
    if (Number.isInteger(value)) return integer(value);
    const result = Buffer.alloc(9);
    result[0] = 0xcb;
    result.writeDoubleBE(value, 1);
    return result;
  }
  if (Array.isArray(value)) return array(value.map(metadata));
  assert.equal(typeof value, 'object');
  return map(Object.keys(value).sort(utf8Order).map(key => [key, metadata(value[key])]));
}

function link(value) {
  const fields = [];
  for (const key of ['h', 'k', 'm', 'n', 's', 't']) {
    if (!Object.hasOwn(value, key)) continue;
    const encode = key === 'h' || key === 'k' ? binary
      : key === 'm' ? metadata : key === 'n' ? string : integer;
    fields.push([key, encode(value[key], key === 'k')]);
  }
  return map(fields);
}

export function encodeManifest(node) {
  assert([1, 2, 3].includes(node.t));
  const links = [...node.l];
  if (node.t === 2) links.sort((a, b) => utf8Order(a.n, b.n));
  return map([['l', array(links.map(link))], ['t', integer(node.t)]]);
}
