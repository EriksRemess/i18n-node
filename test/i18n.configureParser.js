import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import YAML from 'yaml'
import { I18n } from '#i18n'

describe('configure parser', function () {
  context('with YAML parser', function () {
    const directory = path.join(os.tmpdir(), 'i18n-node-testlocalesyaml')
    let i18n

    before(() => {
      fs.rmSync(directory, { recursive: true, force: true })
      fs.mkdirSync(directory)
      fs.copyFileSync(
        path.join(import.meta.dirname, '..', 'locales', 'en.yml'),
        path.join(directory, 'en.yml')
      )
      i18n = new I18n({
        locales: ['en'],
        directory,
        extension: '.yml',
        parser: YAML
      })
    })

    after(() => {
      fs.rmSync(directory, { recursive: true, force: true })
    })

    it('should parse the locale files with the YAML parser', function () {
      i18n.__('Hello').should.equal('Hello')
    })

    it('should write unknown keys to the catalog', function () {
      i18n.__('does.not.exist')

      const catalog = i18n.getCatalog()
      catalog.should.have.property('en')
      catalog.en.should.have.property('does.not.exist', 'does.not.exist')
    })
  })
})
