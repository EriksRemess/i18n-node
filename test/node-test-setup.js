import assert from 'node:assert'
import strictAssert from 'node:assert/strict'
import { isDeepStrictEqual } from 'node:util'
import * as nodeTest from 'node:test'
import i18n from '#i18n'

function wrapAsyncFunction(fn) {
  if (typeof fn !== 'function') {
    return undefined
  }

  if (fn.length === 0) {
    return fn
  }

  return async () =>
    await new Promise((resolve, reject) => {
      let settled = false
      const done = (error) => {
        if (settled) {
          return
        }

        settled = true
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      }

      try {
        const result = fn(done)
        if (result && typeof result.then === 'function') {
          result.then(() => done(), done)
        }
      } catch (error) {
        done(error)
      }
    })
}

function getHookArgs(nameOrFn, maybeFn) {
  if (typeof nameOrFn === 'function') {
    return wrapAsyncFunction(nameOrFn)
  }

  return wrapAsyncFunction(maybeFn)
}

function createAssertion(value, isNegated = false) {
  const target =
    value != null && typeof value.valueOf === 'function' ? value.valueOf() : value

  const assertion = {
    equal(expected, message) {
      if (isNegated) {
        assert.notEqual(target, expected, message)
      } else {
        assert.equal(target, expected, message)
      }
    },
    containEql(expected, message) {
      let contains = false

      if (Array.isArray(target)) {
        contains = target.some((entry) => isDeepStrictEqual(entry, expected))
      } else if (typeof target === 'string') {
        contains = target.includes(expected)
      }

      if (isNegated) {
        assert.ok(!contains, message)
      } else {
        assert.ok(contains, message)
      }
    },
    have: {
      property(key, expected, message) {
        const object = Object(target)
        const hasProperty = key in object
        assert.ok(hasProperty, message)

        if (arguments.length >= 2) {
          if (isNegated) {
            assert.notDeepEqual(object[key], expected, message)
          } else {
            assert.deepEqual(object[key], expected, message)
          }
        }
      }
    }
  }

  Object.defineProperty(assertion, 'be', {
    get() {
      return assertion
    }
  })

  Object.defineProperty(assertion, 'not', {
    get() {
      return createAssertion(target, !isNegated)
    }
  })

  return assertion
}

function should(value) {
  return createAssertion(value)
}

should.equal = (actual, expected, message) =>
  assert.equal(actual, expected, message)
should.deepEqual = (actual, expected, message) =>
  assert.deepEqual(actual, expected, message)
should.exist = (value, message) => assert.ok(value != null, message)
should.throws = (fn, error, message) => strictAssert.throws(fn, error, message)
should.not = {
  exist(value, message) {
    assert.ok(value == null, message)
  }
}

Object.defineProperty(Object.prototype, 'should', {
  configurable: true,
  get() {
    return createAssertion(this)
  }
})

global.describe = nodeTest.describe
global.it = (name, fn) => nodeTest.it(name, wrapAsyncFunction(fn))
global.before = (nameOrFn, maybeFn) => {
  return nodeTest.before(getHookArgs(nameOrFn, maybeFn))
}
global.after = (nameOrFn, maybeFn) => {
  return nodeTest.after(getHookArgs(nameOrFn, maybeFn))
}
global.beforeEach = (fn) => nodeTest.beforeEach(wrapAsyncFunction(fn))
global.afterEach = (fn) => nodeTest.afterEach(wrapAsyncFunction(fn))
global.context = global.describe
Object.defineProperty(globalThis, 'should', {
  configurable: true,
  writable: true,
  value: should
})

i18n.configure({
  locales: ['en', 'de'],
  fallbacks: { nl: 'de' },
  directory: './locales',
  register: globalThis
})
