import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { describe, it } from 'node:test'
import parseInterval, { parseIntervalPrefix } from '#lib/math-interval-parser'

describe('vendored interval parser', () => {
  const cases = [
    ['[-10,10)', -10, true, 10, false],
    [']-10,10[', -10, false, 10, false],
    ['[10]', 10, true, 10, true],
    ['[10,]', 10, true, Infinity, true],
    ['[,10]', -Infinity, true, 10, true],
    ['[,]', -Infinity, true, Infinity, true],
    ['(-Infinity,+Infinity)', -Infinity, false, Infinity, false],
    ['[-1.5,+.5]', -1.5, true, 0.5, true],
    ['[1e-3,2E+3]', 0.001, true, 2000, true],
    ['[1.,2.]', 1, true, 2, true],
    ['[Infinity]', Infinity, true, Infinity, true],
    [' \t[ -2.5 , 1.5 )\n', -2.5, true, 1.5, false]
  ]
  for (const [input, from, includeFrom, to, includeTo] of cases) {
    it(`parses ${JSON.stringify(input)}`, () => {
      assert.deepEqual(parseInterval(input), {
        from: { value: from, included: includeFrom },
        to: { value: to, included: includeTo }
      })
    })
  }

  it('rejects malformed, reversed, and empty intervals', () => {
    for (const input of [
      null, undefined, 1, {}, '', 'INVALID INPUT', '1,2', '[]', '][',
      '[2,-2]', '[Infinity,-2]', '[1,-Infinity]', '[2,2)', '(2,2]',
      '[2,2[', ']2,2]', '(2,2)', ']2,2[', '(2)', ']2[',
      '(Infinity,Infinity]', '[1 2]', '[1,,2]', '[NaN,2]', '[.,2]',
      '[+,2]', '[-,2]', '[1e,2]', '[1e+,2]', '[[1,2]]',
      'prefix [1,2]', '[1,2] suffix', '[1,2][3,4]'
    ]) assert.equal(parseInterval(input), null, String(input))
  })

  it('returns independent mutable results for repeated inputs', () => {
    const first = parseInterval('[1,2]')
    first.from.value = 99
    assert.equal(parseInterval('[1,2]').from.value, 1)
  })

  it('parses translation prefixes while keeping whole-interval parsing strict', () => {
    assert.deepEqual(parseIntervalPrefix(' \t[-1.5,2e3)\n  first\nsecond'), {
      interval: {
        from: { value: -1.5, included: true },
        to: { value: 2000, included: false }
      },
      text: 'first\nsecond'
    })
    assert.equal(parseInterval('[-1.5,2e3) text'), null)
    assert.equal(parseIntervalPrefix('[0]   ').text, '')
  })

  it('rejects invalid interval prefixes instead of accepting partial bounds', () => {
    for (const input of [null, {}, 'text [1,2]', '[1e,2] text', '[2,1] text',
      '(2,2) text', '[] text', '[[1,2]] text', '[1 2] text']) {
      assert.equal(parseIntervalPrefix(input), null)
    }
  })

  it('handles long whitespace runs without excessive backtracking', () => {
    const moduleUrl = new URL('../lib/math-interval-parser.js', import.meta.url).href
    // A subprocess timeout can interrupt a synchronous regexp regression.
    execFileSync(process.execPath, ['--input-type=module', '--eval', `
      import assert from 'node:assert/strict'
      import parseInterval, { parseIntervalPrefix } from ${JSON.stringify(moduleUrl)}
      const spaces = ' '.repeat(100_000)
      for (const input of [
        '[' + spaces + 'x',
        '[0,' + spaces + 'x',
        '[0' + spaces + 'x',
        '[0,1' + spaces + 'x',
        spaces + '[0,1] suffix'
      ]) {
        assert.equal(parseInterval(input), null)
      }
      for (const input of ['[' + spaces + 'x', '[0,' + spaces + 'x']) {
        assert.equal(parseIntervalPrefix(input + '|fallback'), null)
      }
      assert.deepEqual(parseInterval('[' + spaces + ',' + spaces + ']'), {
        from: { value: -Infinity, included: true },
        to: { value: Infinity, included: true }
      })
      assert.equal(parseIntervalPrefix('[0]' + spaces + 'text').text, 'text')
    `], { timeout: 5000 })
  })
})
