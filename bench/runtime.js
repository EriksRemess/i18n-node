import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { I18n } from '../index.js'
import { compare } from './benchmark.js'

const implementations = [['local', I18n]]
if (process.env.I18N_BASELINE) {
  const module = await import(pathToFileURL(resolve(process.env.I18N_BASELINE)))
  implementations.unshift(['baseline', module.I18n])
}

const named = { name: 'Alice' }
const dotted = { user: { name: 'Alice', city: 'Riga' } }
const section = {
  items: Array.from({ length: 10 }, (_, value) => ({ name: 'item', value }))
}
const intervals = Array.from({ length: 2048 }, (_, index) =>
  `[0] none ${index}|[1] one ${index}|[2,10] a few ${index}|[11,] many ${index}`
)
const cases = [
  ['plain text', (i18n) => i18n.__('plain')],
  ['positional values', (i18n) => i18n.__('positional', 'Alice', 42)],
  ['named values', (i18n) => i18n.__('named', named)],
  ['dotted values', (i18n) => i18n.__('dotted', dotted)],
  ['sections', (i18n) => i18n.__('section', section)],
  ['plurals', (i18n, index) => i18n.__n('plural', 'plurals', index % 5)],
  ['short plurals', (i18n, index) => i18n.__n('plural', index % 5)],
  ['intervals', (i18n, index) => i18n.__n('interval', index % 15)],
  ['rotating intervals', (i18n, index, catalog) => {
    catalog.interval = intervals[index % 100]
    return i18n.__n('interval', index % 15)
  }],
  ['interval cache misses', (i18n, index, catalog) => {
    catalog.interval = intervals[index % intervals.length]
    return i18n.__n('interval', index % 15)
  }],
  ['nested catalog', (i18n) => i18n.__('group.nested.greeting', named)]
]

for (const [label, run] of cases) {
  const variants = implementations.map(([name, Constructor]) => {
    const catalog = {
      plain: 'Hello',
      named: 'Hello {{name}}',
      dotted: '{{user.name}} in {{user.city}}',
      section: '{{#items}}{{name}}={{value}};{{/items}}',
      positional: 'Hello %s (%d)',
      plural: { one: '%s item', other: '%s items' },
      interval: '[0] none|[1] one|[2,10] a few|[11,] many',
      group: { nested: { greeting: 'Hello {{name}}' } }
    }
    const i18n = new Constructor({
      staticCatalog: { en: catalog },
      defaultLocale: 'en',
      objectNotation: true
    })
    i18n.setLocale('en')
    return [name, (index) => run(i18n, index, catalog)]
  })

  for (const index of [0, 1, 5, 20]) {
    const expected = variants[0][1](index)
    for (const [, fn] of variants) {
      assert.equal(fn(index), expected)
    }
  }
  compare(`i18n ${label}`, variants)
}
