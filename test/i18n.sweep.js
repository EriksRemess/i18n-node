import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { I18n } from '#i18n'

describe('request and translation edge cases', () => {
  it('rebinds installed helpers when a scope is registered with a different instance', () => {
    const helper = () => 'application helper'
    const register = { __h: helper }
    new I18n({ staticCatalog: { en: { label: 'first' } }, register })
    new I18n({ staticCatalog: { en: { label: 'second' } }, register })
    assert.equal(register.__('label'), 'second')
    assert.equal(register.__h, helper)
  })

  it('binds inherited i18n helpers to each request and respects remapped aliases', () => {
    const prototype = {}
    const staticCatalog = { en: { items: { one: 'item', other: 'items' } }, fr: { items: 'articles' } }
    const i18n = new I18n({ staticCatalog, register: prototype, api: { __: 't', __n: 'tn' } })
    const request = Object.create(prototype)
    i18n.init(request)
    i18n.setLocale(request, 'fr', true)
    assert.equal(request.t('items'), 'articles')
    assert.equal(prototype.t('items'), 'item')
    i18n.configure({ staticCatalog, register: prototype, api: { __: 'tn', __n: 't' } })
    assert.equal(prototype.t('items', 2), 'items')
  })

  it('follows a requested mapping to the default locale and its loaded fallback', () => {
    const i18n = new I18n({ defaultLocale: 'fr-CA',
      fallbacks: { xx: 'fr-CA', 'fr-CA': 'fr' }, staticCatalog: { fr: { hello: 'Bonjour' } } })
    assert.equal(i18n.__({ locale: 'xx', phrase: 'hello' }), 'Bonjour')
  })

  it('assigns the root locale once when propagating it to related scopes', () => {
    const i18n = new I18n({ staticCatalog: { en: {}, fr: {} } })
    const values = []
    const scope = { locals: {}, get locale() { return values.at(-1) }, set locale(value) { values.push(value) } }
    assert.equal(i18n.setLocale(scope, 'fr'), 'fr')
    assert.deepEqual(values, ['fr'])
    assert.equal(scope.locals.locale, 'fr')
  })

  it('uses the closest catalog for language tags that contain a script and region', () => {
    const i18n = new I18n({ staticCatalog: { en: {}, zh: {}, 'zh-Hant': {} } })
    const request = { headers: { 'accept-language': 'zh-Hant-TW' } }
    i18n.init(request)
    assert.equal(request.locale, 'zh-Hant')
  })

  it('supports colon-containing object-notation separators with inline defaults', () => {
    for (const separator of ['::', '/:/']) {
      const i18n = new I18n({ staticCatalog: { en: { menu: { open: 'Open' } } }, objectNotation: separator })
      assert.equal(i18n.__('menu' + separator + 'open'), 'Open')
      assert.equal(i18n.__n('menu' + separator + 'one:one', 'menu' + separator + 'many:many', 3), 'many')
      assert.deepEqual(i18n.getCatalog('en').menu.one, { one: 'one', other: 'many' })
    }
  })

  it('uses the configured fallback for the default locale after an unknown locale misses', () => {
    const i18n = new I18n({ defaultLocale: 'fr-CA', fallbacks: { 'fr-CA': 'fr' },
      staticCatalog: { fr: { items: { one: '%s article', other: '%s articles' } } } })
    assert.equal(i18n.__n({ locale: 'xx', singular: 'items', plural: 'items', count: 0 }), '0 article')
    assert.deepEqual(i18n.getLocales(), ['fr'])
  })

  it('reads a parsed locale query without requiring the original URL', () => {
    const i18n = new I18n({ staticCatalog: { en: {}, fr: {} }, queryParameter: 'lang' })
    const request = { query: { lang: 'fr' } }
    i18n.init(request)
    assert.equal(request.locale, 'fr')
  })

  it('attaches helpers to replacement response locals on repeated initialization', () => {
    const i18n = new I18n({ staticCatalog: { en: {}, fr: { hello: 'Bonjour' } } })
    const request = { headers: { 'accept-language': 'fr' } }
    const response = { locals: {} }
    i18n.init(request, response)
    response.locals = {}
    i18n.init(request, response)
    assert.equal(response.locals.__('hello'), 'Bonjour')
  })

  it('propagates a locale through linked scopes once, including cycles', () => {
    const i18n = new I18n({ staticCatalog: { en: {}, fr: { hello: 'Bonjour' } } })
    const scope = { locals: { locals: {} } }
    scope.locals.locals.locals = scope
    i18n.init(scope)
    scope.setLocale('fr')
    assert.equal(scope.locals.locals.__('hello'), 'Bonjour')
  })

  it('uses the default locale even when a catalog is named "undefined"', () => {
    const i18n = new I18n({ staticCatalog: {
      en: { hello: 'Hello', items: { other: 'items' } },
      undefined: { hello: 'wrong', items: { other: 'wrong' } }
    } })
    assert.equal(i18n.__('hello'), 'Hello')
    assert.equal(i18n.__n('items', 2), 'items')
    assert.equal(i18n.__({ locale: 'undefined', phrase: 'hello' }), 'wrong')
  })

  it('selects a string locale when a cookie contains structured data', () => {
    const i18n = new I18n({ staticCatalog: { en: {}, fr: {} }, cookie: 'lang' })
    for (const lang of [['fr'], Object.create(null)]) {
      const request = { cookies: { lang } }
      i18n.init(request)
      assert.equal(request.getLocale(), 'en')
      request.headers = { 'accept-language': 'fr' }
      i18n.init(request)
      assert.equal(request.language, 'fr')
      assert.equal(request.getLocale(), 'fr')
    }
  })

  it('matches explicit and wildcard language fallbacks case-insensitively in headers', () => {
    const i18n = new I18n({
      staticCatalog: { en: {}, fr: {}, de: {} },
      fallbacks: { 'fr-*': 'de', 'fr-BE': 'fr' }
    })
    for (const [header, locale] of [['FR-be', 'fr'], ['FR-ch', 'de']]) {
      const request = { headers: { 'accept-language': header } }
      i18n.init(request)
      assert.equal(request.locale, locale)
    }
  })

  it('reads a mixed-case configured header from Node request headers', () => {
    const i18n = new I18n({ staticCatalog: { en: {}, fr: {} }, header: 'X-Language' })
    for (const header of ['x-language', 'X-Language']) {
      const request = { headers: { [header]: 'fr' } }
      i18n.init(request)
      assert.equal(request.locale, 'fr')
    }
  })

  it('honors skipImplicitObjects with a single registered scope', () => {
    const register = {}
    const i18n = new I18n({ staticCatalog: { en: {}, fr: {} }, register })
    const local = {}
    i18n.setLocale(local, 'fr', true)
    assert.equal(local.locale, 'fr')
    assert.equal(register.locale, 'en')
  })

  it('uses the full object-notation separator to recognize a trailing delimiter', () => {
    const i18n = new I18n({
      staticCatalog: { en: { 'label//': 'flat', label: { inner: 'nested' } } },
      objectNotation: '//'
    })
    assert.equal(i18n.__('label//'), 'flat')
    assert.equal(i18n.__('label//inner'), 'nested')
  })

  it('preserves explicitly empty inline defaults for flat and nested keys', () => {
    const i18n = new I18n({ staticCatalog: { en: {} }, objectNotation: true })
    for (const prefix of ['', 'menu.']) {
      assert.equal(i18n.__(prefix + 'label:'), '')
      assert.equal(i18n.__n(prefix + 'one:', prefix + 'many:', 2), '')
      assert.equal(i18n.__n(prefix + 'one', 1), '')
    }
  })

  it('accepts numeric string counts in unambiguous short plural calls', () => {
    const i18n = new I18n({ staticCatalog: { en: {
      items: { one: '%s item', other: '%s items' },
      named: { one: '%s item {{name}}', other: '%s items {{name}}' }
    } } })
    for (const count of ['01', '1.00', '1e0']) {
      assert.equal(i18n.__n('items', count), '1 item')
      assert.equal(i18n.__n('named', count, { name: 'Alice' }), '1 item Alice')
    }
    assert.equal(i18n.__n('single', '01', 2), '01')
  })

  it('accepts the same numeric strings for inline and separate object plural counts', () => {
    const i18n = new I18n({ staticCatalog: { en: { item: { one: '%s item', other: '%s items' } } } })
    const options = { locale: 'en', singular: 'item', plural: 'items' }
    assert.equal(i18n.__n({ ...options, count: '01' }), '1 item')
    assert.equal(i18n.__n(options, '01'), '1 item')
  })

  it('accepts null-prototype named values alongside an inline plural count', () => {
    const i18n = new I18n({ staticCatalog: { en: {} } })
    const options = { locale: 'en', singular: '{{name}}', plural: '{{name}}', count: 2 }
    const named = Object.assign(Object.create(null), { name: 'Alice' })
    assert.equal(i18n.__n(options, named), 'Alice')
  })

  it('allows a missing-key callback to read the same flat phrase', () => {
    let calls = 0
    const i18n = new I18n({
      staticCatalog: { en: {} },
      missingKeyFn(locale, value) {
        assert.equal(++calls, 1)
        assert.deepEqual(i18n.__('label'), {})
        return value
      }
    })
    assert.equal(i18n.__('label'), 'label')
  })

  it('retries a nested missing-key callback after it throws', () => {
    let attempts = 0
    const i18n = new I18n({
      staticCatalog: { en: {} }, objectNotation: true,
      missingKeyFn(locale, value) {
        if (++attempts === 1) throw new Error('try again')
        return value
      }
    })
    assert.throws(() => i18n.__('menu.label:Hello'), /try again/)
    assert.equal(i18n.__('menu.label:Hello'), 'Hello')
    assert.equal(attempts, 2)
  })

  it('calls the missing-key callback once when it returns null for a plural', () => {
    for (const phrase of ['items', 'menu.items']) {
      const values = []
      const i18n = new I18n({
        staticCatalog: { en: {} }, objectNotation: true,
        missingKeyFn(locale, value) { values.push(value); return null }
      })
      assert.equal(i18n.__n(phrase, 2), null)
      assert.deepEqual(values, [{ one: phrase, other: phrase }])
    }
  })

  it('ignores structured query values while selecting valid string values', () => {
    const i18n = new I18n({
      staticCatalog: { en: {}, fr: {} }, queryParameter: 'lang'
    })
    for (const lang of [[{}, 'fr'], [null, false, 1, '', 'fr'], { nested: 'fr' }]) {
      const request = {
        url: '/', query: { lang }, headers: { 'accept-language': 'fr' }
      }
      i18n.init(request)
      assert.equal(request.locale, 'fr')
    }
  })

  it('handles request paths that are not valid absolute URLs', () => {
    const i18n = new I18n({
      staticCatalog: { en: {}, fr: {} }, queryParameter: 'lang'
    })
    for (const url of ['//[?lang=fr', '//?lang=fr', 'http://[?lang=fr']) {
      const request = { url }
      i18n.init(request)
      assert.equal(request.locale, 'fr')
    }
  })

  it('ignores query-like fragment contents when selecting a locale', () => {
    const i18n = new I18n({
      staticCatalog: { en: {}, fr: {}, de: {} }, queryParameter: 'lang'
    })
    for (const [url, expected] of [
      ['/page#section?lang=fr', 'de'],
      ['/page#?lang=fr&lang=en', 'de'],
      ['/page#lang=fr', 'de'],
      ['/page?other=value#?lang=fr', 'de'],
      ['/page?lang=fr#section?lang=en', 'fr'],
      ['/page?lang=fr#&lang=de', 'fr'],
      ['/page?other=%23fragment&lang=fr', 'fr'],
      ['/page%23fragment?lang=fr', 'fr']
    ]) {
      const request = { url, headers: { 'accept-language': 'de' } }
      i18n.init(request)
      assert.equal(request.locale, expected, url)
    }
  })

  it('does not skip accepted languages when fallback rules point backwards', () => {
    for (const fallbacks of [{ aa: 'aa' }, { aa: 'bb', bb: 'aa' }]) {
      const i18n = new I18n({ staticCatalog: { en: {}, fr: {} }, fallbacks })
      const request = { headers: { 'accept-language': 'aa,fr;q=0.5' } }
      i18n.init(request)
      assert.equal(request.locale, 'fr')
    }
  })

  it('uses region-specific plural rules before language-level rules', () => {
    for (const locale of ['pt-PT', 'pt_PT', 'PT-pt']) {
      const i18n = new I18n({
        defaultLocale: locale,
        staticCatalog: { [locale]: { cats: { one: 'one', other: 'other' } } }
      })
      assert.equal(i18n.__n('cats', 0), 'other')
      assert.equal(i18n.__n('cats', 'cats', 1), 'one')
      assert.equal(i18n.__n('cats', 1.5), 'other')
    }
    const i18n = new I18n({
      defaultLocale: 'pt-BR',
      staticCatalog: { 'pt-BR': { cats: { one: 'one', other: 'other' } } }
    })
    assert.equal(i18n.__n('cats', 0), 'one')
  })

  it('preserves empty singular and plural translations in both __ signatures', () => {
    const i18n = new I18n({
      staticCatalog: { en: { empty: { one: '', other: 'other' }, other: { other: '' } } }
    })
    for (const phrase of ['empty', 'other']) {
      assert.equal(i18n.__(phrase), '')
      assert.equal(i18n.__({ phrase, locale: 'en' }), '')
    }
  })

  it('treats primitive object-notation branches as missing translations', () => {
    for (const phrase of ['a.length', 'a.0', 'a.0.b', 'a.length.b']) {
      const i18n = new I18n({ staticCatalog: { en: { a: 'text' } }, objectNotation: true })
      assert.equal(i18n.__(phrase), phrase)
      assert.equal(i18n.__(phrase), phrase)
      assert.equal(typeof i18n.getCatalog('en').a, 'object')
    }
  })

  it('accepts a null parser as the default JSON parser', () => {
    const i18n = new I18n({ staticCatalog: { en: {} }, parser: null })
    assert.equal(i18n.__('Hello'), 'Hello')
  })

  it('isolates configured Mustache delimiters from caller mutations', () => {
    const tags = ['<%', '%>']
    const i18n = new I18n({ staticCatalog: { en: {} }, mustacheConfig: { tags } })
    assert.equal(i18n.__('Hello <%name%>', { name: 'Alice' }), 'Hello Alice')
    tags[0] = '{{'
    tags[1] = '}}'
    assert.equal(i18n.__('Hello <%name%>', { name: 'Bob' }), 'Hello Bob')
  })

  it('rejects invalid Mustache delimiters at configuration time', () => {
    for (const tags of [[], ['x'], ['', ''], ['{{', null], ['a', 'b', 'c']]) {
      assert.throws(() => new I18n({ staticCatalog: { en: {} }, mustacheConfig: { tags } }), /two nonempty strings/)
    }
  })

  it('keeps inline defaults when retrying missing translations', () => {
    for (const key of ['title', 'greeting.title']) {
      const i18n = new I18n({
        staticCatalog: { en: {}, fr: {} }, objectNotation: true,
        retryInDefaultLocale: true
      })
      i18n.setLocale('fr')
      assert.equal(i18n.__(`${key}:Hello`), 'Hello')
      assert.equal(i18n.__n(`${key}Count:one cat`, `${key}Counts:many cats`, 2), 'many cats')
      i18n.setLocale('en')
      assert.equal(i18n.__(key), 'Hello')
    }
  })

  it('stops retrying when the default locale falls back to the current locale', () => {
    const i18n = new I18n({
      staticCatalog: { fr: {} }, fallbacks: { en: 'fr' },
      objectNotation: true, retryInDefaultLocale: true
    })
    assert.equal(i18n.__('Hello'), 'Hello')
    assert.equal(i18n.__('greeting.title:Title'), 'Title')
    assert.equal(i18n.__n('cat', 'cats', 2), 'cats')
    assert.equal(i18n.__n('pets.cat:cat', 'pets.cats:cats', 2), 'cats')
  })

  for (const objectNotation of [false, true]) {
    for (const plural of [false, true]) {
      it(`processes a missing ${objectNotation ? 'nested' : 'flat'} ${plural ? 'plural' : 'singular'} once in the resolved catalog`, () => {
        const calls = []
        const i18n = new I18n({
          staticCatalog: { fr: {} },
          defaultLocale: 'en',
          fallbacks: { en: 'fr' },
          retryInDefaultLocale: true,
          objectNotation,
          missingKeyFn(locale, value) {
            calls.push({ locale, value })
            return typeof value === 'string'
              ? `[${value}]`
              : { one: `[${value.one}]`, other: `[${value.other}]` }
          }
        })
        const singularKey = objectNotation ? 'pets.cat:cat' : 'cat'
        const pluralKey = objectNotation ? 'pets.cats:cats' : 'cats'
        const translate = () => plural
          ? i18n.__n(singularKey, pluralKey, 2)
          : i18n.__(singularKey)
        const expected = plural ? '[cats]' : '[cat]'
        assert.equal(translate(), expected)
        assert.equal(translate(), expected)
        assert.deepEqual(calls, [{
          locale: 'fr', value: plural ? { one: 'cat', other: 'cats' } : 'cat'
        }])
        const catalog = i18n.getCatalog('fr')
        assert.deepEqual(objectNotation ? catalog.pets.cat : catalog.cat,
          plural ? { one: '[cat]', other: '[cats]' } : '[cat]')
      })
    }
  }

  it('still retries a different resolved default catalog', () => {
    const calls = []
    const i18n = new I18n({
      staticCatalog: { fr: {}, de: { greeting: 'Hallo', pets: {
        cat: { one: 'Katze', other: 'Katzen' }
      } } },
      defaultLocale: 'en',
      fallbacks: { en: 'de' },
      retryInDefaultLocale: true,
      objectNotation: true,
      missingKeyFn(locale, value) {
        calls.push({ locale, value })
        return value
      }
    })
    i18n.setLocale('fr')
    assert.equal(i18n.__('greeting:Hello'), 'Hallo')
    assert.equal(i18n.__n('pets.cat:cat', 'pets.cats:cats', 2), 'Katzen')
    assert.deepEqual(calls, [
      { locale: 'fr', value: 'Hallo' },
      { locale: 'fr', value: { one: 'Katze', other: 'Katzen' } }
    ])
  })

  it('does not resolve a retry catalog for existing translations', () => {
    const warnings = []
    const i18n = new I18n({
      staticCatalog: { fr: { greeting: 'Bonjour', pets: {
        cat: { one: 'chat', other: 'chats' }
      } } },
      defaultLocale: 'en',
      fallbacks: { en: 'de' },
      retryInDefaultLocale: true,
      objectNotation: true,
      logWarnFn: (message) => warnings.push(message)
    })
    i18n.setLocale('fr')
    assert.equal(i18n.__('greeting'), 'Bonjour')
    assert.equal(i18n.__n('pets.cat', 'pets.cats', 2), 'chats')
    assert.deepEqual(i18n.getLocales(), ['fr'])
    assert.deepEqual(warnings, [])
  })

  it('keeps named values out of positional arguments in object plural calls', () => {
    const i18n = new I18n({
      staticCatalog: { en: { cat: { other: '%s cats for %s {{name}}' } } }
    })
    const phrase = { singular: 'cat', plural: 'cats', locale: 'en' }
    const named = { name: 'Alice' }
    assert.equal(i18n.__n(phrase, 2, named), '2 cats for %s Alice')
    assert.equal(i18n.__n({ ...phrase, count: 2 }, named), '2 cats for %s Alice')
    assert.equal(i18n.__n(phrase, 2, 'Bob', named), '2 cats for Bob Alice')
    assert.equal(i18n.__n({ ...phrase, count: 2 }, 'Bob', named), '2 cats for Bob Alice')
  })

  it('matches signed and fractional intervals and preserves multiline text', () => {
    const i18n = new I18n({ staticCatalog: { en: {
      range: '[-2,-1] below\nzero|[0,1.5] low\nvalue|other',
      invalid: '[1 2] invalid|fallback',
      leading: 'fallback|[0] zero',
      text: 'some [text]\nwith | plain pipes'
    } } })
    assert.equal(i18n.__n('range', -1), 'below\nzero')
    assert.equal(i18n.__n('range', 1.5), 'low\nvalue')
    assert.equal(i18n.__n('range', 2), 'other')
    assert.equal(i18n.__n('leading', 2), 'fallback')
    assert.equal(i18n.__n('invalid', 12), '[1 2] invalid|fallback')
    assert.equal(i18n.__('text'), 'some [text]\nwith | plain pipes')
  })

  it('honors header quality weights with whitespace and uppercase parameters', () => {
    const i18n = new I18n({ staticCatalog: { en: {}, fr: {} } })
    for (const header of ['fr; q=0.9,en; q=0.2', 'en;Q=0,fr;Q=0.5', 'fr;q=0.9,fr;q=0.1,en;q=0.5']) {
      const request = { headers: { 'accept-language': header } }
      i18n.init(request)
      assert.equal(request.locale, 'fr')
    }
  })

  it('matches header language tags case-insensitively while preserving catalog names', () => {
    const i18n = new I18n({ staticCatalog: { en: {}, 'fr-CA': {}, de: {} } })
    for (const [header, locale] of [['FR-ca', 'fr-CA'], ['DE-at', 'de']]) {
      const request = { headers: { 'accept-language': header } }
      i18n.init(request)
      assert.equal(request.locale, locale)
    }
  })
})

