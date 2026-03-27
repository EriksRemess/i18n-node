import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import i18n from '#i18n'

describe('Module Config', () => {
  const testScope = {}
  const directory = path.join(os.tmpdir(), 'i18n-node-customlocales')

  beforeEach(() => {
    fs.rmSync(directory, { recursive: true, force: true })
    i18n.configure({
      locales: ['en', 'de'],
      register: testScope,
      directory,
      extension: '.customextension',
      prefix: 'customprefix-'
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

  it('should be possible to read custom files with custom prefixes and extensions', () => {
    const statsde = fs.lstatSync(path.join(directory, 'customprefix-de.customextension'))
    const statsen = fs.lstatSync(path.join(directory, 'customprefix-en.customextension'))
    should.exist(statsde)
    should.exist(statsen)
  })
})
