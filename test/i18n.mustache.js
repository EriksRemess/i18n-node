import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { describe, it } from 'node:test'
import render from '#lib/mustache'

// Official Mustache v1.3.0 fixtures, pinned to the revision in fixtures/mustache/README.md.
for (const suite of ['comments', 'delimiters', 'interpolation', 'inverted', 'sections']) {
  const fixture = JSON.parse(fs.readFileSync(new URL(`./fixtures/mustache/${suite}.json`, import.meta.url), 'utf8'))
  describe(`Mustache specification: ${suite}`, () => {
    for (const test of fixture.tests) {
      if (test.partials) continue // i18n has no partial template source.
      it(test.name, () => {
        assert.equal(render(test.template, test.data), test.expected, test.desc)
      })
    }
  })
}

describe('vendored Mustache regressions', () => {
  it('searches past long whitespace runs without excessive backtracking', () => {
    const moduleUrl = new URL('../lib/mustache.js', import.meta.url).href
    execFileSync(process.execPath, ['--input-type=module', '--eval', `
      import assert from 'node:assert/strict'
      import render from ${JSON.stringify(moduleUrl)}
      const spaces = ' '.repeat(100_000)
      const name = 'name' + spaces + 'x'
      const view = { [name]: '<ok>', name: 'Alice' }
      assert.equal(render('{{' + name + '}}', view), '&lt;ok&gt;')
      assert.equal(render('{{{' + name + '}}}', view), '<ok>')
      assert.equal(render('<%' + name + '%>', view, ['<%', '%>']), '&lt;ok&gt;')
      assert.equal(render('{{=<% %>' + spaces + '=}}<%name%>', view), 'Alice')
      for (const template of ['{{' + name, '{{{' + name, '{{=<%' + spaces + '%>}}']) {
        assert.throws(() => render(template, view), /Unclosed tag/)
      }
      assert.throws(() => render('<%' + name, view, ['<%', '%>']), /Unclosed tag/)
    `], { timeout: 5000 })
  })

  it('supports view properties that shadow context cache helpers', () => {
    const view = JSON.parse('{"hasOwnProperty":"safe","__proto__":"own","name":"Alice"}')
    assert.equal(render('{{hasOwnProperty}} {{__proto__}} {{name}}', view), 'safe own Alice')
  })

  it('handles null and undefined section items and missing root views', () => {
    assert.equal(render('{{#items}}[{{name}}]{{/items}}', {
      name: 'parent', items: [null, undefined, { name: 'Alice' }]
    }), '[parent][parent][Alice]')
    assert.equal(render('{{missing}}', null), '')
    assert.equal(render('{{missing}}'), '')
  })

  it('renders missing partials as empty, preserving standalone whitespace rules', () => {
    for (const name of ['card', 'constructor', 'toString', '__proto__']) {
      assert.equal(render(`before{{>${name}}}after`, {}), 'beforeafter')
      assert.equal(render(`before\n  {{>${name}}}\nafter`, {}), 'before\nafter')
    }
  })

  it('honors explicitly undefined child properties without falling back', () => {
    assert.equal(render('{{#child}}{{name}}{{/child}}', {
      name: 'parent', child: { name: undefined }
    }), '')
  })

  it('preserves Mustache.js interpolation and higher-order section functions', () => {
    let calls = 0
    const view = {
      name: 'Alice',
      value() { calls++; return this.name },
      wrap() { return (text, render) => `<b>${render(text)}</b>` }
    }
    assert.equal(render('{{value}} {{value}}', view), 'Alice Alice')
    assert.equal(calls, 2)
    assert.equal(render('{{#wrap}}Hello {{name}}{{/wrap}}', view), '<b>Hello Alice</b>')
  })

  it('uses the original array length when a section function appends items', () => {
    const items = [{
      name() {
        items.push({ name: 'extra' })
        return 'first'
      }
    }]
    assert.equal(render('{{#items}}{{name}}{{/items}}', { items }), 'first')
    assert.equal(items.length, 2)
  })

  it('does not share cached parses between colliding template and delimiter strings', () => {
    assert.equal(render('a:b', {}, ['c', 'd']), 'a:b')
    assert.equal(render('a', {}, ['b', 'c:d']), 'a')
  })

  it('keeps rendering correctly after cache eviction', () => {
    assert.equal(render('first {{name}}', { name: 'Alice' }), 'first Alice')
    for (let index = 0; index < 1100; index++) {
      assert.equal(render(`template ${index} {{name}}`, { name: 'Bob' }), `template ${index} Bob`)
    }
    assert.equal(render('first {{name}}', { name: 'Carol' }), 'first Carol')
  })

  it('rejects invalid delimiter pairs', () => {
    for (const tags of [[], [''], ['', ''], ['{{', ''], [null, '}}'], ['a', 'b', 'c']]) {
      assert.throws(() => render('Hello', {}, tags), /Invalid Mustache tags/)
    }
  })

  it('keeps escaped and unescaped interpolation distinct', () => {
    assert.equal(render('{{value}}|{{{value}}}', { value: '<&>' }), '&lt;&amp;&gt;|<&>')
    assert.equal(render('{{value}}|{{{value}}}', { value: 42 }), '42|42')
  })

  it('uses delimiter values when arrays are mutated between renders', () => {
    const tags = ['<%', '%>']
    const template = '<%name%>'
    assert.equal(render(template, { name: 'Alice' }, tags), 'Alice')
    tags[0] = '{{'
    tags[1] = '}}'
    assert.equal(render(template, { name: 'Alice' }, tags), template)
  })

  it('separates delimiter pairs with identical concatenated strings', () => {
    const view = { aNAMEb: 'first', baNAME: 'second' }
    assert.equal(render('abaNAMEbc', view, ['ab', 'c']), 'first')
    assert.equal(render('abaNAMEbc', view, ['a', 'bc']), 'second')
  })

  it('keeps rendering after one template uses many delimiter pairs', () => {
    const template = '{{name}}'
    for (let index = 0; index < 1100; index += 1) {
      assert.equal(render(template, {}, [`<${index}`, `${index}>`]), template)
    }
    assert.equal(render(template, { name: 'Alice' }), 'Alice')
    assert.equal(render(template, {}, ['<0', '0>']), template)
  })

  it('reads an undefined property once per render and calls functions on every lookup', () => {
    let reads = 0
    let calls = 0
    const view = {
      get missing() { reads += 1; return undefined },
      value() { calls += 1; return calls }
    }
    assert.equal(render('{{missing}}{{missing}}{{value}}{{value}}', view), '12')
    assert.equal(reads, 1)
    assert.equal(render('{{missing}}{{value}}', view), '3')
    assert.equal(reads, 2)
  })
})
