# Object encryption

`draft`

This document defines optional per-object encryption with explicit suites: deterministic `chk-v1` and randomized `rnd-v1`.

Encryption is optional per object. An unencrypted object is stored as plaintext
and addressed by its SHA-256 hash; it has no decryption key. Libraries MAY
encrypt by default. This specification defines how encrypted objects are
encoded, independently of that default.

Servers do not implement this specification. Clients upload ciphertext as normal Blossom blobs.

## Key encoding and suite registry

An absent key means plaintext. A present key selects exactly one suite:

| Encoded key | Suite | Stored bytes |
| --- | --- | --- |
| `01` followed by 32 bytes | `chk-v1` | AES-GCM ciphertext and 16-byte tag |
| `02` followed by 32 bytes | `rnd-v1` | 12-byte nonce, ciphertext, 16-byte tag |

The current format uses a 33-byte suite-prefixed key. Readers MUST accept
both registered suites. Readers MAY also support the
[legacy CHK key encoding](migration.md#new-writes-and-existing-data).
They MUST reject unsupported lengths and unknown suite identifiers. They
MUST NOT guess a suite or retry failed decryption as plaintext. An empty key
is invalid. The suite byte is part of the encoded key, not the
raw AES key or ciphertext.

The suite is independent for every object, including manifests and chunks.
A tree MAY contain plaintext and multiple encryption suites. Encrypting a
parent does not imply an encryption suite for its children.

## Rationale

Random encryption gives the same file a new ciphertext every time.

Content Hash Key (CHK) gives the same plaintext the same `chk_key`, ciphertext, and Blossom hash. This enables deduplication across independent encryptions. Randomized encryption prevents that deduplication, but both suites retain immutable ciphertext caching, hash verification, and accounting by stored bytes.

A server or P2P peer can choose to store only encrypted content. Since it never receives plaintext, it stores opaque ciphertext instead of readable user content and does not need to inspect hosted blobs like a plaintext media server.

## Terms

- `plaintext`: bytes before encryption.
- `ciphertext`: encrypted bytes stored as the Blossom blob, including the AES-GCM tag.
- `blob_hash`: `SHA256(ciphertext)`.
- `chk_key`: `SHA256(plaintext)`.

## CHK encryption

To encrypt:

1. Compute `chk_key = SHA256(plaintext)`.
2. Derive `aes_key = HKDF-SHA256(ikm = chk_key, salt = "hashtree-chk", info = "encryption-key", length = 32)`.
3. Encrypt `plaintext` with AES-256-GCM using `aes_key`, a 12 byte zero nonce, and empty additional authenticated data.
4. Store `ciphertext = aes_gcm_ciphertext || 16_byte_tag`.
5. Address the blob by `blob_hash = SHA256(ciphertext)`.

AES-256-GCM is used because it is widely available in browser WebCrypto and native crypto libraries.

Writers MUST derive `chk_key` from the plaintext. They MUST NOT use arbitrary keys with the zero nonce.

The zero nonce is safe only because `aes_key` is derived from the plaintext:
distinct plaintexts yield distinct keys except with negligible collision
probability. Reusing a key with the zero nonce across different plaintexts
leaks the XOR of those plaintexts and can enable authentication-key recovery
and ciphertext forgery.

## CHK decryption

To decrypt:

1. Verify `SHA256(ciphertext) == blob_hash`.
2. Derive `aes_key` from `chk_key`.
3. AES-GCM decrypt with the zero nonce.
4. Verify `SHA256(plaintext) == chk_key`.

If any step fails, clients MUST reject the blob.

The `blob_hash` and `chk_key` checks are security-critical and MUST NOT be skipped as an optimization.

For large or streamable content, encrypt each chunk separately. Each chunk MUST derive its own `chk_key` from its own plaintext (`chk_key = SHA256(chunk_plaintext)`). Clients MUST NOT reuse one key across multiple chunks with the zero nonce.

## Randomized encryption (`rnd-v1`)

For each new object encryption, generate an independent cryptographically
random 32-byte AES key and 12-byte nonce. Encrypt with AES-256-GCM using empty
additional authenticated data. Store `nonce || ciphertext || 16-byte tag`,
addressed by SHA-256 of all stored bytes. The encoded key is `02 || aes_key`.
Writers MUST NOT reuse a key/nonce pair across different plaintexts.

To read, verify the stored hash, require at least 28 stored bytes, extract the
first 12 bytes as nonce, and authenticate/decrypt the remaining bytes using
the raw key after the suite byte. Authentication failure MUST reject the
object. There is no CHK plaintext-hash/key equality check for this suite.

Unlike CHK, independent writes of equal plaintext produce different objects.
The stored ciphertext remains immutable and reusable by caches and peers.
Randomized encryption does not hide object size, access patterns, or the reuse
of an already published reference.

## Security

CHK reveals plaintext equality to anyone who can observe blob hashes or ciphertext.

CHK is vulnerable to confirmation attacks for guessable plaintext. Do not use CHK alone for low-entropy secrets or content where equality leakage is unacceptable.

Encoded keys are bearer secrets and MUST NOT be sent to storage servers.

## Reference implementation

See the [Rust and TypeScript implementations](https://github.com/mmalmi/hashtree).

## Test Vectors

### Empty Plaintext

```text
plaintext:
chk_key: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
ciphertext: 7cd161ae8406d82cdf553c1100d012db
blob_hash: 346c46e7cc6722c99efe7f7bc316d8f3ff5f025f1031bf94418ef4db891e04cd
```

### `hello`

```text
plaintext: 68656c6c6f
chk_key: 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
ciphertext: c65308d9c8649ff1c59820d0b3a030db34ad00f92d
blob_hash: 70b977414934faa6270f323f117d05dbcc412e9d7ba2354b4d0f88f60aad2461
```

### Versioned `hello` keys

The CHK ciphertext above is unchanged when the key is prefixed with `01`:

```text
versioned_chk_key: 012cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
```

The following deterministic fixture fixes the otherwise random key and nonce
for reproducibility. Production writers MUST generate fresh randomness.

```text
plaintext: 68656c6c6f
rnd_raw_key: 0202020202020202020202020202020202020202020202020202020202020202
versioned_rnd_key: 020202020202020202020202020202020202020202020202020202020202020202
nonce: 000102030405060708090a0b
ciphertext: 000102030405060708090a0b216d8e96be582844fc3a4e2a23eecfbe1a29cd5b6b
blob_hash: 819b3a52aa2550b762399299892a6b613b7071c57d95787a1915310afd50fc7b
```
