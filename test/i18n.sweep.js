import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { I18n } from '#i18n'

describe('request and translation edge cases', () => {
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
