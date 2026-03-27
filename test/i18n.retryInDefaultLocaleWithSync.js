import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { I18n } from '#i18n'

describe('retryInDefaultLocaleWithSync', () => {
  const directory = path.join(os.tmpdir(), 'i18n-node-locales-in-sync')
  const createConfig = () => {
    return {
      locales: ['en', 'de'],
      directory,
      defaultLocale: 'en',
      retryInDefaultLocale: true,
      syncFiles: true
    }
  }

  const readJson = (locale) => {
    return JSON.parse(fs.readFileSync(path.join(directory, `${locale}.json`)))
  }

  const writeJson = (locale, data) => {
    fs.writeFileSync(
      path.join(directory, `${locale}.json`),
      JSON.stringify(data, null, '\t')
    )
  }

  describe('writing', () => {
    const i18n = new I18n(createConfig())
    const req = {}
    i18n.init(req)
    before(() => {
      fs.rmSync(directory, { recursive: true, force: true })
    })
    after(() => {
      fs.rmSync(directory, { recursive: true, force: true })
    })

    it('should not throw', () => {
      req.setLocale('en')
      should.equal(req.__('test'), 'test')

      req.setLocale('de')
      should.equal(req.__('test'), 'test')

      req.setLocale('fr')
      should.equal(req.__('test'), 'test')
    })

    it('should have written all files', () => {
      const statsen = fs.lstatSync(path.join(directory, 'en.json'))
      const statsde = fs.lstatSync(path.join(directory, 'de.json'))
      should.exist(statsen)
      should.exist(statsde)
    })

    it('should not have written unsupported locale files', () => {
      let statsfr
      try {
        statsfr = fs.lstatSync(path.join(directory, 'fr.json'))
      } catch (e) {
        should.equal(e.code, 'ENOENT')
      }
      should.not.exist(statsfr)
    })

    it('should have written same data to all files', () => {
      const dataEn = readJson('en')
      const dataDe = readJson('de')
      should.deepEqual(dataEn, dataDe)
    })
  })

  describe('reading', () => {
    let i18n
    let req

    before(() => {
      fs.rmSync(directory, { recursive: true, force: true })
      fs.mkdirSync(directory, { recursive: true })
      writeJson('en', { test: 'test', welcome: 'welcome' })
      writeJson('de', { test: 'test', welcome: 'Willkommen' })
      i18n = new I18n(createConfig())
      req = {}
      i18n.init(req)
    })
    after(() => {
      fs.rmSync(directory, { recursive: true, force: true })
    })

    it('should still return default locales value', () => {
      req.setLocale('en')
      should.equal(req.__('test'), 'test')
      should.equal(req.__('welcome'), 'welcome')

      req.setLocale('de')
      should.equal(req.__('test'), 'test')
      should.equal(req.__('welcome'), 'Willkommen')

      req.setLocale('fr')
      should.equal(req.__('test'), 'test')
      should.equal(req.__('welcome'), 'welcome')
    })
  })
})
