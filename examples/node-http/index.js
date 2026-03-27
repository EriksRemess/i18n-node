/**
 * This example is intended to show a basic plain vanilla setup and
 * also to be run as integration test for concurrency issues.
 *
 * Please remove setTimeout(), if you intend to use it as a blueprint!
 *
 */

// require modules
import http from 'node:http'
import path from 'node:path'
import i18n from '#i18n'
var app

// minimal config
i18n.configure({
  locales: ['en', 'de'],
  directory: path.join(import.meta.dirname, 'locales'),
  updateFiles: false
})

// simple server
app = http.createServer(function (req, res) {
  var delay = app.getDelay(req, res)

  // init & guess
  i18n.init(req, res)

  // delay a response to simulate a long running process,
  // while another request comes in with altered language settings
  setTimeout(function () {
    res.end(res.__('Hello'))
  }, delay)
})

// simple param parsing
app.getDelay = function (req, res) {
  return new URL(req.url, 'http://localhost').searchParams.get('delay') || 0
}

// startup
if (import.meta.main) {
  app.listen(3000, '127.0.0.1')
}

export default app
