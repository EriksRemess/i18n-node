/* global __, __n */

import i18n from '#i18n'
import { I18n } from '#i18n'

describe('Object Notation', () => {
  beforeEach(() => {
    i18n.configure({
      locales: ['en', 'de'],
      directory: './locales',
      register: global,
      updateFiles: true,
      objectNotation: true
    })
  })

  describe('Date/Time patterns', () => {
    it('should return en formatting as expected', () => {
      i18n.setLocale('en')
      should.equal(__('format.date'), 'MM/DD/YYYY')
      should.equal(__('format.time'), 'h:mm:ss a')
    })

    it('should return de formatting as expected', () => {
      i18n.setLocale('de')
      should.equal(__('format.date'), 'DD.MM.YYYY')
      should.equal(__('format.time'), 'hh:mm:ss')
    })
  })

  describe('i18nTranslate', () => {
    beforeEach(() => {
      const catalog = i18n.getCatalog('en')
      delete catalog.nested.path
    })

    it('should return en translations as expected, using object traversal notation', () => {
      i18n.setLocale('en')
      should.equal(__('greeting.formal'), 'Hello')
      should.equal(__('greeting.informal'), 'Hi')
      should.equal(__('greeting.placeholder.formal', 'Marcus'), 'Hello Marcus')
      should.equal(__('greeting.placeholder.informal', 'Marcus'), 'Hi Marcus')
      should.equal(
        __('greeting.placeholder.loud', 'Marcus'),
        'greeting.placeholder.loud'
      )
    })

    it('should return en translations as expected, when dot is first or last character', () => {
      i18n.setLocale('en')
      should.equal(__('. is first character'), 'Dot is first character')
      should.equal(__('last character is .'), 'last character is Dot')
      should.equal(__('few sentences. with .'), 'few sentences with Dot')
    })

    it('should provide proper pluralization support, using object traversal notation', () => {
      i18n.setLocale('en')
      const singular = __n({ singular: 'cat', plural: 'cat', locale: 'de' }, 1)
      const plural = __n({ singular: 'cat', plural: 'cat', locale: 'de' }, 3)
      should.equal(singular, '1 Katze')
      should.equal(plural, '3 Katzen')
    })

    it('should allow for simple pluralization', () => {
      const singular = __n('nested.deep.plural', 1)
      const plural = __n('nested.deep.plural', 3)
      should.equal(singular, 'plural')
      should.equal(plural, 'plurals')
    })

    it('should correctly update files', () => {
      should.equal(__('nested.path'), 'nested.path')
      should.equal(__('nested.path.sub'), 'nested.path.sub')
      should.deepEqual(__('nested.path'), {
        sub: 'nested.path.sub'
      })
    })

    it('should rebuild a scalar branch when extending object notation paths', () => {
      const instance = new I18n({
        objectNotation: true,
        defaultLocale: 'en',
        staticCatalog: {
          en: {
            broken: 'value'
          }
        }
      })

      should.equal(
        instance.__({ locale: 'en', phrase: 'broken.deep:fallback value' }),
        'fallback value'
      )
      should.deepEqual(instance.getCatalog('en').broken, {
        deep: 'fallback value'
      })
    })

    it('should rebuild a null branch when extending object notation paths', () => {
      const instance = new I18n({
        objectNotation: true,
        defaultLocale: 'en',
        staticCatalog: {
          en: {
            broken: null
          }
        }
      })

      should.equal(
        instance.__({ locale: 'en', phrase: 'broken.deep:fallback value' }),
        'fallback value'
      )
      should.deepEqual(instance.getCatalog('en').broken, {
        deep: 'fallback value'
      })
    })
  })
})
