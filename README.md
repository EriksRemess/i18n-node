# @eriksremess/i18n

Translation for Node.js 26+, with native ES modules, JSON catalogs, plural rules,
Mustache interpolation, and optional catalog updates. This is Ēriks Remess's fork
of [i18n-node](https://github.com/mashpie/i18n-node).

## Install

The package is hosted on GitHub Packages. Authenticate with a token that has
`read:packages` access:

```sh
npm login --scope=@eriksremess --auth-type=legacy --registry=https://npm.pkg.github.com
npm install @eriksremess/i18n
```

## Quick start

```js
import { I18n } from '@eriksremess/i18n'

const i18n = new I18n({
  defaultLocale: 'en',
  staticCatalog: {
    en: {
      greeting: 'Hello {{name}}',
      cats: { one: '%s cat', other: '%s cats' }
    },
    de: {
      greeting: 'Hallo {{name}}',
      cats: { one: '%s Katze', other: '%s Katzen' }
    }
  }
})

i18n.__('greeting', { name: 'Alice' }) // Hello Alice
i18n.setLocale('de')
i18n.__n('cats', 2) // 2 Katzen
```

For a shared singleton, use `import i18n from '@eriksremess/i18n'` and call
`i18n.configure(options)`. Named function exports use that same singleton.

## File catalogs

```js
import path from 'node:path'

i18n.configure({
  locales: ['en', 'de'],
  defaultLocale: 'en',
  directory: path.join(import.meta.dirname, 'locales'),
  updateFiles: false
})
```

Each locale is an object in a separate file, such as `locales/de.json`:

```json
{
  "greeting": "Hallo {{name}}",
  "cats": { "one": "%s Katze", "other": "%s Katzen" }
}
```

Omit `locales` to discover catalogs in an existing directory. With
`updateFiles: true` (the default), missing translations are written to disk.
With `false`, new phrases stay in memory. Malformed catalogs use a configured
fallback or the default locale; a failed reload preserves the last valid catalog.
Before overwriting a failed file, its contents are backed up to `.invalid`,
with numbered suffixes when needed.

`staticCatalog` supplies catalogs directly and disables filesystem reads, writes,
watching, and synchronization, including file loading through `addLocale()`.

## Request middleware

```js
i18n.configure({
  locales: ['en', 'de'],
  directory: './locales',
  updateFiles: false,
  queryParameter: 'lang',
  preserveLegacyCase: false
})

app.use(i18n.init)
app.get('/', (req, res) => res.send(req.__('greeting', { name: 'Alice' })))
```

`init(req, res, next)` attaches helpers to the request, response, and response
locals. Locale selection uses the configured query parameter, then a configured
cookie, then `Accept-Language`, then `defaultLocale`. Cookie support requires
middleware that populates `req.cookies`.

Use request-bound helpers for concurrent requests. A singleton's selected locale
and objects in `register` are shared state.

## API

| Method | Purpose |
| --- | --- |
| `__(phrase, ...values)` | Translate and interpolate a phrase. |
| `__({ phrase, locale }, ...values)` | Translate using an explicit locale. |
| `__n(phrase, count, ...values)` | Select a catalog plural form. |
| `__n(singular, plural, count, ...values)` | Supply defaults for missing plural forms. |
| `__n({ singular, plural, locale, count }, ...values)` | Set plural options explicitly; the count may also be the next argument. |
| `__l(phrase)` / `__h(phrase)` | Return translations across locales as a list / locale-keyed objects. |
| `setLocale(locale)` / `getLocale()` | Set / read the locale in the current scope. |
| `setLocale(object, locale, skipImplicitObjects?)` | Set an object's locale, optionally suppressing propagation to related objects. |
| `getLocales()` / `getCatalog(locale)` | List loaded locales / read a locale catalog. |
| `addLocale(locale)` / `removeLocale(locale)` | Load / remove an in-memory locale; removal leaves its file intact. |

`setLocale()` also accepts an array of objects. Calling `getCatalog()` without a
locale returns the current scope's catalog, or all catalogs when no locale is
selected.

## Translation syntax

- Positional values: `__('Hello %s', 'Alice')`. Supported specifiers are `%s`,
  `%d`, `%f`, precision such as `%.2f`, and positions such as `%2$s`.
- Named values: `__('Hello {{name}}', { name: 'Alice' })`. Mustache escapes HTML;
  triple braces render unescaped values. Sections and JavaScript lambdas are supported.
- Plurals: catalogs can contain `zero`, `one`, `two`, `few`, `many`, and
  `other`, selected using the effective locale's rules.
- Intervals: `'[0] none|[1,5] some|[6,] many|fallback'`. Signed numbers,
  decimals, exponents, open bounds, and multiline translations are supported.
- Nested keys: enable `objectNotation: true` and use `__('greeting.formal')`.
  Supply an inline default with `__('greeting.formal:Hello')`.

## Configuration

| Option | Default / behavior |
| --- | --- |
| `locales`, `directory` | Discover files; directory defaults to `locales` inside the installed module. Set an application directory explicitly. |
| `defaultLocale` | `'en'`. |
| `fallbacks` | Locale mappings, including wildcard keys such as `{ 'de-*': 'de' }`. |
| `retryInDefaultLocale` | `false`; reuse default-locale translations for missing phrases. |
| `staticCatalog` | An object mapping locale names to catalog objects. |
| `updateFiles`, `syncFiles`, `autoReload` | `true`, `false`, `false`, respectively. |
| `prefix`, `extension`, `indent` | `''`, `'.json'`, tab. Prefixes and extensions are literal strings. |
| `directoryPermissions` | Optional octal string, such as `'755'`, for new directories. |
| `parser` | `JSON`; accepts an object with `parse` and `stringify` methods. |
| `cookie`, `queryParameter` | Disabled until a name is configured. |
| `header` | `'accept-language'`. |
| `preserveLegacyCase` | `true` lowercases query locales; use `false` to preserve names such as `en-US`. |
| `objectNotation` | `false`; `true` uses dots, or supply a custom delimiter. |
| `mustacheConfig` | `{ tags: ['{{', '}}'], disable: false }`; delimiters must be nonempty strings. |
| `register` | An object or array of objects to receive bound helpers. |
| `api` | Helper aliases, such as `{ __: 't', __n: 'tn' }`. |
| `missingKeyFn(locale, value)` | Returns the value stored for a missing translation. |
| `logDebugFn`, `logWarnFn`, `logErrorFn` | Custom loggers; the error callback also receives the underlying error. |

Reconfiguration resets instance settings and registered locales. Locale names
must be nonempty and contain no path separators or null bytes; `.`, `..`,
`prototype`, and names inherited from `Object.prototype` are reserved.
Invalid explicit translation locales and `addLocale()` arguments throw.
Request selection and `setLocale()` fall back to the default locale.

Enable built-in logging with `DEBUG=i18n:*`, or select
`DEBUG=i18n:warn,i18n:error`.

## Development

```sh
npm ci
npm run lint
npm test
npm run test:coverage
node bench/vendors.js
node bench/runtime.js
```

The only runtime dependency is `make-plural`. Mustache.js 4.2.0 and
math-interval-parser 2.0.1 are vendored as modernized ES modules under `lib/`,
with their MIT licenses. The internal Mustache module exposes only rendering;
i18n does not supply partial templates. Tests include the applicable official
Mustache fixtures, JavaScript lambdas, interval boundaries, and i18n regressions.

The benchmarks report median throughput over five rounds. Optional
`MUSTACHE_BASELINE` and `INTERVAL_BASELINE` environment variables point to local
copies of the original module entry points for comparison.
`I18N_BASELINE` points to another checkout's `index.js` for the runtime benchmark,
which includes repeated translations, rotating messages, and interval cache misses.
For the full-library comparison, run `npm ci --prefix bench`, then `npm run bench`.

## Authors and license

Maintained by **Ēriks Remess**. Originally created by **Marcus Spiegel** and
the i18n-node contributors. Third-party attribution is retained in
`lib/mustache.LICENSE`, `lib/math-interval-parser.LICENSE`, and the test fixture license.

[MIT license](LICENSE) · [Fork changelog](CHANGELOG.md)
