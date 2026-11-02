# Contributing

Open an issue for a protocol question or a pull request for a concrete change.
Contributors from every implementation are welcome. Keep wire requirements
separate from library conveniences and application defaults.

For a behavior change, describe which existing bytes, references, and readers
it affects. Include byte-level test vectors, reader and writer behavior, and a
migration plan for incompatible changes. Do not silently replace historical
vectors or change what an existing content hash identifies.

Run `node scripts/check.mjs` before submitting. When a change affects a library,
include the relevant implementation test evidence as well; passing the vector
check alone does not establish complete conformance.

Source proposals and prior review should remain linked. Contribution review
does not imply adoption by Blossom, Nostr, or every Hashtree implementation.
Contributions are made under the repository's Unlicense.
