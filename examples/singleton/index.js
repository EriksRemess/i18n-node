import path from 'node:path'
import i18n from '#i18n'
import one from './modules/one.js'
import two from './modules/two.js'

i18n.configure({
  locales: ['en', 'de'],
  directory: path.join(import.meta.dirname, 'locales')
})

// set to german
i18n.setLocale('de')

// will put 'Hallo'
console.log('index.js', i18n.__('Hello'))

// will also put 'Hallo'
one()

// will also put 'Hallo'
two()

// -------------------------------------------------

// set to english
i18n.setLocale('en')

// will put 'Hello'
console.log('index.js', i18n.__('Hello'))

// will also put 'Hello'
one()

// will also put 'Hello'
two()
