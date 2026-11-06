import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { I18n } from '#i18n'

describe('translation optimization regressions', () => {
  it('selects cached interval rules for changing counts and catalog values', () => {
    const catalog = { choice: '[0] none|[1] one|[2,10] a few|[11,] many|fallback' }
    const i18n = new I18n({ staticCatalog: { en: catalog } })
    const cases = [[0, 'none'], [12, 'many'], [1, 'one'], [3, 'a few'],
      [-1, 'fallback'], [NaN, 'fallback'], [Infinity, 'many']]
    for (const [count, expected] of [...cases, ...cases.toReversed()]) {
      assert.equal(i18n.__n('choice', count), expected)
    }
    catalog.choice = '[0,] changed|fallback'
    assert.equal(i18n.__n('choice', 3), 'changed')
    catalog.choice = '[0] none|[1] one|[2,10] a few|[11,] many|fallback'
    assert.equal(i18n.__n('choice', 3), 'a few')
  })

  it('keeps interval fallback ordering through cache eviction and reconfiguration', () => {
    const i18n = new I18n({ staticCatalog: { en: {} } })
    for (let index = 0; index < 1100; index += 1) {
      assert.equal(i18n.__n(`[0] zero|[1,] value ${index}|last fallback`, 2), `value ${index}`)
    }
    assert.equal(i18n.__n('[0] zero|[1,] value 0|last fallback', -1), 'last fallback')
    i18n.configure({ staticCatalog: { en: { choice: '[0] zero|[1,] {{name}}' } } })
    assert.equal(i18n.__n('choice', 2, { name: 'Alice' }), 'Alice')
  })

  it('reads current nested catalog branches after replacement and deletion', () => {
    const catalog = { group: { nested: { value: 'first' } } }
    const i18n = new I18n({ staticCatalog: { en: catalog }, objectNotation: true })
    assert.equal(i18n.__('group.nested.value'), 'first')
    catalog.group = { nested: { value: 'second' } }
    assert.equal(i18n.__('group.nested.value'), 'second')
    delete catalog.group.nested.value
    assert.equal(i18n.__('group.nested.value:default'), 'default')
    catalog.group = 42
    assert.equal(i18n.__('group.nested.value:rebuilt'), 'rebuilt')
  })

  it('allows missing-key callbacks to re-enter the same nested path', () => {
    let calls = 0
    const i18n = new I18n({
      staticCatalog: { en: {} },
      objectNotation: true,
      missingKeyFn(locale, value) {
        calls += 1
        assert.deepEqual(i18n.__('group.value'), {})
        return `${locale}:${value}`
      }
    })
    assert.equal(i18n.__('group.value'), 'en:group.value')
    assert.equal(i18n.__('group.value'), 'en:group.value')
    assert.equal(calls, 1)
  })

  it('keeps named values live and respects bound translation scopes', () => {
    const i18n = new I18n({ staticCatalog: {
      en: { greeting: 'Hello {{name}}' },
      de: { greeting: 'Hallo {{name}}' }
    } })
    const scope = { locale: 'de' }
    const named = { name: 'Alice' }
    assert.equal(i18n.__.call(scope, 'greeting', named), 'Hallo Alice')
    named.name = 'Bob'
    assert.equal(i18n.__('greeting', named), 'Hello Bob')
  })
})
