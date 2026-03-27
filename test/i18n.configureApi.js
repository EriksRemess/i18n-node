import { I18n } from '#i18n'

describe('configure api', () => {
  it('should set an alias method on the object', () => {
    const customObject = {}
    new I18n({
      locales: ['en', 'de'],
      register: customObject,
      api: {
        __: 't'
      }
    })
    should.equal(typeof customObject.t, 'function')
    should.equal(customObject.t('Hello'), 'Hello')
    customObject.setLocale('de')
    should.equal(customObject.t('Hello'), 'Hallo')
  })

  it('should work for any existing API method', () => {
    const customObject = {}
    new I18n({
      locales: ['en', 'de'],
      register: customObject,
      api: {
        getLocale: 'getLocaleAlias'
      }
    })
    should.equal(typeof customObject.getLocaleAlias, 'function')
    customObject.setLocale('de')
    should.equal(customObject.getLocaleAlias(), 'de')
  })

  it('should ignore non existing API methods', () => {
    const customObject = {}
    new I18n({
      locales: ['en', 'de'],
      register: customObject,
      api: {
        nonExistingMethod: 'alias'
      }
    })
    should.equal(typeof customObject.nonExistingMethod, 'undefined')
  })

  it('should not expose the actual API methods', () => {
    const customObject = {}
    new I18n({
      locales: ['en', 'de'],
      register: customObject,
      api: {
        __: 't'
      }
    })
    should.equal(typeof customObject.__, 'undefined')
  })

  it('should escape res -> locals -> res recursion', () => {
    const customObject = {}
    customObject.locals = { res: customObject }
    new I18n({
      locales: ['en', 'de'],
      register: customObject,
      api: {
        __: 't'
      }
    })
    should.equal(typeof customObject.t, 'function')
    should.equal(typeof customObject.locals.t, 'function')
  })

  it('should reset api aliases on reconfigure', () => {
    const i18n = new I18n({ locales: ['en', 'de'], directory: './locales' })
    const customObject = {}
    const defaultObject = {}

    i18n.configure({
      locales: ['en', 'de'],
      directory: './locales',
      register: customObject,
      api: {
        __: 't'
      }
    })

    should.equal(typeof customObject.t, 'function')
    should.equal(typeof customObject.__, 'undefined')

    i18n.configure({
      locales: ['en', 'de'],
      directory: './locales',
      register: defaultObject
    })

    should.equal(typeof defaultObject.__, 'function')
    should.equal(typeof defaultObject.t, 'undefined')
  })
})
