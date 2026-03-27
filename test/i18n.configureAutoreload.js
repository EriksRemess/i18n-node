import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { I18n } from '#i18n'

const pollInterval = 20
const pollTimeout = 1000

async function waitFor(assertState, timeoutMs = pollTimeout) {
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    if (assertState()) {
      return
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval))
  }

  throw new Error('timed out waiting for autoreload')
}

/**
 * @todo autoreload... by fs.watch never stops
 * test may timeout when run without --exit. Still this works:
 *
 * $ mocha --exit test/i18n.configureAutoreload.js
 *
 * ...needs a proper shutdown as of https://github.com/mashpie/i18n-node/issues/359
 */

describe('autoreload configuration', () => {
  const testScope = {}
  const directory = path.join(os.tmpdir(), 'i18n-node-testlocalesauto')
  let i18n

  before(() => {
    fs.rmSync(directory, { recursive: true, force: true })
    fs.mkdirSync(directory)
    fs.writeFileSync(directory + '/de.json', '{}')
    fs.writeFileSync(directory + '/en.json', '{}')
    i18n = new I18n({
      directory: directory,
      register: testScope,
      autoReload: true
    })
  })

  after(() => {
    fs.rmSync(directory, { recursive: true, force: true })
  })

  it('will start with empty catalogs', () => {
    should.deepEqual(i18n.getCatalog(), { de: {}, en: {} })
  })

  it('reloads when a catalog is altered', async () => {
    fs.writeFileSync(directory + '/de.json', '{"Hello":"Hallo"}')
    await waitFor(() => i18n.getCatalog().de?.Hello === 'Hallo')
  })

  it('has added new string to catalog and translates correctly', () => {
    i18n.setLocale(testScope, 'de')
    should.equal('Hallo', testScope.__('Hello'))
    should.deepEqual(i18n.getCatalog(), { de: { Hello: 'Hallo' }, en: {} })
  })

  it('will add new string to catalog and files from __()', () => {
    should.equal('Hallo', testScope.__('Hello'))
    should.deepEqual(i18n.getCatalog(), { de: { Hello: 'Hallo' }, en: {} })
  })
})

describe('autoreload configuration with prefix', () => {
  const testScope = {}
  const directory = path.join(os.tmpdir(), 'i18n-node-testlocalesautoprefixed')
  let i18n

  before(() => {
    fs.rmSync(directory, { recursive: true, force: true })
    fs.mkdirSync(directory)
    fs.writeFileSync(directory + '/customprefix-de.json', '{}')
    fs.writeFileSync(directory + '/customprefix-en.json', '{}')
    i18n = new I18n({
      directory: directory,
      register: testScope,
      prefix: 'customprefix-',
      autoReload: true
    })
  })

  after(() => {
    fs.rmSync(directory, { recursive: true, force: true })
  })

  it('will start with empty catalogs', () => {
    should.deepEqual(i18n.getCatalog(), { de: {}, en: {} })
  })

  it('reloads when a catalog is altered', async () => {
    fs.writeFileSync(directory + '/customprefix-de.json', '{"Hello":"Hallo"}')
    await waitFor(() => i18n.getCatalog().de?.Hello === 'Hallo')
  })

  it('has added new string to catalog and translates correctly', () => {
    i18n.setLocale(testScope, 'de')
    should.equal('Hallo', testScope.__('Hello'))
    should.deepEqual(i18n.getCatalog(), { de: { Hello: 'Hallo' }, en: {} })
  })

  it('will add new string to catalog and files from __()', () => {
    should.equal('Hallo', testScope.__('Hello'))
    should.deepEqual(i18n.getCatalog(), { de: { Hello: 'Hallo' }, en: {} })
  })
})

describe('autoreload configuration with prefix and customextension', () => {
  const testScope = {}
  const directory = path.join(
    os.tmpdir(),
    'i18n-node-testlocalesautoprefixedext'
  )
  let i18n

  before(() => {
    fs.rmSync(directory, { recursive: true, force: true })
    fs.mkdirSync(directory)
    fs.writeFileSync(directory + '/customprefix-de.customextension', '{}')
    fs.writeFileSync(directory + '/customprefix-en.customextension', '{}')
    i18n = new I18n({
      directory: directory,
      register: testScope,
      prefix: 'customprefix-',
      extension: '.customextension',
      autoReload: true
    })
  })

  after(() => {
    fs.rmSync(directory, { recursive: true, force: true })
  })

  it('will start with empty catalogs', () => {
    should.deepEqual(i18n.getCatalog(), { de: {}, en: {} })
  })

  it('reloads when a catalog is altered', async () => {
    fs.writeFileSync(
      directory + '/customprefix-de.customextension',
      '{"Hello":"Hallo"}'
    )
    await waitFor(() => i18n.getCatalog().de?.Hello === 'Hallo')
  })

  it('has added new string to catalog and translates correctly', () => {
    i18n.setLocale(testScope, 'de')
    should.equal('Hallo', testScope.__('Hello'))
    should.deepEqual(i18n.getCatalog(), { de: { Hello: 'Hallo' }, en: {} })
  })

  it('will add new string to catalog and files from __()', () => {
    should.equal('Hallo', testScope.__('Hello'))
    should.deepEqual(i18n.getCatalog(), { de: { Hello: 'Hallo' }, en: {} })
  })
})

describe('autoreload configuration with customextension', () => {
  const testScope = {}
  const directory = path.join(
    os.tmpdir(),
    'i18n-node-testlocalesautocustomextension'
  )
  let i18n

  before(() => {
    fs.rmSync(directory, { recursive: true, force: true })
    fs.mkdirSync(directory)
    fs.writeFileSync(directory + '/de.customextension', '{}')
    fs.writeFileSync(directory + '/en.customextension', '{}')
    i18n = new I18n({
      directory: directory,
      register: testScope,
      extension: '.customextension',
      autoReload: true
    })
  })

  after(() => {
    fs.rmSync(directory, { recursive: true, force: true })
  })

  it('will start with empty catalogs', () => {
    should.deepEqual(i18n.getCatalog(), { de: {}, en: {} })
  })

  it('reloads when a catalog is altered', async () => {
    fs.writeFileSync(directory + '/de.customextension', '{"Hello":"Hallo"}')
    await waitFor(() => i18n.getCatalog().de?.Hello === 'Hallo')
  })

  it('has added new string to catalog and translates correctly', () => {
    i18n.setLocale(testScope, 'de')
    should.equal('Hallo', testScope.__('Hello'))
    should.deepEqual(i18n.getCatalog(), { de: { Hello: 'Hallo' }, en: {} })
  })

  it('will add new string to catalog and files from __()', () => {
    should.equal('Hallo', testScope.__('Hello'))
    should.deepEqual(i18n.getCatalog(), { de: { Hello: 'Hallo' }, en: {} })
  })
})

describe('autoreload watcher lifecycle', () => {
  it('should close the previous watcher on reconfigure', () => {
    const originalWatch = fs.watch
    let watchCount = 0
    let closeCount = 0

    try {
      fs.watch = () => {
        watchCount += 1
        return {
          close() {
            closeCount += 1
          }
        }
      }

      const i18n = new I18n({
        locales: ['en'],
        directory: './locales',
        autoReload: true
      })

      i18n.configure({
        locales: ['en'],
        directory: './locales',
        autoReload: true
      })

      i18n.configure({
        locales: ['en'],
        directory: './locales',
        autoReload: false
      })

      should.equal(watchCount, 2)
      should.equal(closeCount, 2)
    } finally {
      fs.watch = originalWatch
    }
  })
})
