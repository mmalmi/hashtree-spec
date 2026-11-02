# Hashtree references

`draft`

This document defines `htree` references for files and directories inside
content-addressed Hashtree manifests. Blossom is one way to retrieve the
referenced stored bytes.

Clients and gateways resolve `htree` references. Blossom servers only store the referenced blobs.

This specification depends on [CHK encryption](01-chk-encryption.md), [Directory manifests](02-directory-manifests.md), and [Chunked files and directory fanout](03-chunked-files-and-fanout.md).

## Rationale

`blossom:` URIs address one immutable blob.

Hashtree references address a path inside a tree. The root can be mutable, using an owner's `npub` and tree name, or immutable, using an `nhash`.

Mutable references are useful for websites, repositories, catalogs, backups, and app data where the current root changes. Immutable references are useful for snapshots and permalinks.

## Reference Forms

Clients SHOULD use:

```text
htree://<npub>/<tree-name>[/<path>]
htree://<nhash>[/<path>]
```

Applications MAY expose equivalent HTTP paths:

```text
/htree/<npub>/<tree-name>[/<path>]
/htree/<nhash>[/<path>]
```

Public HTTP storage endpoints serve raw stored blobs or ciphertext by default.
Clients perform logical tree traversal, file assembly, and decryption locally.
Server-side plaintext or logical tree serving requires an explicit application
allowlist; a gateway MUST NOT accept decryption keys in HTTP query strings or
request bodies for public content serving. The path spelling alone does not
authorize plaintext serving.

Schematic examples (the abbreviated identifiers are placeholders):

```text
htree://npub1example/photos/2026/summer.jpg
htree://npub1example/releases%2Fnostr-vpn/v0.3.0/app.zip
htree://nhash1example/docs/index.html
```

The `npub` form is mutable. The first segment after `npub` is the tree name. The remaining segments are the path inside that tree.

The `nhash` form is immutable. The `nhash` selects a content-addressed object.
When it identifies a directory or directory-fanout manifest, remaining segments
are the path inside that root. A raw blob or file manifest permits only an empty
remaining path. `nhash` does not encode an object type: the containing link or
application context determines whether bytes are a blob or a manifest. Clients
MUST NOT guess a raw blob's type merely because its bytes resemble MessagePack.

This specification does not define a bech32 form for mutable references.

## Path Encoding

Query strings and fragments are not part of the tree path.

Each path segment MUST be percent-encoded independently.

Clients MUST split paths into segments before percent-decoding. They MUST NOT percent-decode an entire path and then split on `/`.

A tree name is one logical segment. If the tree name contains `/`, that slash MUST be percent-encoded.

## Mutable Root Resolution

The mutable form resolves through a Nostr kind `30064` parameterized replaceable event:

- event author: NIP-19 pubkey decoded from `npub`
- `d` tag: tree name
- `hash` tag: 32 byte root manifest hash as 64 lowercase hex characters
- optional `l` tag: `hashtree`

Clients SHOULD publish new mutable roots as kind `30064`. For compatibility with older implementations, clients MAY also read kind `30078` events that otherwise match this section.

Clients MUST verify the event ID and signature before using a root event.
Clients SHOULD use the latest valid event for the author and `d` tag according
to Nostr replaceable event rules. If multiple valid events have the same
`created_at`, clients SHOULD use the one with the lexicographically lowest event
ID, as specified by [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md).

For mutable tree traversal, the root hash MUST identify a directory manifest
(`t = 2`), file manifest (`t = 1`), or directory-fanout manifest (`t = 3`).

## Visibility

Mutable root events define three visibility scopes.

Public roots either need no key, or publish the root key in a `key` tag as 64 lowercase hex characters. Anyone who can read the event can resolve the root.

Link-private roots publish:

- `encryptedKey`: `root_key XOR link_key`, as 64 lowercase hex characters
- `keyId`: first 8 bytes of `SHA256(link_key)`, as 16 lowercase hex characters

The `link_key` is 32 cryptographically random bytes. Link-private references
SHOULD carry it in the URL fragment as `#k=<64-lowercase-hex>` or in client-local
state, matching the current Hashtree sharing profile. Clients compute
`root_key = encryptedKey XOR link_key` and SHOULD verify `keyId` when present.

The original proposal also allowed `k=<link_key>` in an `htree` query string.
Clients MAY accept that compatibility form locally, but MUST remove the secret
before any HTTP request. Conflicting fragment and query secrets MUST be
rejected. An HTTP gateway MUST NOT interpret query parameters as decryption
keys for public content serving.

Owner-private roots publish `selfEncryptedKey`, containing the 64-character
lowercase root-key hex string encrypted to the event author using NIP-44
version 2. Only the owner can recover the root key.

Link-private roots MAY also publish `selfEncryptedKey` or `selfEncryptedLinkKey` so the owner can recover access without the shared link.

## Immutable Root Encoding

`nhash` is a Bech32 identifier (not Bech32m) with human-readable part `nhash`.

The payload is TLV encoded:

| Type | Meaning                      | Namespace                        | Required |
| ---- | ---------------------------- | -------------------------------- | -------- |
| `0`  | 32 byte root manifest hash   | NIP-19 `special` primary value   | yes      |
| `5`  | 32 byte root client-side key | [Hashtree references](04-references.md) local `nhash` assignment  | no       |

TLV records are encoded as:

```text
type: 1 byte
length: 1 byte
value: length bytes
```

Other TLV types are reserved for future `nhash` extensions. Types `1`, `2`, and `3` do not carry NIP-19 relay, author, or kind semantics in `nhash` unless a future revision explicitly defines them.

Type `5` is intentionally local to `nhash` so the optional root key is not confused with NIP-19 relay, author, or kind fields.

For compatibility, clients MAY decode legacy `nhash` values whose bech32 payload is exactly 32 bytes as the root manifest hash with no key. Any other payload length MUST be decoded as TLV.

## Tree Resolution

To resolve an `htree` reference:

1. Resolve the root from `npub` or `nhash`.
2. Fetch the root object's stored bytes and verify their SHA-256 hash.
3. Decrypt it locally using [CHK encryption](01-chk-encryption.md) if the root has a key.
4. For manifest traversal, decode and validate the root manifest. A raw blob
   with an empty path resolves directly to its plaintext bytes.
5. Traverse the path using [Directory manifests](02-directory-manifests.md) directory rules and [Chunked files and directory fanout](03-chunked-files-and-fanout.md) file manifest rules.
6. If a needed child object has a key, decrypt it locally using [CHK encryption](01-chk-encryption.md).

An empty path resolves to the root object.

Clients MUST reject invalid `npub`, invalid `nhash`, invalid percent encoding, missing mutable roots, duplicate directory names, unsupported link types, and hash or decryption failures.

## Security

Mutable references can change when the owner publishes a new root event. Clients that need a stable historical reference SHOULD use the `nhash` form.

An `nhash` that includes a key is a bearer secret. An `htree` reference with `k` is also a bearer secret.

Clients MUST NOT send `k` values to Blossom servers.

Clients SHOULD bound manifest size, recursion depth, and total bytes fetched.

## Reference implementation

See the [Rust and TypeScript implementations](https://github.com/mmalmi/hashtree).

## Test Vector

### `nhash` Without Key

```text
root_hash: abababababababababababababababababababababababababababababababab
payload: 0020abababababababababababababababababababababababababababababababab
nhash: nhash1qqs2h2at4w46h2at4w46h2at4w46h2at4w46h2at4w46h2at4w46h2cym3cqn
```