describe('catalog storage boundaries', () => {
  let directory
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-sweep-'))
  })
  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true })
  })

  it('reloads a default catalog that first existed only in memory', (t) => {
    let notify
    t.mock.method(fs, 'watch', (dir, options, listener) => {
      notify = listener
      return { close() {} }
    })
    const i18n = new I18n({ directory, locales: [], autoReload: true, updateFiles: false })
    assert.equal(i18n.__('label'), 'label')
    fs.writeFileSync(path.join(directory, 'en.json'), '{"label":"From disk"}')
    notify('rename', 'en.json')
    assert.equal(i18n.__('label'), 'From disk')
  })

  it('reloads a dynamically requested catalog after a transient read failure', (t) => {
    const file = path.join(directory, 'fr.json')
    fs.writeFileSync(file, '{"label":"Bonjour"}')
    let notify
    t.mock.method(fs, 'watch', (dir, options, listener) => {
      notify = listener
      return { close() {} }
    })
    const i18n = new I18n({ directory, locales: [], autoReload: true, updateFiles: false })
    const read = fs.readFileSync
    const mock = t.mock.method(fs, 'readFileSync', (name, ...args) => {
      if (name === file) throw new Error('temporarily unreadable')
      return read(name, ...args)
    })
    const phrase = { locale: 'fr', phrase: 'label' }
    assert.equal(i18n.__(phrase), 'label')
    mock.mock.restore()
    notify('change', 'fr.json')
    assert.equal(i18n.__(phrase), 'Bonjour')
  })

  it('preserves catalog file permissions across translation updates', { skip: process.platform === 'win32' }, () => {
    const file = path.join(directory, 'en.json')
    fs.writeFileSync(file, '{}', { mode: 0o600 })
    const i18n = new I18n({ directory })
    assert.equal(i18n.__('hello'), 'hello')
    assert.equal(fs.statSync(file).mode & 0o777, 0o600)
  })

  it('keeps an overlapping catalog save atomic and removes failed temporary writes', (t) => {
    const file = path.join(directory, 'en.json')
    fs.writeFileSync(file, '{}')
    const errors = []
    const first = new I18n({ directory, logErrorFn: (message, error) => errors.push(error) })
    const second = new I18n({ directory })
    const rename = fs.renameSync
    let overlap = true
    t.mock.method(fs, 'renameSync', (from, to) => {
      if (overlap) {
        overlap = false
        second.__('second')
      }
      rename(from, to)
    })
    first.__('first')
    assert.deepEqual(errors, [])
    assert.deepEqual(JSON.parse(fs.readFileSync(file)), { first: 'first' })
    t.mock.method(fs, 'renameSync', () => { throw new Error('write interrupted') })
    first.__('third')
    assert.equal(errors.at(-1).message, 'write interrupted')
    assert.deepEqual(JSON.parse(fs.readFileSync(file)), { first: 'first' })
    assert.deepEqual(fs.readdirSync(directory), ['en.json'])
  })

  it('creates missing parent directories for a new catalog', () => {
    const catalogs = path.join(directory, 'app', 'translations')
    const i18n = new I18n({ directory: catalogs })
    assert.equal(i18n.__('hello'), 'hello')
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(catalogs, 'en.json'))), { hello: 'hello' })
  })

  it('recovers a dynamically requested malformed catalog when its file is corrected', (t) => {
    let notify
    t.mock.method(fs, 'watch', (dir, options, listener) => {
      notify = listener
      return { close() {} }
    })
    const file = path.join(directory, 'fr.json')
    fs.writeFileSync(path.join(directory, 'en.json'), '{"hello":"Hello"}')
    fs.writeFileSync(file, '{')
    const i18n = new I18n({ directory, locales: ['en'], autoReload: true, updateFiles: false })
    const phrase = { locale: 'fr', phrase: 'hello' }
    assert.equal(i18n.__(phrase), 'Hello')
    fs.writeFileSync(file, '{"hello":"Bonjour"}')
    notify('change', 'fr.json')
    assert.equal(i18n.__(phrase), 'Bonjour')
  })

  it('reuses a null default-locale result across synchronized retries', () => {
    for (const locales of [['en', 'de'], ['de', 'en']]) {
      for (const locale of locales) fs.writeFileSync(path.join(directory, locale + '.json'), '{}')
      const calls = []
      const i18n = new I18n({ locales, directory, syncFiles: true, retryInDefaultLocale: true,
        missingKeyFn(locale, value) { calls.push(locale); return locale === 'en' ? null : String(value) }
      })
      assert.equal(i18n.__({ locale: 'de', phrase: 'label' }), 'null')
      assert.deepEqual(calls, ['en', 'de'])
    }
  })

  it('does not persist a reentrant callback placeholder in a synced fallback catalog', () => {
    const i18n = new I18n({ locales: ['en', 'fr'], directory, syncFiles: true, retryInDefaultLocale: true,
      missingKeyFn(locale, value) {
        if (locale === 'en') {
          assert.deepEqual(i18n.__('label'), {})
          assert.deepEqual(i18n.__({ locale: 'fr', phrase: 'label' }), {})
          return 'Label'
        }
        return value
      }
    })
    assert.equal(i18n.__('label'), 'Label')
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, 'fr.json'))), { label: 'Label' })
  })

  it('can start with an absent catalog directory when locales are omitted', () => {
    const catalogs = path.join(directory, 'locales')
    for (const updateFiles of [false, true]) {
      const i18n = new I18n({ directory: catalogs, defaultLocale: 'de', updateFiles })
      assert.equal(i18n.__('Hello'), 'Hello')
      assert.deepEqual(i18n.getLocales(), ['de'])
      assert.equal(fs.existsSync(catalogs), updateFiles)
    }
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(catalogs, 'de.json'))), { Hello: 'Hello' })
  })

  it('reads the configured file when the legacy .js path is a directory', () => {
    fs.mkdirSync(path.join(directory, 'de.js'))
    fs.writeFileSync(path.join(directory, 'de.json'), '{"Hello":"Hallo"}')
    const i18n = new I18n({ directory, updateFiles: false })
    assert.equal(i18n.__({ locale: 'de', phrase: 'Hello' }), 'Hallo')
  })

  it('runs a missing-key callback once per synced catalog when it returns null', () => {
    const calls = []
    const i18n = new I18n({
      directory, locales: ['en', 'de'], syncFiles: true,
      missingKeyFn(locale) { calls.push(locale); return null }
    })
    assert.equal(i18n.__n('items', 2), null)
    assert.deepEqual(calls.sort(), ['de', 'en'])
  })

  it('reloads legacy .js catalogs using the same filename choice as initial loading', (t) => {
    let notify
    t.mock.method(fs, 'watch', (dir, options, listener) => {
      notify = listener
      return { close() {} }
    })
    const file = path.join(directory, 'messages-de.js')
    fs.writeFileSync(file, '{"Hello":"first"}')
    const i18n = new I18n({ directory, locales: ['de'], prefix: 'messages-', autoReload: true })
    fs.writeFileSync(file, '{"Hello":"second"}')
    notify('change', 'messages-de.js')
    assert.equal(i18n.getCatalog('de').Hello, 'second')
  })

  it('watches catalogs loaded later by an explicit translation', (t) => {
    let notify
    t.mock.method(fs, 'watch', (dir, options, listener) => {
      notify = listener
      return { close() {} }
    })
    const file = path.join(directory, 'fr.json')
    fs.writeFileSync(file, '{"hello":"first"}')
    const i18n = new I18n({ directory, locales: [], autoReload: true })
    const phrase = { locale: 'fr', phrase: 'hello' }
    assert.equal(i18n.__(phrase), 'first')
    fs.writeFileSync(file, '{"hello":"second"}')
    notify('change', 'fr.json')
    assert.equal(i18n.__(phrase), 'second')
  })

  it('keeps static catalogs independent of files on disk', () => {
    fs.writeFileSync(path.join(directory, 'fr.json'), '{"Hello":"Bonjour"}')
    const i18n = new I18n({ staticCatalog: { en: { Hello: 'Hello' } }, directory })
    assert.equal(i18n.__({ phrase: 'Hello', locale: 'fr' }), 'Hello')
    i18n.addLocale('fr')
    assert.deepEqual(i18n.getLocales(), ['en'])
    assert.equal(i18n.getCatalog('fr'), false)
    i18n.configure({ locales: ['fr'], defaultLocale: 'fr', directory })
    assert.equal(i18n.__('Hello'), 'Bonjour')
  })

  it('uses literal prefixes and extensions when discovering locale files', () => {
    for (const name of ['app[1]-en.[json]', 'app[1]-frX[json]', 'other-de.[json]']) {
      fs.writeFileSync(path.join(directory, name), '{}')
    }
    const i18n = new I18n({ directory, prefix: 'app[1]-', extension: '.[json]' })
    assert.deepEqual(i18n.getLocales(), ['en'])
  })

  it('does not discover files with a nonliteral extension separator', () => {
    fs.writeFileSync(path.join(directory, 'en.json'), '{}')
    fs.writeFileSync(path.join(directory, 'frXjson'), '{}')
    const i18n = new I18n({ directory })
    assert.deepEqual(i18n.getLocales(), ['en'])
    assert.deepEqual(fs.readdirSync(directory).sort(), ['en.json', 'frXjson'])
  })

  it('uses the default extension consistently during discovery', () => {
    fs.writeFileSync(path.join(directory, 'en.json'), '{}')
    const i18n = new I18n({ directory, extension: '' })
    assert.deepEqual(i18n.getLocales(), ['en'])
    assert.deepEqual(fs.readdirSync(directory), ['en.json'])
  })

  it('updates the watched locales when locales are added and removed', () => {
    const originalWatch = fs.watch
    let listener
    let i18n
    try {
      fs.watch = (directory, options, callback) => {
        listener = callback
        return { close() {} }
      }
      fs.writeFileSync(path.join(directory, 'en.json'), '{}')
      fs.writeFileSync(path.join(directory, 'fr.json'), '{"Hello":"old"}')
      i18n = new I18n({ locales: ['en'], directory, autoReload: true })
      i18n.addLocale('fr')
      fs.writeFileSync(path.join(directory, 'fr.json'), '{"Hello":"new"}')
      listener('change', 'fr.json')
      assert.equal(i18n.getCatalog('fr').Hello, 'new')
      i18n.removeLocale('en')
      listener('change', 'en.json')
      assert.deepEqual(i18n.getLocales(), ['fr'])
    } finally {
      fs.watch = originalWatch
      i18n?.configure({ staticCatalog: { en: {} } })
    }
  })
})
