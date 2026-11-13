// Canonical bencode for the paid-retrieval vectors: sorted keys, minimal integers.
const bytes = value => Buffer.from(value.hex ?? value.text, value.hex === undefined ? 'utf8' : 'hex');

export function encodeBencode(value) {
  if (typeof value === 'number' || typeof value === 'bigint') {
    return Buffer.from(`i${BigInt(value)}e`);
  }
  if (Array.isArray(value)) {
    return Buffer.concat([Buffer.from('l'), ...value.map(encodeBencode), Buffer.from('e')]);
  }
  if ('hex' in value || 'text' in value) {
    const raw = bytes(value);
    return Buffer.concat([Buffer.from(`${raw.length}:`), raw]);
  }
  const entries = Object.entries(value)
    .map(([key, item]) => [Buffer.from(key, 'utf8'), item])
    .sort(([a], [b]) => Buffer.compare(a, b));
  const parts = entries.flatMap(([key, item]) => [Buffer.from(`${key.length}:`), key, encodeBencode(item)]);
  return Buffer.concat([Buffer.from('d'), ...parts, Buffer.from('e')]);
}
