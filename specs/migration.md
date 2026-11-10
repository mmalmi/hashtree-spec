# Migration and compatibility

`draft`

This edition adopts the optional encryption suites in
[hzrd149's rewrite](https://github.com/hzrd149/blossom/tree/237ef419cfb2161585c9327df3755c038002c618/implementations/hashtree).
This document describes how readers can access data written by earlier implementations.

## Scope and conformance

The current format is defined in [Object encryption](chk-encryption.md),
[Directory manifests](directory-manifests.md), [Chunked files and directory fanout](chunked-files-and-fanout.md),
and [Hashtree references](references.md). A reader that implements only the
current format can conform to this edition. Readers MAY support each
historical encoding described here independently.
For each historical encoding a reader accepts, it MUST follow that encoding's
decoding and validation rules below. If resolving a reference or child link
requires an unsupported encoding, the reader MUST reject that operation.
It MUST NOT discard a supplied key or fall back to plaintext after a
decryption failure.

## New writes and existing data

New encrypted writes SHOULD use 33-byte suite-prefixed keys. Implementations
may keep CHK encryption as their default and offer randomized encryption or
plaintext explicitly.

Readers MAY accept 32-byte legacy CHK keys in manifests, immutable references,
or mutable root events. When accepted, all 32 bytes MUST be interpreted as
CHK key material, regardless of the first byte. A missing key means plaintext.
Unknown suites and malformed keys MUST fail explicitly.

To decrypt with a legacy key, readers MUST use the HKDF, zero nonce,
stored layout, and both hash checks defined for `chk-v1` in
[Object encryption](chk-encryption.md). The missing suite prefix changes
only key representation. Any hash, authentication, or plaintext-key equality
failure MUST reject the object, even if its stored bytes resemble a manifest.

Existing immutable roots and their descendants MUST NOT be rewritten in place.
When editing a tree, unchanged child references can be retained verbatim.
Resolving a retained child that uses a legacy encoding still requires support
for that encoding, even when the parent was newly written. Rewriting randomized
objects MUST retain randomized encryption unless the caller explicitly requests
a change.

Adding the CHK suite byte leaves a raw CHK blob's ciphertext and hash unchanged.
Adding it to a manifest's child key changes that manifest's bytes and hash, and
therefore its ancestors. The manifest structure is unchanged; the resulting
wire bytes and roots are not necessarily unchanged.

Older libraries need an upgrade to read versioned manifests, references, or
randomized objects. A legacy writer option may help applications coordinate
rollout, but is not the default for this edition.

## References and link secrets

Readers MAY accept a bare 32-byte Bech32 payload in an `nhash`. If accepted,
the entire payload MUST be used as the root hash with no key. The current
`nhash` format uses TLV. Readers MAY also accept a 32-byte legacy CHK key
in a type `5` TLV record, independently of support for the bare payload.

Readers MAY accept a historical mutable root event carrying a 64-character
lowercase hex legacy key in `key`, or the same hex string encrypted using
NIP-44 version 2 in `selfEncryptedKey`. Readers MAY also accept historical
link-private roots. For those roots, `encryptedKey` and the random link secret
are both 32 bytes, encoded as 64 lowercase hex characters. XOR recovers the
legacy root key; `keyId` remains the first eight bytes of SHA-256 of the secret.
Owner recovery tags carry the corresponding 64-character root-key or
link-secret hex string encrypted using NIP-44 version 2.

Clients MAY also read kind `30078` root events that otherwise satisfy the
mutable-root requirements in [Hashtree references](references.md). New root
events use kind `30064`.

Readers MAY accept historical 32-byte link secrets in `#k=<64-lowercase-hex>`
fragments or client-local state. The original proposal also allowed
`k=<link_key>` in an `htree` query string. Clients MAY accept that form locally,
but MUST remove the secret before any HTTP request. Conflicting fragment and
query secrets MUST be rejected. An HTTP gateway MUST NOT interpret query
parameters as decryption keys for public content serving.

Link-secret masking requires the same length for the encoded root key and the
link secret. A new 33-byte root key needs a 33-byte secret. Existing 32-byte
secrets continue to unlock their original roots. Applications updating a
mutable link-visible root must explicitly coordinate secret rotation or keep
its root key in the legacy CHK representation; they MUST NOT truncate keys or
silently pad secrets. A secret or masked key is opaque random data, not a
suite-prefixed encryption key.

### Legacy Blossom URI parameters

Clients MAY accept `blossom:` URIs using the original CHK parameters:

- `enc=chk-v1`
- `k=<chk_key>` as 64 lowercase hex characters

If `k` is present, `enc=chk-v1` MUST also be present. Here `k` is the unprefixed
legacy CHK key, not a link secret. Clients MUST NOT send it to Blossom servers.
The extension SHOULD describe the plaintext.

Example for plaintext `hello`:

```text
blossom:70b977414934faa6270f323f117d05dbcc412e9d7ba2354b4d0f88f60aad2461.txt?enc=chk-v1&k=2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
```

## Historical manifest encodings

Readers MAY accept a 32-byte legacy CHK `k` in file, directory, and fanout
links. If accepted, the legacy CHK validation rules above apply. All other
structural requirements continue to apply unless explicitly addressed below.

Readers MAY accept older encodings with different field order, longer length
or integer headers, or alternative numeric representations. This permission
does not admit values outside the metadata data model or malformed manifests.
Hash verification MUST use the original stored bytes, never a decoded and
re-encoded representation.

Re-encoding a historical manifest under the current canonical rules can change
its hash and ancestor hashes. Existing references MUST continue to identify
the original bytes and MUST NOT be silently normalized.

## Other differences retained

- Small files may still be referenced directly as blobs. Readers do not require
  a wrapper manifest for every file.
- Typed directory fanout is the write format; legacy named fanout may be read
  using the explicit compatibility mode below.
- Metadata keeps the existing numeric canonicalization, including finite
  binary64 values outside the MessagePack integer range.
- Plaintext manifests carrying a key are a historical implementation bug,
  described below, not an accepted encoding.

The randomized test vector includes the suite byte in its 33-byte encoded key.
Both encryption suites support immutable ciphertext caching and storage
accounting; only CHK deduplicates independent encryptions of equal plaintext.

## Legacy named-fanout compatibility mode

This mode is an optional read exception to the current typed-fanout schema.
Readers MUST disable it by default. A caller MAY select it for a specific object
using application-local configuration or an explicit import operation. The
selection MUST identify the object by its stored hash; it MUST NOT be inferred
from entry names, key length, a decryption failure, or successful MessagePack
decoding. Selecting a mode for a parent MUST NOT implicitly select it for its
children. Applications importing a known historical tree can explicitly select
this mode for each affected object as they traverse it.

This selection is not a new manifest field, URI parameter, or Nostr tag.
An `nhash` alone does not communicate it. Applications exchanging historical
trees that need this mode must also communicate the required interpretation
out of band. A reader that does not support a requested mode MUST report it as
unsupported rather than silently resolve using a different interpretation.

This is a deliberate tightening of historical heuristic readers, not a claim
that those readers already required opt-in. Ordinary legacy CHK decryption and
legacy reference decoding do not require this mode.

### Legacy named directory fanout

In this mode, the selected object MUST decode as a nonempty `t = 2` directory
whose every link has `t = 2` and a name matching `_chunk_` followed by one or more
ASCII decimal digits. Otherwise the reader MUST reject the selected legacy
fanout. Normal directory field, name, hash, and key validation still applies.

The reader MUST treat these links as internal children and flatten them in
manifest link order. The numeric suffix is a historical label, not a routing
bound; readers MUST NOT reorder links numerically or infer subtree counts or
sizes from it. A child is a normal directory unless independently selected for
this mode. This permits explicitly identified nested legacy fanout without
automatically hiding ordinary directories with matching names.

Readers MUST verify each fetched child's stored hash, decrypt it when keyed,
and validate it as a directory before using its entries. Listings MUST reject
duplicate flattened names. Path resolution MUST reject ambiguous matches
rather than selecting the first match; absent trustworthy typed bounds, it
must examine the legacy children needed to establish uniqueness. Existing
resource limits apply throughout traversal.

This legacy shape has no required `count`, `first`, or `last` metadata. Readers
MUST NOT invent those summaries from the synthetic names. New writers MUST use
typed `t = 3` fanout instead.

## Compatibility review cases

These cases specify outcomes for readers with the indicated support. Cases
that select a legacy mode or exercise legacy decryption assume support for it.
The published vector checker checks the fixtures but does not exercise traversal.

| Input and context | Required outcome |
| --- | --- |
| Resolve the `legacy` link in the mixed directory vector below, with no legacy CHK support | Reject the operation. |
| Resolve the same link with legacy CHK support | Verify the stored hash, authenticate and decrypt the blob, verify the plaintext against the key, and return `hello`. |
| A bare 32-byte `nhash` payload | Reject if unsupported. If supported, use all 32 bytes as the root hash with no key. |
| A valid type-2 directory containing only `_chunk_0` and `_chunk_174` directory links, no mode selected | List both names verbatim. |
| The same object explicitly selected as legacy named fanout | Flatten its validated child directories in manifest order. |
| Selected legacy named fanout with an empty link array or a nonmatching link | Reject. |
| Selected legacy named fanout whose children contain duplicate entry names | Reject the listing or ambiguous lookup. |
| A matching child directory without its own legacy selection | Preserve its `_chunk_*` entries as ordinary names. |
| The empty-directory vector below, supplied with a 32-byte all-zero key | Reject failed CHK decryption. |
| The same bytes with a wrong stored hash or a 33-byte `01`-prefixed key | Reject; no plaintext fallback. |
| Authenticated CHK plaintext whose SHA-256 differs from the supplied legacy key | Reject; no plaintext fallback. |
| Successful CHK decryption followed by an invalid manifest | Reject; no plaintext fallback. |

The rejection case reuses the historical empty-directory bytes:

```text
stored_bytes: 82a16c90a17402
stored_hash: 0218ed9a4fbb0993757f17e5d08d089cb0c6ac851928ba1ba82d337d76c41c0c
legacy_key: 0000000000000000000000000000000000000000000000000000000000000000
```

## Historical implementation bug: plaintext manifests with keys

Some historical implementations accepted stored plaintext manifests even when
the reference supplied a CHK key. This is an implementation bug, not a wire
format or compatibility feature. Readers MUST NOT reproduce automatic
plaintext fallback after failed decryption, for either legacy or current keys.
Successful MessagePack parsing does not establish successful decryption or
proof of possession of a secret.

Recovery belongs in an explicit application-specific repair or import tool,
outside normal reference resolution. An operator can identify known plaintext
data independently, verify its stored hash and manifest structure, and create
a corrected reference without the erroneous key. This is an explicit repair,
not successful resolution of the original keyed reference. Removing a key
from a parent manifest changes that manifest's hash and its ancestors; the
plaintext object's own stored bytes and hash need not change. Existing
immutable references MUST NOT be silently rewritten. New writers MUST NOT
attach keys to plaintext objects.

## Historical implementation evidence

At the implementation revision pinned in [sources.json](../sources.json), the
Rust [directory helper](https://github.com/mmalmi/hashtree/blob/bf4cf11f2d9c785c09e35c2d8b5bef473d0e693d/rust/crates/hashtree-core/src/directory.rs)
recognizes nonempty all-matching `_chunk_<digits>` directories heuristically.
The [tree reader](https://github.com/mmalmi/hashtree/blob/bf4cf11f2d9c785c09e35c2d8b5bef473d0e693d/rust/crates/hashtree-core/src/hashtree.rs)
prefers successful decryption, but can return stored tree-shaped bytes after
decryption fails without comparing the supplied key to their hash. These paths
explain the historical behavior. Readers MAY implement the named-fanout mode
above. Automatic plaintext fallback after decryption failure is prohibited.

## Mixed directory vector

With legacy CHK support, all four entries resolve to the UTF-8 bytes of
`hello`. The legacy and versioned CHK entries share one stored blob. The
plaintext and randomized entries each have their own blob.

```text
manifest_msgpack: 82a16c9485a168c42070b977414934faa6270f323f117d05dbcc412e9d7ba2354b4d0f88f60aad2461a16bc421012cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824a16ea363686ba17305a1740085a168c42070b977414934faa6270f323f117d05dbcc412e9d7ba2354b4d0f88f60aad2461a16bc4202cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824a16ea66c6567616379a17305a1740084a168c4202cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824a16ea5706c61696ea17305a1740085a168c420819b3a52aa2550b762399299892a6b613b7071c57d95787a1915310afd50fc7ba16bc421020202020202020202020202020202020202020202020202020202020202020202a16ea3726e64a17305a17400a17402
manifest_hash: 79692ea9885a662e5a416f68d4dfec42c6198e329cb3dce7cb6d53e68d13ad98
```
