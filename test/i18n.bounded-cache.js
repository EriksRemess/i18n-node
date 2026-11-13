import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import BoundedCache from '#lib/bounded-cache'

describe('bounded FIFO cache', () => {
  it('evicts only the oldest entry across repeated wraparounds', () => {
    const cache = new BoundedCache(3)
    for (let index = 0; index < 20; index += 1) {
      cache.set(index, `value ${index}`)
      for (let key = 0; key <= index; key += 1) {
        assert.equal(cache.get(key), key > index - 3 ? `value ${key}` : undefined)
      }
    }
  })

  it('preserves insertion order when entries are read or replaced', () => {
    const cache = new BoundedCache(2)
    cache.set('first', 1).set('second', 2)
    assert.equal(cache.get('first'), 1)
    cache.set('first', 3)
    assert.equal(cache.get('first'), 3)
    cache.set('third', 4)
    assert.equal(cache.get('first'), undefined)
    assert.equal(cache.get('second'), 2)
    assert.equal(cache.get('third'), 4)
  })

  it('resets eviction order on clear and accepts prototype-shaped keys', () => {
    const cache = new BoundedCache(2)
    cache.set('old', 1).set('older', 2).set('oldest', 3)
    cache.clear()
    assert.equal(cache.get('oldest'), undefined)
    cache.set('__proto__', null).set('constructor', false)
    assert.equal(cache.get('__proto__'), null)
    assert.equal(cache.get('constructor'), false)
    cache.set('next', 4)
    assert.equal(cache.get('__proto__'), undefined)
    assert.equal(cache.get('constructor'), false)
  })
})
