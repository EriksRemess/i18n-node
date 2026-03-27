import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import i18n from '#i18n'

const isWin = /^win/.test(process.platform)

describe('Module Config (directoryPermissions)', () => {
  const testScope = {}
  const directory = path.join(os.tmpdir(), 'i18n-node-customlocales')

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true })
  })

  it('should be possible to setup a custom directory with default permissions', () => {
    i18n.configure({
      locales: ['en', 'de'],
      register: testScope,
      directory,
      extension: '.customextension',
      prefix: 'customprefix-'
    })
    testScope.__('Hello')
    const stat = fs.lstatSync(directory)
    should.exist(stat)
  })

  it('should be possible to setup a custom directory with customized permissions', () => {
    i18n.configure({
      locales: ['en', 'de'],
      register: testScope,
      directoryPermissions: '700',
      directory,
      extension: '.customextension',
      prefix: 'customprefix-'
    })
    testScope.__('Hello')
    const stat = fs.lstatSync(directory)
    const mode = isWin ? '40666' : '40700'
    should.equal(mode, parseInt(stat.mode.toString(8), 10))
    should.exist(stat)
  })

  it('should be possible to setup a custom directory with customized permissions', () => {
    i18n.configure({
      locales: ['en', 'de'],
      register: testScope,
      directoryPermissions: '750',
      directory,
      extension: '.customextension',
      prefix: 'customprefix-'
    })
    testScope.__('Hello')
    const stat = fs.lstatSync(directory)
    const mode = isWin ? '40666' : '40750'
    should.equal(mode, parseInt(stat.mode.toString(8), 10))
    should.exist(stat)
  })
})
