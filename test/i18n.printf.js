import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { printf, printfArgs } from '#lib/printf'

describe('positional formatting', () => {
  for (const format of [printfArgs, (template, args) => printf(template, ...args)]) {
    it('preserves argument indexes, precision, percent escapes, and missing values', () => {
      assert.equal(format('%2$s / %s / %.2f / %d / %%', ['first', 2.125, '09tail']),
        '2.125 / first / 2.13 / 9 / %')
      assert.equal(format('%s %d %s %s', [undefined, null, false]), '%s NaN false %s')
      assert.equal(format('%0$s %9$s %x', ['value']), '%0$s %9$s %x')
    })
  }

  it('reads current values after template cache eviction', () => {
    for (let index = 0; index < 2200; index += 1) {
      assert.equal(printfArgs(`${index}: %s`, ['first']), `${index}: first`)
    }
    assert.equal(printfArgs('0: %s', ['second']), '0: second')
  })
})
