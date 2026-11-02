// Bech32 encoding for the published nhash fixture (BIP-173 checksum constant 1).
const alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values) {
  let checksum = 1;
  for (const value of values) {
    const top = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    for (let i = 0; i < 5; i++) {
      if ((top >>> i) & 1) checksum ^= generators[i];
    }
  }
  return checksum >>> 0;
}

export function encodeBech32(prefix, bytes) {
  const values = [];
  let accumulator = 0;
  let bits = 0;
  for (const value of bytes) {
    accumulator = (accumulator << 8) | value;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      values.push((accumulator >>> bits) & 31);
    }
  }
  if (bits) values.push((accumulator << (5 - bits)) & 31);
  const chars = [...prefix].map(char => char.charCodeAt(0));
  const expanded = [...chars.map(char => char >>> 5), 0, ...chars.map(char => char & 31)];
  const checksum = polymod([...expanded, ...values, 0, 0, 0, 0, 0, 0]) ^ 1;
  const check = Array.from({ length: 6 }, (_, i) => (checksum >>> (5 * (5 - i))) & 31);
  return prefix + '1' + [...values, ...check].map(value => alphabet[value]).join('');
}
