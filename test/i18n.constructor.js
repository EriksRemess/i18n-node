import i18n, { I18n } from '#i18n'

const testApi = (instance) => {
  should.equal(typeof instance.configure, 'function')
  should.equal(typeof instance.init, 'function')
  should.equal(typeof instance.__, 'function')
  should.equal(typeof instance.__mf, 'function')
  should.equal(typeof instance.__l, 'function')
  should.equal(typeof instance.__h, 'function')
  should.equal(typeof instance.__n, 'function')
  should.equal(typeof instance.setLocale, 'function')
  should.equal(typeof instance.getLocale, 'function')
  should.equal(typeof instance.getCatalog, 'function')
  should.equal(typeof instance.getLocales, 'function')
  should.equal(typeof instance.addLocale, 'function')
  should.equal(typeof instance.removeLocale, 'function')
}

describe('exported constructor', () => {
  it('should keep public api methods off the prototype', () => {
    const instance = new I18n()

    should.deepEqual(Object.getOwnPropertyNames(I18n.prototype), ['constructor'])
    should.equal(Object.hasOwn(instance, '__'), true)
    should.equal(Object.hasOwn(instance, 'setLocale'), true)
    should.equal(instance.__ === I18n.prototype.__, false)
    should.equal(instance.setLocale === I18n.prototype.setLocale, false)
  })

  it('should setup independend instances', () => {
    const one = new I18n()
    const two = new I18n()
    one.configure({
      locales: ['fr'],
      updateFiles: false
    })
    two.configure({
      locales: ['en', 'ru'],
      updateFiles: false
    })
    should.deepEqual(one.getLocales(), ['fr'])
    should.deepEqual(two.getLocales(), ['en', 'ru'])
    testApi(one)
    testApi(two)
  })

  it('should setup independend instances configured on creation', () => {
    const one = new I18n({
      locales: ['en-GB'],
      updateFiles: false
    })
    const two = new I18n({
      locales: ['ru'],
      updateFiles: false
    })
    should.deepEqual(one.getLocales(), ['en-GB'])
    should.deepEqual(two.getLocales(), ['ru'])
    testApi(one)
    testApi(two)
  })
})

describe('classic require', () => {
  it('should expose all API methods', () => {
    testApi(i18n)
  })

  it('should expose constructor too', () => {
    should.equal(typeof i18n.I18n, 'function')
  })
})

describe('included constructor', () => {
  it('should setup independend instances', () => {
    const one = new i18n.I18n()
    const two = new i18n.I18n()
    one.configure({
      locales: ['fr'],
      updateFiles: false
    })
    two.configure({
      locales: ['en', 'ru'],
      updateFiles: false
    })
    should.deepEqual(one.getLocales(), ['fr'])
    should.deepEqual(two.getLocales(), ['en', 'ru'])
    testApi(one)
    testApi(two)
  })

  it('should setup independend instances configured on creation', () => {
    const one = new i18n.I18n({
      locales: ['en-GB'],
      updateFiles: false
    })
    const two = new i18n.I18n({
      locales: ['ru'],
      updateFiles: false
    })
    should.deepEqual(one.getLocales(), ['en-GB'])
    should.deepEqual(two.getLocales(), ['ru'])
    testApi(one)
    testApi(two)
  })
})
