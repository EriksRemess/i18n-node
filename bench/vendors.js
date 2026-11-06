import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import renderMustache from '../lib/mustache.js'
import parseInterval from '../lib/math-interval-parser.js'
import { compare } from './benchmark.js'

// Optional baselines are local copies of the original dependency entry points.
const renderers = [['vendored', renderMustache]]
if (process.env.MUSTACHE_BASELINE) {
  const module = await import(pathToFileURL(resolve(process.env.MUSTACHE_BASELINE)))
  const baseline = module.default
  if (typeof baseline === 'function') {
    renderers.unshift(['baseline', baseline])
  } else {
    renderers.unshift(['baseline', (template, view, tags) => baseline.render(template, view, undefined, tags)])
  }
}
const cases = [
  ['plain text', 'Hello world', {}],
  ['interpolation', 'Hello {{name}}! You have {{count}} messages.', { name: 'Alice', count: 3 }],
  ['HTML escaping', '{{value}}', { value: '<tag> & "quoted"' }],
  ['dotted names', '{{user.name}} {{user.name}} {{user.details.city}}', {
    user: { name: 'Alice', details: { city: 'Riga' } }
  }],
  ['sections', '{{#items}}{{name}}={{value}};{{/items}}', {
    items: Array.from({ length: 10 }, (_, value) => ({ name: 'item', value }))
  }],
  ['custom delimiters', 'Hello <%name%>', { name: 'Alice' }, ['<%', '%>']]
]


for (const [label, template, view, tags] of cases) {
  const expected = renderers[0][1](template, view, tags)
  for (const [, renderer] of renderers) {
    assert.equal(renderer(template, view, tags), expected)
  }
  compare(`Mustache ${label}`, renderers.map(([name, renderer]) => [
    name, () => renderer(template, view, tags)
  ]))
}

compare('Mustache alternating templates', renderers.map(([name, renderer]) => [
  name, (index) => {
    const [, template, view, tags] = cases[index % cases.length]
    renderer(template, view, tags)
  }
]))

for (const [label, template] of [
  ['short', 'Hello {{name}}!\n{{#items}}\n  {{value}}\n{{/items}}'],
  ['long', 'A long line of ordinary translated text. '.repeat(100) + '{{name}}']
]) {
  compare(`Mustache cold ${label} rendering`, renderers.map(([name, renderer]) => {
    let serial = 0
    return [name, () => renderer(`${serial++} ${template}`, { name: 'Alice' })]
  }))
}

const parsers = [['vendored', parseInterval]]
if (process.env.INTERVAL_BASELINE) {
  const module = await import(pathToFileURL(resolve(process.env.INTERVAL_BASELINE)))
  parsers.unshift(['upstream', module.default.default ?? module.default])
}
for (const input of ['[2,5]', '[-1.5,2e3)', '[0,]', 'invalid']) {
  const expected = parsers[0][1](input)
  for (const [, parser] of parsers) assert.deepEqual(parser(input), expected)
  compare(`Interval ${input}`, parsers.map(([name, parser]) => [name, () => parser(input)]))
}
