# Versioning and Stability

LibreDraw follows [Semantic Versioning](https://semver.org/). This page says what the
version number promises and which parts of the library that promise covers.

## The version promise

From 1.0.0 on:

- **Major** versions (2.0.0) are the only releases that break the public API.
- **Minor** versions (1.1.0) add to the public API without breaking it.
- **Patch** versions (1.0.1) fix bugs. A fix makes the library behave as these docs
  describe, even if code relied on the old behavior.

Before 1.0.0 (the current `0.x` releases), a minor version (0.18.0 → 0.19.0) may break the
public API and a patch version does not. Breaking changes are listed under "Breaking
changes" in the [release notes](https://github.com/sindicum/libre-draw/releases) with how
to migrate.

## What the public API is

The public API is what you can reach from the package entry point `@sindicum/libre-draw`:

- The [`LibreDraw`](/api/libre-draw) class: its constructor options, public methods,
  events with their payloads, and mode names.
- The types exported from the package, which describe those options, methods, and events
  (see the [API Reference](/api/)).
- [`LibreDrawError`](/api/types#libredrawerror), thrown for misuse of an instance.
- [`SOURCE_IDS`](/api/types#source-ids) and [`DEFAULT_LAYERS`](/api/types#default-layers),
  the sources your own layers read and the layers LibreDraw draws by default.
- The `libre-draw:` properties on the features those sources hold (`libre-draw:id`,
  `libre-draw:selected`, `libre-draw:handle`, ...), and the `hover` feature-state, which
  your layer definitions can use.
- The failure codes in `reason` of results and failure events.

## What is not part of the public API

These can change in any release:

- Modules that the package entry point does not export, such as files imported by path
  from `dist/`.
- The wording of `message` in results and of `LibreDrawError` messages. Compare `reason`,
  not the text.
- The toolbar's DOM structure and styling. Use the toolbar options, or
  [build your own UI](/guide/programmatic-api#building-your-own-ui) when you need control.

What the library does not support at all, and the conditions each operation needs, are
listed in [Known Limitations](/guide/limitations).

## What counts as a breaking change

Breaking, so only in a major version:

- Removing or renaming an export, method, option, event, mode name, or `libre-draw:`
  property.
- Changing the type of a parameter, a return value, or an event payload in a way that
  existing code no longer compiles against or reads correctly.
- Changing a default (an option's default value, or what a call does with default options).
- Removing a failure code, or reporting an existing failure under a different code.
- Dropping support for a MapLibre GL JS major version.

Not breaking, so possible in a minor version:

- Adding a method, an option, an event, a mode, or an exported type.
- Adding an optional field to an option, a result, or an event payload.
- Adding a failure code. Most failure reason types (the event reasons such as
  `SplitFailReason` and `EditRejectedReason`, and the `*OperationFailReason` types that
  include them) are open: handle unknown codes in a `default` branch.
- Adding a member to a closed union type such as `ModeName` or `RotateFailReason`. A
  `switch` that checks every member exhaustively may need a new case.
- Supporting a new MapLibre GL JS major version.
