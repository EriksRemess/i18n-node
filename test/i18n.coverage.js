import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import createDebug from '#debug'
import i18n, { I18n } from '#i18n'

const makeTempDir = () =>
  fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-node-coverage-'))

describe('coverage branches', () => {
  describe('local debug helper', () => {
    const originalDebug = process.env.DEBUG
    const originalConsoleError = console.error

    afterEach(() => {
      if (originalDebug === undefined) {
        delete process.env.DEBUG
      } else {
        process.env.DEBUG = originalDebug
      }

      console.error = originalConsoleError
    })

    it('should stay silent when disabled', () => {
      delete process.env.DEBUG
      const messages = []
      console.error = (...args) => {
        messages.push(args)
      }

      const debug = createDebug('i18n:debug')
      debug.enabled.should.equal(false)
      debug('hidden message')

      should.deepEqual(messages, [])
    })

    it('should log when enabled explicitly', () => {
      process.env.DEBUG = 'i18n:debug'
      const messages = []
      console.error = (...args) => {
        messages.push(args)
      }

      const debug = createDebug('i18n:debug')
      debug.enabled.should.equal(true)
      debug('visible message')

      should.deepEqual(messages, [['i18n:debug', 'visible message']])
    })

    it('should honor exclusion patterns', () => {
      process.env.DEBUG = 'i18n:*,-i18n:debug'
      const messages = []
      console.error = (...args) => {
        messages.push(args)
      }

      const debug = createDebug('i18n:debug')
      debug.enabled.should.equal(false)
      debug('hidden by exclusion')

      should.deepEqual(messages, [])
    })

    it('should let exclusions override global wildcards', () => {
      process.env.DEBUG = '*,-i18n:debug'
      const messages = []
      console.error = (...args) => {
        messages.push(args)
      }

      const debug = createDebug('i18n:debug')
      debug.enabled.should.equal(false)
      debug('hidden by wildcard exclusion')

      should.deepEqual(messages, [])
    })
  })

  describe('queryParameter', () => {
    let req
    let res

    beforeEach(() => {
      i18n.configure({
        locales: ['en', 'de', 'fr'],
        defaultLocale: 'en',
        queryParameter: 'lang',
        directory: './locales'
      })

      req = {
        request: 'GET /test?lang=fr',
        url: '/test?lang=fr',
        headers: {
          'accept-language': 'en'
        }
      }

      res = {
        locals: {}
      }
    })

    it('should support Express query parser string values', () => {
      req.query = { lang: 'fr' }
      i18n.init(req, res)
      i18n.getLocale(req).should.equal('fr')
      i18n.getLocale(res).should.equal('fr')
    })

    it('should support Express query parser array values', () => {
      req.query = { lang: ['', 'de'] }
      i18n.init(req, res)
      i18n.getLocale(req).should.equal('de')
      i18n.getLocale(res).should.equal('de')
    })
  })

  describe('read and write errors', () => {
    it('should warn and fall back to default locale when a locale cannot be read', () => {
      const directory = makeTempDir()
      const warnings = []

      try {
        fs.writeFileSync(path.join(directory, 'en.json'), '{}')

        const instance = new I18n({
          locales: ['en'],
          defaultLocale: 'en',
          directory,
          updateFiles: false,
          logWarnFn(message) {
            warnings.push(message)
          }
        })

        instance.__({ phrase: 'Hello', locale: 'zz' }).should.equal('Hello')
        warnings.length.should.equal(1)
        warnings[0].should.containEql("Locale zz couldn't be read")
      } finally {
        fs.rmSync(directory, { recursive: true, force: true })
      }
    })

    it('should support null plural counts from named values', () => {
      const instance = new I18n({
        locales: ['en'],
        directory: './locales'
      })

      instance
        .__n(
          { singular: '%s cat', plural: '%s cats', locale: 'en' },
          null,
          null,
          { count: 3 }
        )
        .should.equal('3 cats')
    })

    it('should log parser errors for invalid locale files', () => {
      const directory = makeTempDir()
      const errors = []

      try {
        fs.writeFileSync(path.join(directory, 'en.json'), 'invalid')

        new I18n({
          locales: ['en'],
          directory,
          parser: {
            parse() {
              throw new Error('parse failed')
            },
            stringify: JSON.stringify
          },
          logErrorFn(message) {
            errors.push(message)
          }
        })

        errors.length.should.equal(1)
        errors[0].should.containEql('unable to parse locales from file')
      } finally {
        fs.rmSync(directory, { recursive: true, force: true })
      }
    })

    it('should use custom indentation when writing locale files', () => {
      const directory = makeTempDir()

      try {
        fs.writeFileSync(path.join(directory, 'en.json'), '{}')

        const instance = new I18n({
          locales: ['en'],
          directory,
          indent: '  '
        })

        instance.__({ phrase: 'Hello', locale: 'en' }).should.equal('Hello')
        fs.readFileSync(path.join(directory, 'en.json'), 'utf8').should.containEql(
          '\n  "Hello": "Hello"\n'
        )
      } finally {
        fs.rmSync(directory, { recursive: true, force: true })
      }
    })

    it('should support custom debug loggers', () => {
      const directory = makeTempDir()
      const messages = []

      try {
        fs.writeFileSync(path.join(directory, 'en.json'), '{}')

        new I18n({
          locales: ['en'],
          directory,
          logDebugFn(message) {
            messages.push(message)
          }
        })

        messages.length.should.not.equal(0)
      } finally {
        fs.rmSync(directory, { recursive: true, force: true })
      }
    })

    it('should back up unreadable locale files before reinitializing them', () => {
      const directory = makeTempDir()
      const originalReadFileSync = fs.readFileSync
      const target = path.join(directory, 'en.json')

      try {
        fs.writeFileSync(target, '{}')

        fs.readFileSync = (filepath, ...args) => {
          if (filepath === target) {
            throw new Error('read failed')
          }

          return originalReadFileSync(filepath, ...args)
        }

        new I18n({
          locales: ['en'],
          directory
        })

        fs.existsSync(target).should.equal(true)
        fs.existsSync(`${target}.invalid`).should.equal(true)
      } finally {
        fs.readFileSync = originalReadFileSync
        fs.rmSync(directory, { recursive: true, force: true })
      }
    })

    it('should ignore empty watch filenames during autoreload', () => {
      const directory = makeTempDir()
      const originalWatch = fs.watch

      try {
        fs.writeFileSync(path.join(directory, 'en.json'), '{}')

        fs.watch = (filepath, options, listener) => {
          listener('change')
          return {
            close() {}
          }
        }

        new I18n({
          locales: ['en'],
          directory,
          autoReload: true
        })
      } finally {
        fs.watch = originalWatch
        fs.rmSync(directory, { recursive: true, force: true })
      }
    })

    it('should log when the temporary locale file is not a file', () => {
      const directory = makeTempDir()
      const errors = []
      const originalStatSync = fs.statSync
      const target = path.join(directory, 'en.json')
      const tmp = `${target}.tmp`

      try {
        fs.writeFileSync(target, '{}')

        const instance = new I18n({
          locales: ['en'],
          directory,
          logErrorFn(message) {
            errors.push(message)
          }
        })

        fs.statSync = (filepath, ...args) => {
          if (filepath === tmp) {
            return {
              isFile() {
                return false
              }
            }
          }

          return originalStatSync(filepath, ...args)
        }

        instance.__({ phrase: 'Hello', locale: 'en' }).should.equal('Hello')
        errors.length.should.equal(1)
        errors[0].should.containEql('unable to write locales to file')
      } finally {
        fs.statSync = originalStatSync
        fs.rmSync(directory, { recursive: true, force: true })
      }
    })

    it('should fall back to json when the configured extension is empty', () => {
      const directory = makeTempDir()
      const target = path.join(directory, 'en.json')

      try {
        const instance = new I18n({
          locales: ['en'],
          directory,
          extension: ''
        })

        instance.__({ phrase: 'Hello', locale: 'en' }).should.equal('Hello')
        fs.existsSync(target).should.equal(true)
      } finally {
        fs.rmSync(directory, { recursive: true, force: true })
      }
    })

    it('should ignore EEXIST when another task creates the locale directory first', () => {
      const directory = makeTempDir()
      const target = path.join(directory, 'en.json')
      const originalLstatSync = fs.lstatSync
      const originalMkdirSync = fs.mkdirSync

      try {
        fs.writeFileSync(target, '{}')

        const instance = new I18n({
          locales: ['en'],
          directory
        })

        fs.lstatSync = (filepath, ...args) => {
          if (filepath === directory) {
            const error = new Error('missing')
            error.code = 'ENOENT'
            throw error
          }

          return originalLstatSync(filepath, ...args)
        }

        fs.mkdirSync = (filepath, ...args) => {
          if (filepath === directory) {
            const error = new Error('already exists')
            error.code = 'EEXIST'
            throw error
          }

          return originalMkdirSync(filepath, ...args)
        }

        instance.__({ phrase: 'Hello', locale: 'en' }).should.equal('Hello')
        fs.existsSync(target).should.equal(true)
      } finally {
        fs.lstatSync = originalLstatSync
        fs.mkdirSync = originalMkdirSync
        fs.rmSync(directory, { recursive: true, force: true })
      }
    })

    it('should log unexpected write errors', () => {
      const directory = makeTempDir()
      const errors = []

      try {
        fs.writeFileSync(path.join(directory, 'en.json'), '{}')

        const instance = new I18n({
          locales: ['en'],
          directory,
          parser: {
            parse: JSON.parse,
            stringify() {
              throw new Error('stringify failed')
            }
          },
          logErrorFn(message) {
            errors.push(message)
          }
        })

        instance.__({ phrase: 'Hello', locale: 'en' }).should.equal('Hello')
        errors.length.should.equal(1)
        errors[0].should.containEql('unexpected error writing files')
      } finally {
        fs.rmSync(directory, { recursive: true, force: true })
      }
    })
  })
})
