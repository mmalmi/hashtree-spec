# Migration and compatibility

`draft`

This edition adopts the optional encryption suites in
[hzrd149's rewrite](https://github.com/hzrd149/blossom/tree/237ef419cfb2161585c9327df3755c038002c618/implementations/hashtree),
while retaining reads of existing Hashtree data.

## New writes and existing data

New encrypted writes SHOULD use 33-byte suite-prefixed keys. Implementations
may keep CHK encryption as their default and offer randomized encryption or
plaintext explicitly. Backward compatibility means updated readers can read
existing data; it does not require continuing the old write format by default.

Readers MUST accept both 32-byte legacy CHK keys and registered 33-byte keys
in manifests, immutable references, and mutable root events. A 32-byte key
always means legacy CHK, regardless of its first byte. A missing key means
plaintext. Unknown suites and malformed keys MUST fail explicitly.

Existing immutable roots and their descendants MUST NOT be rewritten in place.
When editing a tree, unchanged child references can be retained verbatim. Newly
written CHK objects may use versioned keys. Rewriting randomized objects MUST
retain randomized encryption unless the caller explicitly requests a change.

Adding the CHK suite byte leaves a raw CHK blob's ciphertext and hash unchanged.
Adding it to a manifest's child key changes that manifest's bytes and hash, and
therefore its ancestors. The manifest structure is unchanged; the resulting
wire bytes and roots are not necessarily unchanged.

Older libraries need an upgrade to read versioned manifests, references, or
randomized objects. A legacy writer option may help applications coordinate
rollout, but is not the default for this edition.

## References and link secrets

Readers retain legacy raw-hash `nhash` decoding, legacy CHK references, and
kind `30078` root events. New root events use kind `30064`. Existing fragments
remain supported; adopting encryption suites does not require moving bearer
secrets into URL queries.

Link-secret masking requires the same length for the encoded root key and the
link secret. A new 33-byte root key needs a 33-byte secret. Existing 32-byte
secrets continue to unlock their original roots. Applications updating a
mutable link-visible root must explicitly coordinate secret rotation or keep
its root key in the legacy CHK representation; they MUST NOT truncate keys or
silently pad secrets. A secret or masked key is opaque random data, not a
suite-prefixed encryption key.

## Other differences retained

- Small files may still be referenced directly as blobs. Readers do not require
  a wrapper manifest for every file.
- Typed directory fanout is the write format; documented legacy directory
  traversal remains readable.
- Metadata keeps the existing numeric canonicalization, including finite
  binary64 values outside the MessagePack integer range.
- Historical plaintext manifests carrying a legacy key may be read by existing
  compatibility paths. That fallback MUST NOT apply to versioned keys.

The randomized test vector includes the suite byte in its 33-byte encoded key.
Both encryption suites support immutable ciphertext caching and storage
accounting; only CHK deduplicates independent encryptions of equal plaintext.

## Mixed directory vector

All four entries resolve to the UTF-8 bytes of `hello`. The legacy and versioned CHK entries share one stored blob. The plaintext and randomized entries each have their own blob.

```text
manifest_msgpack: 82a16c9485a168c42070b977414934faa6270f323f117d05dbcc412e9d7ba2354b4d0f88f60aad2461a16bc421012cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824a16ea363686ba17305a1740085a168c42070b977414934faa6270f323f117d05dbcc412e9d7ba2354b4d0f88f60aad2461a16bc4202cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824a16ea66c6567616379a17305a1740084a168c4202cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824a16ea5706c61696ea17305a1740085a168c420819b3a52aa2550b762399299892a6b613b7071c57d95787a1915310afd50fc7ba16bc421020202020202020202020202020202020202020202020202020202020202020202a16ea3726e64a17305a17400a17402
manifest_hash: 79692ea9885a662e5a416f68d4dfec42c6198e329cb3dce7cb6d53e68d13ad98
```
