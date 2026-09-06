import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { I18n } from '#i18n'

describe('locale and translation regressions', () => {
  let directory

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-regressions-'))
  })

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true })
  })

  it('rejects inherited locale names from requests', () => {
    const i18n = new I18n({
      staticCatalog: { en: {} },
      queryParameter: 'lang',
      cookie: 'lang',
      preserveLegacyCase: false
    })
    for (const locale of ['__proto__', 'constructor', 'toString']) {
      for (const req of [
        { url: `/?lang=${locale}` },
        { cookies: { lang: locale } },
        { headers: { 'accept-language': locale } }
      ]) {
        i18n.init(req)
        assert.equal(req.locale, 'en')
        assert.equal(req.__('i18nRegressionProperty'), 'i18nRegressionProperty')
        assert.equal(Object.hasOwn(Object.prototype, 'i18nRegressionProperty'), false)
      }
    }
  })

  it('treats inherited phrase names as ordinary catalog keys', () => {
    const i18n = new I18n({ staticCatalog: { en: {} } })
    for (const phrase of ['constructor', 'toString', '__proto__']) {
      assert.equal(i18n.__(phrase), phrase)
      assert.equal(Object.hasOwn(i18n.getCatalog('en'), phrase), true)
    }
    assert.equal(Object.getPrototypeOf(i18n.getCatalog('en')), Object.prototype)
  })

  it('creates prototype-shaped object paths without modifying prototypes', () => {
    const i18n = new I18n({ staticCatalog: { en: {} }, objectNotation: true })
    for (const phrase of ['__proto__.i18nRegressionProperty', 'constructor.prototype.i18nRegressionProperty']) {
      assert.equal(i18n.__(phrase), phrase)
      assert.equal(Object.hasOwn(Object.prototype, 'i18nRegressionProperty'), false)
    }
  })

  it('blocks traversal through explicit translation and locale APIs', () => {
    const locales = path.join(directory, 'locales')
    fs.mkdirSync(locales)
    const outside = path.join(directory, 'outside.json')
    const contents = '{"secret":"outside value"}'
    fs.writeFileSync(outside, contents)
    const i18n = new I18n({ locales: ['en'], directory: locales })

    for (const locale of ['../outside', '..\\outside', '../../outside', '__proto__']) {
      assert.throws(() => i18n.__({ phrase: 'secret', locale }), /Invalid locale/)
      assert.throws(() => i18n.__({ phrase: 'added', locale }), /Invalid locale/)
      assert.throws(() => i18n.__n({ singular: 'cat', plural: 'cats', locale }, 2), /Invalid locale/)
      assert.throws(() => i18n.addLocale(locale), /Invalid locale/)
    }
    assert.equal(fs.readFileSync(outside, 'utf8'), contents)
    assert.deepEqual(fs.readdirSync(directory).sort(), ['locales', 'outside.json'])
  })

  it('ignores unsafe fallback targets', () => {
    const i18n = new I18n({
      staticCatalog: { en: {} },
      fallbacks: { xx: '../outside', yy: '__proto__' }
    })
    assert.equal(i18n.setLocale('xx'), 'en')
    assert.equal(i18n.setLocale('yy'), 'en')
  })

  it('uses the default locale for both plural signatures without setLocale', () => {
    const i18n = new I18n({ staticCatalog: { en: {} }, defaultLocale: 'en' })
    assert.equal(i18n.__n('%s cat', '%s cats', 2), '2 cats')
    assert.equal(i18n.__n('%s cat', 1), '1 cat')
    assert.equal(i18n.__n('%s cat', 2), '2 cats')
  })

  it('uses the effective fallback language for plural rules', () => {
    const i18n = new I18n({
      staticCatalog: { fr: { cats: { one: 'one', other: 'other' } } },
      defaultLocale: 'fr',
      fallbacks: { xx: 'fr', en: 'fr' }
    })
    for (const locale of ['xx', 'en']) {
      assert.equal(i18n.__n({ singular: 'cats', plural: 'cats', locale }, 0), 'one')
      assert.equal(i18n.__n.call({ locale }, 'cats', 'cats', 0), 'one')
    }
  })

  it('uses basic plural rules for custom locales without a resolver', () => {
    const i18n = new I18n({ staticCatalog: { custom: {} }, defaultLocale: 'custom' })
    assert.equal(i18n.__n('%s cat', '%s cats', 2), '2 cats')
  })

  it('preserves positional and named values in short plural calls', () => {
    const i18n = new I18n({
      staticCatalog: { en: { cat: {
        one: '%s cat for %s and %s {{suffix}}',
        other: '%s cats for %s and %s {{suffix}}'
      } } }
    })
    assert.equal(i18n.__n('cat', 2, 'Alice', 'Bob', { suffix: 'today' }), '2 cats for Alice and Bob today')
    assert.equal(i18n.__n('cat', '2', 'Alice', 'Bob', { suffix: 'today' }), '2 cats for Alice and Bob today')
    assert.equal(i18n.__n('cat', '2', 'Alice'), '2 cats for Alice and %s ')
  })

  it('keeps missing read-only catalogs usable without writing files', () => {
    const i18n = new I18n({
      locales: ['en'], defaultLocale: 'en', directory, updateFiles: false
    })
    assert.equal(i18n.__('Hello'), 'Hello')
    assert.equal(i18n.__n('%s cat', '%s cats', 2), '2 cats')
    assert.deepEqual(fs.readdirSync(directory), [])
  })

  it('uses fallbacks for configured locales whose read-only files are missing', () => {
    const contents = JSON.stringify({
      Hello: 'English translation',
      cat: { one: '%s cat', other: '%s cats' }
    })
    fs.writeFileSync(path.join(directory, 'en.json'), contents)
    for (const locales of [['en', 'fr'], ['fr', 'en']]) {
      const i18n = new I18n({
        locales, directory, updateFiles: false, fallbacks: { fr: 'en' }
      })
      assert.equal(i18n.setLocale('fr'), 'en')
      assert.equal(i18n.__('Hello'), 'English translation')
      assert.equal(i18n.__({ phrase: 'Hello', locale: 'fr' }), 'English translation')
      assert.equal(i18n.__n({ singular: 'cat', plural: 'cats', locale: 'fr' }, 2), '2 cats')
      const request = { headers: { 'accept-language': 'fr' } }
      i18n.init(request)
      assert.equal(request.locale, 'en')
      assert.equal(request.__('Hello'), 'English translation')
      assert.deepEqual(i18n.getLocales(), ['en'])
    }
    assert.deepEqual(fs.readdirSync(directory), ['en.json'])
    assert.equal(fs.readFileSync(path.join(directory, 'en.json'), 'utf8'), contents)
  })

  it('keeps an existing empty catalog selectable ahead of its fallback', () => {
    fs.writeFileSync(path.join(directory, 'en.json'), '{"Hello":"English translation"}')
    fs.writeFileSync(path.join(directory, 'fr.json'), '{}')
    const i18n = new I18n({
      locales: ['en', 'fr'], directory, updateFiles: false, fallbacks: { fr: 'en' }
    })
    assert.equal(i18n.setLocale('fr'), 'fr')
    assert.equal(i18n.__('Hello'), 'Hello')
  })

  it('rejects invalid static catalog shapes at configuration time', () => {
    for (const catalog of [null, false, [], 'text']) {
      assert.throws(
        () => new I18n({ staticCatalog: { en: catalog } }),
        /Locale catalog must be an object/
      )
    }
  })

  it('backs up malformed catalogs before recovering with an empty catalog', () => {
    const file = path.join(directory, 'en.json')
    fs.writeFileSync(file, '{')
    const i18n = new I18n({ locales: ['en'], directory })
    assert.equal(i18n.__('Hello'), 'Hello')
    assert.equal(fs.readFileSync(file + '.invalid', 'utf8'), '{')
    assert.deepEqual(JSON.parse(fs.readFileSync(file)), { Hello: 'Hello' })
  })

  it('preserves existing backups across repeated catalog recovery', () => {
    const file = path.join(directory, 'en.json')
    fs.writeFileSync(file + '.invalid', 'original backup')
    fs.writeFileSync(file + '.invalid.1', 'second backup')
    for (const [suffix, contents] of [[2, '{'], [3, '{"Hello":']]) {
      fs.writeFileSync(file, contents)
      const i18n = new I18n({ locales: ['en'], directory })
      assert.equal(i18n.__('Hello'), 'Hello')
      assert.equal(fs.readFileSync(file + '.invalid', 'utf8'), 'original backup')
      assert.equal(fs.readFileSync(file + '.invalid.1', 'utf8'), 'second backup')
      assert.equal(fs.readFileSync(file + '.invalid.' + suffix, 'utf8'), contents)
      assert.deepEqual(JSON.parse(fs.readFileSync(file)), { Hello: 'Hello' })
    }
    assert.equal(fs.readFileSync(file + '.invalid.2', 'utf8'), '{')
  })

  it('does not replace a failed catalog if its backup cannot be created', () => {
    const file = path.join(directory, 'en.json')
    fs.writeFileSync(file, '{')
    const errors = []
    const i18n = new I18n({
      locales: ['en'], directory,
      logErrorFn: (message) => errors.push(message)
    })
    const originalCopyFileSync = fs.copyFileSync
    try {
      fs.copyFileSync = () => {
        const error = new Error('backup denied')
        error.code = 'EACCES'
        throw error
      }
      assert.equal(i18n.__('Hello'), 'Hello')
      assert.equal(fs.readFileSync(file, 'utf8'), '{')
      assert.deepEqual(fs.readdirSync(directory), ['en.json'])
      assert.equal(errors.some(message => message.includes('unexpected error writing files')), true)
    } finally {
      fs.copyFileSync = originalCopyFileSync
    }
    assert.equal(i18n.__('Next'), 'Next')
    assert.equal(fs.readFileSync(file + '.invalid', 'utf8'), '{')
    assert.deepEqual(JSON.parse(fs.readFileSync(file)), { Hello: 'Hello', Next: 'Next' })
  })

  it('uses configured fallbacks for malformed catalogs without replacing them', () => {
    const english = JSON.stringify({
      Hello: 'English translation', cat: { one: '%s cat', other: '%s cats' }
    })
    fs.writeFileSync(path.join(directory, 'en.json'), english)
    const file = path.join(directory, 'fr.json')
    fs.writeFileSync(file + '.invalid', 'existing backup')
    for (const updateFiles of [false, true]) {
      for (const contents of ['{', 'null', '[]']) {
        fs.writeFileSync(file, contents)
        for (let restart = 0; restart < 2; restart += 1) {
          const i18n = new I18n({
            locales: ['fr', 'en'], directory, updateFiles,
            fallbacks: { fr: 'en' }
          })
          assert.equal(i18n.setLocale('fr'), 'en')
          assert.equal(i18n.__('Hello'), 'English translation')
          assert.equal(i18n.__({ phrase: 'Hello', locale: 'fr' }), 'English translation')
          assert.equal(i18n.__n({ singular: 'cat', plural: 'cats', locale: 'fr' }, 2), '2 cats')
          assert.deepEqual(i18n.getLocales(), ['en'])
          assert.equal(fs.readFileSync(file, 'utf8'), contents)
          assert.equal(fs.readFileSync(file + '.invalid', 'utf8'), 'existing backup')
          assert.deepEqual(fs.readdirSync(directory).sort(), ['en.json', 'fr.json', 'fr.json.invalid'])
        }
      }
    }
  })

  it('uses the default locale when a malformed catalog has no configured fallback', () => {
    fs.writeFileSync(path.join(directory, 'en.json'), '{"Hello":"English translation"}')
    fs.writeFileSync(path.join(directory, 'fr.json'), '{')
    const i18n = new I18n({ locales: ['en', 'fr'], directory })
    assert.equal(i18n.__({ phrase: 'Hello', locale: 'fr' }), 'English translation')
    assert.deepEqual(i18n.getLocales(), ['en'])
    assert.equal(fs.readFileSync(path.join(directory, 'fr.json'), 'utf8'), '{')
  })

  it('loads a repaired catalog after an earlier parse failure', () => {
    fs.writeFileSync(path.join(directory, 'en.json'), '{"Hello":"English translation"}')
    const file = path.join(directory, 'fr.json')
    fs.writeFileSync(file, '{')
    const i18n = new I18n({
      locales: ['en', 'fr'], directory, fallbacks: { fr: 'en' }
    })
    assert.equal(i18n.setLocale('fr'), 'en')
    fs.writeFileSync(file, '{"Hello":"Bonjour"}')
    i18n.addLocale('fr')
    assert.equal(i18n.setLocale('fr'), 'fr')
    assert.equal(i18n.__('Hello'), 'Bonjour')
    assert.deepEqual(fs.readdirSync(directory).sort(), ['en.json', 'fr.json'])
  })

  it('handles invalid catalog shapes without altering read-only files', () => {
    const file = path.join(directory, 'en.json')
    for (const contents of ['{', 'null', 'false', '[]', '"text"']) {
      fs.writeFileSync(file, contents)
      const i18n = new I18n({ locales: ['en'], directory, updateFiles: false })
      assert.equal(i18n.__('Hello'), 'Hello')
      assert.equal(fs.readFileSync(file, 'utf8'), contents)
      assert.deepEqual(fs.readdirSync(directory), ['en.json'])
    }
  })

  it('preserves the last valid catalog when a reload encounters invalid JSON', () => {
    const file = path.join(directory, 'en.json')
    fs.writeFileSync(file, '{"Hello":"Good translation"}')
    const i18n = new I18n({ locales: ['en'], directory })
    fs.writeFileSync(file, '{')
    i18n.addLocale('en')
    assert.equal(i18n.__('Hello'), 'Good translation')
    assert.equal(fs.readFileSync(file, 'utf8'), '{')
    assert.equal(i18n.__('Next'), 'Next')
    assert.equal(fs.readFileSync(file + '.invalid', 'utf8'), '{')
    assert.deepEqual(JSON.parse(fs.readFileSync(file)), {
      Hello: 'Good translation', Next: 'Next'
    })
  })

  it('resets the selected locale on reconfiguration', () => {
    const i18n = new I18n({ staticCatalog: { en: {}, de: {} } })
    i18n.setLocale('de')
    i18n.configure({ staticCatalog: { en: { Hello: 'New English' } }, defaultLocale: 'en' })
    assert.equal(i18n.getLocale(), 'en')
    assert.equal(i18n.__('Hello'), 'New English')
    assert.deepEqual(i18n.getLocales(), ['en'])
  })

  it('resets registered objects and their nested scopes on reconfiguration', () => {
    fs.writeFileSync(path.join(directory, 'de.json'), '{"Hello":"Old disk German"}')
    for (const asArray of [false, true]) {
      const request = { res: { locals: {} } }
      const extra = { locals: {} }
      const register = asArray ? [request, extra] : request
      const scopes = asArray
        ? [request, request.res, request.res.locals, extra, extra.locals]
        : [request, request.res, request.res.locals]
      const i18n = new I18n({
        staticCatalog: { en: {}, de: {} }, register, directory
      })
      for (const scope of scopes) i18n.setLocale(scope, 'de')
      i18n.setLocale('de')
      i18n.configure({
        staticCatalog: { en: { Hello: 'New English' } },
        defaultLocale: 'en', register, directory
      })
      assert.equal(i18n.getLocale(), 'en')
      for (const scope of scopes) {
        assert.equal(scope.getLocale(), 'en')
        assert.equal(scope.__('Hello'), 'New English')
      }
      assert.deepEqual(i18n.getLocales(), ['en'])
    }
  })

  it('calls the missing-key callback once for each new nested translation', () => {
    const calls = []
    const i18n = new I18n({
      staticCatalog: { en: {} },
      objectNotation: true,
      missingKeyFn: (locale, value) => { calls.push({ locale, value }); return `[${value}]` }
    })
    assert.equal(i18n.__('a.b'), '[a.b]')
    assert.equal(i18n.__('a.b'), '[a.b]')
    assert.deepEqual(calls, [{ locale: 'en', value: 'a.b' }])
  })
})
