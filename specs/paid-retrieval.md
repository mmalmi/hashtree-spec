# Paid retrieval

`draft`

This document defines an optional exchange in which a client pays a provider for the blobs it retrieves by hash. A provider or client that does not implement it is unaffected: ordinary retrieval, the stored bytes, and what a hash identifies do not change.

The exchange does not depend on how its messages are carried or on how a provider stores data. Payment is made with [Cashu](https://github.com/cashubtc/nuts) tokens. Amounts are in millisatoshi (`msat`) unless a field says `sat`.

## Overview

A client holds an **account** with each provider it pays, which the provider maps to a balance. The balance is everything credited from payments minus everything charged for delivered blobs. On a carrier that authenticates the client, the account is the client's identity. Elsewhere it is a random 32-byte id that the client names in every request. Most requests are one round trip against the balance; a payment is needed only when the balance runs out, and it rides with the next request.

```text
client                                   provider
  get {h, a?, x}           ---------->   has the blob, price <= x, balance covers it
                           <----------   data {h, n, c, b} + n raw bytes

  get {h, a?, x}           ---------->   balance too low, or price > x
                           <----------   quote {h, n, c, b, g, r, f, m, k, u, o?}
  get {h, a?, x, i, k, m, v} -------->   credits the payment, then charges
                           <----------   data {h, n, c, b, i, v} + n raw bytes
```

The hash is the proof of delivery: a client counts a charge only for bytes that hash to the name it asked for. There is no fair exchange. A client that pays before delivery risks at most the balance it chose to hold with that provider; a provider that serves before payment risks at most the grace it chose to give.

## Encoding

Every message is one bencoded dictionary, as in [BEP 3](https://www.bittorrent.org/beps/bep_0003.html). A `data` message is followed directly by the raw bytes of the blob; no other message has trailing bytes.

Messages have exactly one encoding:

- Dictionary keys are byte strings in ascending order of their raw bytes, with no duplicates.
- Integers have no leading zeros and no `-0`, and fit a signed 64-bit integer.
- Encoders MUST produce this form. Decoders MUST reject anything else, including a dictionary that ends before the message does (except `data`) and a `data` message whose trailing length differs from `n`.

A sender whose value exceeds the largest signed 64-bit integer MUST send that largest integer instead.

Decoders MUST ignore dictionary keys they do not know.

| Limit | Value |
| --- | --- |
| Dictionary, in bytes | `65536` |
| Nesting depth of lists and dictionaries inside the message dictionary | `4` |
| Blob (`n`), in bytes | `16777216` |
| Mint URL, in bytes | `512` |
| Token (`v` in `pay` or `get`), in bytes | `49152` |
| Entries in `m` or `k` of a `quote` | `16` |
| Other text fields, in bytes | `256` |

A decoder MUST reject a message that exceeds a limit. Text fields are UTF-8.

## Hash names

`h` is the digest that names a blob. It is the SHA-256 of the stored bytes, 32 bytes long, and then `y` MUST be absent. A carrier for data that is named by another hash function states the function in `y` and its digest in `h`. The only other value defined is `y` = `sha1` with a 20-byte digest, for BitTorrent v1 pieces. A decoder MUST reject a digest whose length does not match its function, an unknown `y`, and `y` = `sha256`.

Whoever fetches a blob verifies it against its name. The exchange only carries the name.

## Messages

The key `t` holds the message type. Requests are `get` and `pay`; replies are `data`, `quote`, `none`, `paid` and `err`. Every request is answered by exactly one reply.

### `get`

| Key | Type | Meaning |
| --- | --- | --- |
| `a` | 32 bytes | Account id. Absent on a carrier that authenticates the client. |
| `h` | bytes | Hash name of the blob, with `y` if not SHA-256. |
| `x` | int | Largest amount in msat the provider may charge for this blob. |
| `l` | int | Hop budget: how many more times the request may be forwarded, `1` to `10`. Absent means `0`; `0` MUST NOT be sent. |
| `i`, `k`, `m`, `v` | | A payment carried by the request, with the meanings they have in `pay`. All four or none. |

### `data`

| Key | Type | Meaning |
| --- | --- | --- |
| `h` | bytes | Hash name of the blob, with `y` if not SHA-256. |
| `n` | int | Length of the blob that follows. |
| `c` | int | Price of this blob in msat. |
| `b` | int | Account balance in msat after this reply. May be negative. |
| `d` | int | Present and `1` when this is a free repeat: `c` repeats an earlier charge and nothing new was charged. Absent otherwise. A receiver treats `0` as absent and any other value as `1`. |
| `i`, `v` | 16 bytes, int | The payment id and the msat credited for a payment that the request carried. Both or neither. |

### `quote`

Sent instead of `data` when the provider has the blob and will not serve it without payment or authorisation.

| Key | Type | Meaning |
| --- | --- | --- |
| `h` | bytes | Hash name of the blob, with `y` if not SHA-256. |
| `n` | int | Size of the blob in bytes. |
| `c` | int | Price of the blob in msat. |
| `b` | int | Account balance in msat. May be negative. |
| `g` | int | Grace: msat this provider serves to this client before payment. |
| `r` | list of two ints | Tariff rate `[msat, per_bytes]`. |
| `f` | int | Tariff minimum per blob in msat. |
| `m` | list of text | URLs of the mints whose tokens the provider accepts. |
| `k` | list of text | Payment methods the provider accepts. |
| `u` | int | Smallest payment the provider accepts, in sat. |
| `o` | 33 bytes | Optional. Compressed public key that tokens paid to this provider should be locked to ([NUT-11](https://github.com/cashubtc/nuts/blob/main/11.md)). |
| `i`, `v` | 16 bytes, int | As in `data`, for a carried payment that was credited but did not cover the blob. |

### `none`

| Key | Type | Meaning |
| --- | --- | --- |
| `h` | bytes | Hash name, with `y` if not SHA-256. |

`none` says only that this provider has no data for the name. It is not evidence that the blob does not exist, and a client MUST NOT cache it as such.

### `pay`

| Key | Type | Meaning |
| --- | --- | --- |
| `a` | 32 bytes | Account id to credit. Absent on a carrier that authenticates the client. |
| `i` | 16 bytes | Payment id, chosen at random by the client for this payment. |
| `k` | text | Payment method. |
| `m` | text | URL of the mint that issued the token. |
| `v` | text | The payment. For `cashu`, a serialized Cashu token in unit `sat`. |

The only method defined is `cashu`. A client normally carries a payment in its next `get`; `pay` serves to resend a payment whose answer was lost, and carriers that sell something other than blobs.

### `paid`

| Key | Type | Meaning |
| --- | --- | --- |
| `i` | 16 bytes | The payment id. |
| `v` | int | Amount credited for this payment, in msat. |
| `b` | int | Account balance in msat after the credit. |

### `err`

| Key | Type | Meaning |
| --- | --- | --- |
| `r` | text | Reason code. |
| `d` | text | Detail for a person; at most 64 characters when sent. |
| `i` | 16 bytes | The payment id, when the error answers a `pay`. |

| Code | Meaning | The same request later |
| --- | --- | --- |
| `bad` | The request could not be understood. | will fail again |
| `mint` | The mint is not accepted. The token was not redeemed. | will fail again |
| `method` | The payment method is not supported. | will fail again |
| `invalid` | The token was refused: spent, malformed, or from another mint. | will fail again |
| `replay` | The token was already credited under another payment id or account. | will fail again |
| `full` | The provider cannot open another account now. The token was not redeemed. | may succeed |
| `retry` | The provider could not complete the request now. | may succeed |

A client MUST treat a code it does not know as one that will fail again.

## Price

A tariff is a rate `[msat, per_bytes]` and a minimum `f`. The price of a blob of `n` bytes is

```text
max(f, ceil(n * msat / per_bytes))
```

computed without overflow. A `per_bytes` of `0` is read as `1`. A Cashu token of `s` sat credits `1000 * s` msat.

## Provider behavior

A request that names an account is charged to that account. One that names none is charged to an account the provider derives from the identity its carrier authenticated; without such an identity the provider answers `bad`.

For a `get`:

1. If the provider has no data for `h`, it replies `none` and does not touch a carried payment. A provider that looks further passes the hop budget `l` on, less one hop for each forward.
2. If the request carries a payment, the provider credits it as for a `pay` (below). If that fails, the provider answers with the `err` that a `pay` would get, with `i`, and charges nothing. Otherwise it includes `i` and `v` in its reply.
3. If the account was charged for this blob recently, the provider MAY serve it again without a new charge: `data` with the original `c` and `d` = `1`. How long and how often is the provider's choice.
4. If the price is `0`, the provider replies `data` with `c` = `0`. No account is needed.
5. If the price is above `x`, or above the balance plus the grace the provider gives this client, the provider replies `quote` and charges nothing.
6. Otherwise the provider charges the price to the account and replies `data`.

A provider MUST NOT charge more than `x`, MUST NOT charge for a blob it does not send, and MUST send bytes that match `h`.

A provider SHOULD give grace only to a client that its carrier authenticates, and to one account per such client. With `g` = `0` a provider serves only from a positive balance.

A provider that names a lock key `o` accepts tokens locked to it and MAY also accept unlocked tokens.

For a `pay`:

1. A provider MUST refuse a method it does not support (`method`) and a mint it does not list (`mint`) without redeeming the token. Mint URLs are compared after removing trailing `/`.
2. If the payment id was already credited to this account, the provider MUST answer with the same `paid` again and MUST NOT redeem or credit anything.
3. If the token was already credited under another payment id or another account, the provider MUST answer `replay`.
4. Otherwise the provider redeems the token at its mint and credits what it actually received, which may be less than the token's face value when the mint charges a fee. It MUST NOT credit a token that it did not redeem, or one that turned out to belong to a mint it does not list.
5. A redemption that has started MUST be completed and credited even if the client's connection is lost, so that the client's repeated `pay` is answered from the record.

A provider SHOULD keep balances, credited payment ids and the hashes of credited tokens across restarts, and write a credit durably before it sends `paid`.

## Client behavior

A client MUST verify that received bytes hash to the name it asked for. Bytes that do not are not a delivery: the client MUST NOT use them and MUST NOT count their charge as explained.

A client keeps its own record of what it paid and what it was charged for verified blobs, and compares it with the balance the provider reports. A balance lower than that record explains is a loss. A client SHOULD stop paying a provider whose losses pass a limit it has set, and SHOULD limit what one provider may hold in advance and what it spends in total.

A client that has sent a token and has no answer for it (a `paid`, or a reply with its `i` and `v`) MUST keep the token and send it again with the same payment id, carried or in a `pay`, before it pays that provider anything else. It SHOULD record a payment durably before sending it. A client SHOULD let only one request at a time carry a given token.

A client accounts a credit in a `data` or `quote` reply exactly as a `paid`.

A client MUST NOT trust a mint because a provider lists it. It pays only with mints it has chosen itself.

A reply to a request that was sent before the client's latest acknowledged payment may predate that credit. A client SHOULD ignore the balance in such a reply.

The account id is a bearer credential: whoever knows it can spend the balance. A client MUST send it only over a carrier that keeps it confidential, or keep the balance small where that is not possible. A client SHOULD lock tokens to a provider's key `o` when its wallet can.

## Carriers

A carrier delivers one request to one provider and returns its reply. A failure of the carrier, a timeout included, is an error and never a `none`.

### Byte streams

On a reliable byte stream each message is preceded by its length as a 32-bit big-endian integer. A length above `16842752` (the largest blob plus the largest dictionary) MUST be rejected. Replies are sent in the order of their requests. A connection may carry any number of exchanges.

### FIPS

Over FIPS the exchange is the TCP/FIPS service on port `39020`, advertised as the capability `hashtree.paid-blob/1`, with the byte-stream framing above. FIPS authenticates both ends, so requests name no account and the client's identity is its account; the provider can give grace to that identity. The free blob service and its wire format are separate and unchanged.

### BitTorrent

This section is informative; no implementation exists. A peer advertises `ht_pay` in the `m` dictionary of the [BEP 10](https://www.bittorrent.org/beps/bep_0010.html) extended handshake, and each message is the payload of one extended message. `get` and `data` can carry any hash-named block; a BitTorrent v2 16 KiB block has the same SHA-256 as the equal Hashtree blob. Alternatively `quote`, `pay` and `paid` gate the native `request` and `piece` messages, with `h` naming the piece (`y` = `sha1` for a v1 piece) and the piece hash check as the proof of delivery.

### HTTP

An HTTP mapping is being implemented and is not part of this draft yet. It is expected to carry these messages over one endpoint, and to answer clients that do not know this exchange with the `402` flow of Blossom BUD-07 and Cashu NUT-24.

## Security considerations

- **No fair exchange.** A provider can take a payment and deliver nothing. The client's loss is bounded by the balance it lets one provider hold and by its own total limit, and it is detectable from the reported balance.
- **Mint trust.** A token is a claim on its mint. A provider that lists a mint and a client that pays with it both trust that mint to honor its tokens.
- **Bearer credentials.** Account ids and unredeemed tokens are secrets in transit and at rest.
- **Linkability.** Requests under one account id are linkable by the provider. A client that wants unlinkable retrieval uses separate accounts, at the cost of separate balances.
- **Unpaid work.** An unpaid `get` makes a provider look up a blob and reveals in the reply whether it has it and how large it is. Providers SHOULD bound unpaid requests.

## Test vectors

Account id `000102...1f`, payment id `f0f1...ff`, SHA-256 name `8081...9f`, SHA-1 name `4041...53`.

`get` for a SHA-256 name, authorising 16384 msat:

```text
wire: 64313a6133323a000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f313a6833323a808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f313a74333a676574313a786931363338346565
```

`get` for a SHA-1 name, authorising 1 msat:

```text
wire: 64313a6133323a000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f313a6832303a404142434445464748494a4b4c4d4e4f50515253313a74333a676574313a78693165313a79343a7368613165
```

`pay` with method `cashu`, mint `https://mint.test` and the token text `cashuBexample`:

```text
wire: 64313a6133323a000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f313a6931363af0f1f2f3f4f5f6f7f8f9fafbfcfdfeff313a6b353a6361736875313a6d31373a68747470733a2f2f6d696e742e74657374313a74333a706179313a7631333a6361736875426578616d706c6565
```

`quote`: size 2097152, price 2048, balance 100, grace 0, rate `[1, 1024]`, minimum 1000, one mint, method `cashu`, smallest payment 1 sat:

```text
wire: 64313a626931303065313a63693230343865313a66693130303065313a67693065313a6833323a808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f313a6b6c353a636173687565313a6d6c31373a68747470733a2f2f6d696e742e7465737465313a6e693230393731353265313a726c69316569313032346565313a74353a71756f7465313a7569316565
```

`data`: charged 2048, balance 2952, followed by the ten bytes `blob bytes`:

```text
wire: 64313a62693239353265313a63693230343865313a6833323a808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f313a6e69313065313a74343a6461746165626c6f62206279746573
```

`data` as a free repeat on an account in debt: `c` = 1000, `b` = -1000, `d` = 1, followed by the six bytes `000102ff6564`:

```text
wire: 64313a62692d3130303065313a63693130303065313a64693165313a6833323a808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f313a6e693665313a74343a6461746165000102ff6564
```

`none`:

```text
wire: 64313a6833323a808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f313a74343a6e6f6e6565
```

`paid`: credited 5000, balance 5000:

```text
wire: 64313a62693530303065313a6931363af0f1f2f3f4f5f6f7f8f9fafbfcfdfeff313a74343a70616964313a7669353030306565
```

`err` with code `replay` and detail `why: replay`:

```text
wire: 64313a6431313a7768793a207265706c6179313a6931363af0f1f2f3f4f5f6f7f8f9fafbfcfdfeff313a72363a7265706c6179313a74333a65727265
```

`get` on an authenticated carrier, with hop budget 3, authorising 4096 msat and carrying the payment above:

```text
wire: 64313a6833323a808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f313a6931363af0f1f2f3f4f5f6f7f8f9fafbfcfdfeff313a6b353a6361736875313a6c693365313a6d31373a68747470733a2f2f6d696e742e74657374313a74333a676574313a7631333a6361736875426578616d706c65313a7869343039366565
```

`pay` on an authenticated carrier:

```text
wire: 64313a6931363af0f1f2f3f4f5f6f7f8f9fafbfcfdfeff313a6b353a6361736875313a6d31373a68747470733a2f2f6d696e742e74657374313a74333a706179313a7631333a6361736875426578616d706c6565
```

`data` for a request that carried a payment: credited 5000, charged 1000, balance 4000, followed by the four bytes `paid`:

```text
wire: 64313a62693430303065313a63693130303065313a6833323a808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f313a6931363af0f1f2f3f4f5f6f7f8f9fafbfcfdfeff313a6e693465313a74343a64617461313a766935303030656570616964
```

`quote` as above, with lock key `02` repeated 33 times and a carried payment credited 1000:

```text
wire: 64313a626931303065313a63693230343865313a66693130303065313a67693065313a6833323a808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f313a6931363af0f1f2f3f4f5f6f7f8f9fafbfcfdfeff313a6b6c353a636173687565313a6d6c31373a68747470733a2f2f6d696e742e7465737465313a6e693230393731353265313a6f33333a020202020202020202020202020202020202020202020202020202020202020202313a726c69316569313032346565313a74353a71756f7465313a75693165313a7669313030306565
```

Prices:

| Rate | Minimum | Bytes | Price |
| --- | --- | --- | --- |
| `[1, 1024]` | `5` | `6145` | `price_msat: 7` |
| `[1, 1024]` | `1000` | `2097152` | `price_msat: 2048` |
| `[7, 3]` | `0` | `10` | `price_msat: 24` |

## Implementations

The Rust crate `hashtree-paid-retrieval` and the TypeScript package `@hashtree/paid-retrieval` in the [Hashtree libraries](https://github.com/mmalmi/hashtree) implement this draft and share a larger set of vectors, including every limit, in `test-vectors/paid-retrieval-vectors.json` there. The Rust crate implements both sides and the stream and FIPS carriers; the TypeScript package implements the client.
