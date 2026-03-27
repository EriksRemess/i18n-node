import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import i18n, { I18n } from '#i18n'

describe('Module Defaults', () => {
  const testScope = {}
  const directory = path.join(os.tmpdir(), 'i18n-node-defaultlocales')

  beforeEach(() => {
    fs.rmSync(directory, { recursive: true, force: true })
    i18n.configure({
      locales: ['en', 'de'],
      register: testScope,
      directory
    })
    testScope.__('Hello')
  })

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true })
  })

  it('should be possible to setup a custom directory', () => {
    const stats = fs.lstatSync(directory)
    should.exist(stats)
  })

  it('should be possible to read custom files with default a extension of .json (issue #16)', () => {
    const statsde = fs.lstatSync(path.join(directory, 'de.json'))
    const statsen = fs.lstatSync(path.join(directory, 'en.json'))
    should.exist(statsde)
    should.exist(statsen)
  })

  it('should not let an existing .js locale hide later .json locales', () => {
    const mixedDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'i18n-node-mixed-read-')
    )

    try {
      fs.writeFileSync(path.join(mixedDirectory, 'en.js'), '{}')
      fs.writeFileSync(path.join(mixedDirectory, 'de.json'), '{"Hello":"Hallo"}')

      const mixedI18n = new I18n({
        locales: ['en', 'de'],
        directory: mixedDirectory,
        updateFiles: false
      })

      should.deepEqual(mixedI18n.getCatalog(), {
        en: {},
        de: { Hello: 'Hallo' }
      })
    } finally {
      fs.rmSync(mixedDirectory, { recursive: true, force: true })
    }
  })

  it('should keep writing new locales with the configured extension', () => {
    const mixedDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'i18n-node-mixed-write-')
    )

    try {
      fs.writeFileSync(path.join(mixedDirectory, 'en.js'), '{}')

      const mixedI18n = new I18n({
        locales: ['en', 'de'],
        directory: mixedDirectory
      })

      mixedI18n.setLocale('de')
      should.equal(mixedI18n.__('Hello'), 'Hello')

      should.equal(fs.existsSync(path.join(mixedDirectory, 'de.json')), true)
      should.equal(fs.existsSync(path.join(mixedDirectory, 'de.js')), false)
    } finally {
      fs.rmSync(mixedDirectory, { recursive: true, force: true })
    }
  })
})
