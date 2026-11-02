# Hashtree specification

An implementation-independent specification for content-addressed files and
directories, optional per-object encryption, and mutable Nostr references.

This repository is the shared home for protocol review and interoperability
vectors. Rust, TypeScript, and other implementations can refer to the same
documents without depending on a particular library's API or release cycle.

[GitHub](https://github.com/mmalmi/hashtree-spec) · [Hashtree](https://git.iris.to/#/npub1xdhnr9mrv47kkrn95k6cwecearydeh8e895990n3acntwvmgk2dsdeeycm/hashtree-spec)

Rust and TypeScript libraries: [GitHub](https://github.com/mmalmi/hashtree) · [git.iris.to](https://git.iris.to/#/npub1xdhnr9mrv47kkrn95k6cwecearydeh8e895990n3acntwvmgk2dsdeeycm/hashtree)

Clone from either host:

```sh
git clone https://github.com/mmalmi/hashtree-spec.git
git clone htree://npub1xdhnr9mrv47kkrn95k6cwecearydeh8e895990n3acntwvmgk2dsdeeycm/hashtree-spec
```

## Status

**Draft.** This initial edition carries forward the latest Hashtree proposals
submitted as Blossom PRs #104–#107, reconciled with the current Hashtree
implementation. It is not an adopted Blossom Upgrade Document or Nostr standard.
The `htree` scheme, `nhash` prefix, media types, and kind `30064` remain
experimental assignments.

This edition adopts **33-byte suite-prefixed keys**, with deterministic
`chk-v1` and randomized `rnd-v1`, while retaining readers for legacy 32-byte
CHK keys and references. New writes use the versioned format. Encryption is
optional per object; libraries may continue encrypting by default.
See [migration and compatibility](specs/05-migration.md).

Implementations should identify the full specification commit they support.
The `main` branch is an evolving draft; a library version is not a protocol
version. Future incompatible changes need an explicit compatibility and
migration discussion before adoption.

## Specifications

| Document | Scope |
| --- | --- |
| [Object encryption](specs/01-chk-encryption.md) | Suite registry, CHK and randomized encryption, validation, and vectors |
| [Directory manifests](specs/02-directory-manifests.md) | Shared MessagePack encoding, canonical metadata, and named entries |
| [Chunked files and directory fanout](specs/03-chunked-files-and-fanout.md) | Ordered chunks, recursive files, and typed directory indexes |
| [References](specs/04-references.md) | `htree` URLs, `nhash`, Nostr roots, and visibility |

The capitalized requirement words in these documents use
[BCP 14](https://www.rfc-editor.org/info/bcp14).

## Storage and transport

An object's address is SHA-256 of its **stored bytes**, whether plaintext or
ciphertext. Clients construct, verify, decrypt, and traverse trees. Any storage
or peer transport that retrieves those bytes by hash can carry Hashtree.
The core format requires no DNS identity, HTTP server, or particular provider.

The documents retain the Blossom URI conventions from their source proposals.
Those are a transport integration: Blossom stores ordinary blobs and does not
need to understand Hashtree. Public storage endpoints receive no decryption
keys. Discovery, peer routing, library APIs, and application deployment are
outside this initial specification set.

## Test vectors

[Machine-readable vectors](test-vectors/spec-vectors.json) reproduce the bytes
and hashes in the specifications. With Node.js 20 or later, run:

```sh
node scripts/check.mjs
```

The check uses only Node's standard library. It independently encodes the
manifest vectors, reproduces CHK and randomized encryption, checks link-key masks and Bech32
reference, and checks document links and vector consistency. It is a focused
vector check, not a complete conformance suite for a library or transport.

## Implementations and collaboration

- [Hashtree Rust and TypeScript libraries](https://github.com/mmalmi/hashtree)
- [Contributing](CONTRIBUTING.md)

Protocol changes and additional implementations are welcome through pull
requests. Shared test vectors belong here; implementation code and API guides
remain with their libraries.

## Sources and extraction notes

The original proposals were authored by Martti Malmi and reviewed by hzrd149.
The exact imported revisions and SHA-256 digests are recorded in
[sources.json](sources.json).

| Original proposal | Imported revision |
| --- | --- |
| [#104: BUD-15](https://github.com/hzrd149/blossom/pull/104) | `ef6c7fb4435530556fb32345eec010505bda017a` |
| [#105: BUD-16](https://github.com/hzrd149/blossom/pull/105) | `2e0592995ada8220d4775e4f647ceb8f020a85c9` |
| [#106: BUD-17](https://github.com/hzrd149/blossom/pull/106) | `1848f77c4a25b70d10a3963d66ba1c8aba1e4f2c` |
| [#107: BUD-18](https://github.com/hzrd149/blossom/pull/107) | `018f3e32227cf8fd1fba8dff2d39d6e3370d2d52` |

This extraction updates titles and cross-links, makes the storage-independent
scope and optional encryption explicit, and preserves all eight proposal
vectors. It includes the latest recursive metadata canonicalization from #105.
The reference document corrects the equal-timestamp tie-break to the lowest
event ID, includes directory-fanout roots, and describes the current fragment
form for link secrets. It also distinguishes raw immutable blob references from
manifest traversal and states the existing public-serving boundary.

hzrd149's [separate rewrite](https://github.com/hzrd149/blossom/tree/hashtree/implementations/hashtree)
contributes the optional encryption suites adopted in this draft. The
[migration document](specs/05-migration.md) records the retained compatibility
and differences from that rewrite. The original PRs
retain their review history and have not been closed by this extraction.

## License

[Unlicense](LICENSE), continuing the source proposals' license.
