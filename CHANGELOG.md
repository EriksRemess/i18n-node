# Changelog

Changes to [Ēriks Remess's i18n-node fork](https://github.com/EriksRemess/i18n-node),
published as `@eriksremess/i18n`. Earlier upstream history is available in
[mashpie/i18n-node](https://github.com/mashpie/i18n-node).

## 0.16.0

### Changed

- Vendor Mustache.js 4.2.0 and math-interval-parser 2.0.1 as Node.js 26+ ES modules,
  retaining their MIT licenses. `make-plural` is the only runtime dependency.
- Bound Mustache template caches, accelerate repeated rendering and text parsing,
  and add reproducible benchmarks plus official Mustache compatibility fixtures.
- Speed up nested catalog reads, named interpolation, and repeated interval
  selection; share bounded message caches and modernize internal helpers.
- Limit the internal Mustache module to rendering; remove package metadata,
  public parser classes, cache and escape customization, and unused partial loading.
- Update make-plural, ESLint, YAML, and compatible development dependencies.
- Remove unused examples, Express, cookie-parser, and the unused Prettier config.
- Shorten the README, update maintainer attribution, remove funding links and
  metadata, and replace obsolete ignore rules.

### Fixed

- Handle structured query values, fragments, and malformed request URLs without crashing;
  respect header quality weights and case-insensitive language matching.
- Prevent fallback cycles from skipping requested languages and stop recursive
  default-locale retries and duplicate missing-key callbacks. Preserve inline
  defaults during retries.
- Use region-specific plural rules, preserve empty translations, and keep named
  values out of positional arguments in object-style plural calls.
- Support signed and fractional intervals, multiline text, and leading fallback
  text; reject malformed or partially matched interval input.
- Keep static catalogs independent of disk files, discover literal filename
  prefixes and extensions, and update file watching when locales are added or removed.
- Handle primitive branches in nested catalogs and accept a null parser option.
- Fix Mustache cache-key collisions, prototype-shaped names, null contexts,
  and dotted-name context precedence.
- Prevent excessive backtracking in whitespace-heavy interval and Mustache input.
- Validate and copy configured Mustache delimiters to prevent caller mutations
  from changing an instance's rendering behavior.

## 0.15.5 — 2026-09-06

- Harden locale validation, path containment, and handling of inherited property names.
- Recover missing or malformed catalogs through fallbacks and in-memory defaults.
  Preserve last valid catalogs and create collision-safe backups before replacement.
- Fix plural fallback selection, short-form plural arguments, reconfiguration of
  registered scopes, and nested missing-key callbacks.
- Add regression tests and update ESLint.

## 0.15.4 — 2026-07-31

- Publish the fork as `@eriksremess/i18n` on GitHub Packages with a release workflow.
- Target Node.js 26+, use native ES modules, and expose instance and singleton APIs.
- Replace legacy tooling with npm, flat ESLint configuration, and the Node.js test runner.
- Add local debug and printf helpers, bounded translation caches, and benchmarks.
- Remove MessageFormat and the `__mf()` API.
