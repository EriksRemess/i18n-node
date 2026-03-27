import cookieParser from 'cookie-parser'
import express from 'express'
import path from 'node:path'
import i18n from '#i18n'

i18n.configure({
  locales: ['en', 'de', 'ar'],
  cookie: 'yourcookiename',
  directory: path.join(import.meta.dirname, 'locales'),
  updateFiles: false
})

var app = express()
app.use(cookieParser())
app.use(i18n.init)

app.get('/test', function (req, res) {
  // delay a response to simulate a long running process,
  // while another request comes in with altered language settings
  setTimeout(function () {
    res.send(
      '<body>res: ' + res.__('Hello') + ' req: ' + req.__('Hello') + '</body>'
    )
  }, app.getDelay(req, res))
})

app.get('/testfail', function (req, res) {
  // delay a response to simulate a long running process,
  // while another request comes in with altered language settings
  setTimeout(function () {
    res.send('<body>' + i18n.__('Hello') + '</body>')
  }, app.getDelay(req, res))
})

// simple param parsing
app.getDelay = function (req, res) {
  return new URL(req.url, 'http://localhost').searchParams.get('delay') || 0
}

// startup
if (import.meta.main) {
  app.listen(3000)
}

export default app
