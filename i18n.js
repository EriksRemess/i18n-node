/**
 * @author      Created by Marcus Spiegel <spiegel@uscreen.de> on 2011-03-25.
 * @link        https://github.com/mashpie/i18n-node
 * @license     http://opensource.org/licenses/MIT
 */

import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { URLSearchParams } from 'node:url'
import * as MakePlural from '#lib/cardinals'
import { matchIntervalPrefix, parseIntervalPrefix } from '#lib/math-interval-parser'
import renderMustache from '#lib/mustache'
import pkg from '#package' with { type: 'json' }
import createDebug from '#lib/debug'
import { printf, printfArgs } from '#lib/printf'
import BoundedCache from '#lib/bounded-cache'

const pkgVersion = pkg.version
const debug = createDebug('i18n:debug')
const warn = createDebug('i18n:warn')
const error = createDebug('i18n:error')
const DEFAULT_DIRECTORY = path.join(import.meta.dirname, 'locales')
const DEFAULT_API = Object.freeze({
  __: '__',
  __n: '__n',
  __l: '__l',
  __h: '__h',
  getLocale: 'getLocale',
  setLocale: 'setLocale',
  getCatalog: 'getCatalog',
  getLocales: 'getLocales',
  addLocale: 'addLocale',
  removeLocale: 'removeLocale'
})
const DEFAULT_MUSTACHE_CONFIG = Object.freeze({
  tags: ['{{', '}}'],
  disable: false
})
const boundHelpers = new WeakMap()
const PENDING_TRANSLATION = Symbol('pending translation')
const EMPTY_ARRAY = Object.freeze([])
const EMPTY_OBJECT = Object.freeze({})
const MESSAGE_FEATURE_INTERVAL = 1
const MESSAGE_FEATURE_PERCENT = 2
const MESSAGE_FEATURE_MUSTACHE = 4
const SMALL_PLURAL_COUNT_LIMIT = 64
const PLURAL_RULES = new Map(
  Object.entries(MakePlural).map(([locale, resolver]) => [
    locale.toLowerCase().replaceAll('_', '-'), resolver
  ])
)
const isValidLocale = (locale) =>
  typeof locale === 'string' &&
  locale.length > 0 &&
  !/[\\/\0]/.test(locale) &&
  locale !== '.' &&
  locale !== '..' &&
  locale !== 'prototype' &&
  !Object.hasOwn(Object.prototype, locale)
const setOwn = (object, key, value) => {
  Object.defineProperty(object, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true
  })
  return value
}
const cloneApi = () => ({ ...DEFAULT_API })
const cloneMustacheConfig = () => ({
  disable: DEFAULT_MUSTACHE_CONFIG.disable,
  tags: [...DEFAULT_MUSTACHE_CONFIG.tags]
})

/**
 * create constructor class
 */
class I18n {
  version = pkgVersion

  #pluralsForLocale = {}
  #locales = {}
  #staticCatalog = false
  #failedCatalogs = new Map()
  #pendingMissingKeys = new WeakMap()
  #api = cloneApi()
  #mustacheConfig = cloneMustacheConfig()
  #mustacheStart = '{{'
  #mustacheEnd = '}}'
  #autoReload = false
  #autoReloadWatcher
  #watchedLocales = new Set()
  #cookiename = null
  #languageHeaderName = 'accept-language'
  #defaultLocale = 'en'
  #retryInDefaultLocale = false
  #directory = DEFAULT_DIRECTORY
  #directoryPermissions = null
  #extension = '.json'
  #fallbacks = {}
  #indent = '\t'
  #logDebugFn = debug
  #logErrorFn = error
  #logWarnFn = warn
  #preserveLegacyCase = true
  #objectNotation = false
  #prefix = ''
  #queryParameter = null
  #register = null
  #updateFiles = true
  #syncFiles = false
  #missingKeyFn
  #parser = JSON
  #messageFeatures = new BoundedCache()
  #objectPathSegments = new BoundedCache()

  constructor(options = false) {
    this.#updateMustacheTags()

    if (options) {
      this.configure(options)
    }
  }

  configure = ((i18n) =>
    function i18nConfigure(opt) {
      i18n.#resetConfiguration()

      if (opt.api && typeof opt.api === 'object') {
        for (const method in opt.api) {
          if (Object.hasOwn(opt.api, method)) {
            const alias = opt.api[method]
            if (typeof i18n.#api[method] !== 'undefined') {
              i18n.#api[method] = alias
            }
          }
        }
      }

      i18n.#cookiename = typeof opt.cookie === 'string' ? opt.cookie : null
      i18n.#languageHeaderName =
        typeof opt.header === 'string' ? opt.header : 'accept-language'
      i18n.#queryParameter =
        typeof opt.queryParameter === 'string' ? opt.queryParameter : null
      i18n.#directory =
        typeof opt.directory === 'string' ? opt.directory : DEFAULT_DIRECTORY
      i18n.#directoryPermissions =
        typeof opt.directoryPermissions === 'string'
          ? Number.parseInt(opt.directoryPermissions, 8)
          : null
      i18n.#updateFiles =
        typeof opt.updateFiles === 'boolean' ? opt.updateFiles : true
      i18n.#syncFiles = typeof opt.syncFiles === 'boolean' ? opt.syncFiles : false
      i18n.#indent = typeof opt.indent === 'string' ? opt.indent : '\t'
      i18n.#prefix = typeof opt.prefix === 'string' ? opt.prefix : ''
      i18n.#extension =
        typeof opt.extension === 'string' ? opt.extension : '.json'
      i18n.#defaultLocale =
        typeof opt.defaultLocale === 'string' ? opt.defaultLocale : 'en'
      if (!isValidLocale(i18n.#defaultLocale)) {
        throw new TypeError('Invalid default locale: ' + i18n.#defaultLocale)
      }
      i18n.#retryInDefaultLocale =
        typeof opt.retryInDefaultLocale === 'boolean'
          ? opt.retryInDefaultLocale
          : false
      i18n.#autoReload =
        typeof opt.autoReload === 'boolean' ? opt.autoReload : false
      i18n.#objectNotation =
        typeof opt.objectNotation !== 'undefined' ? opt.objectNotation : false
      if (i18n.#objectNotation === true) {
        i18n.#objectNotation = '.'
      }
      i18n.#fallbacks = typeof opt.fallbacks === 'object' ? opt.fallbacks : {}
      i18n.#logDebugFn =
        typeof opt.logDebugFn === 'function' ? opt.logDebugFn : debug
      i18n.#logWarnFn =
        typeof opt.logWarnFn === 'function' ? opt.logWarnFn : warn
      i18n.#logErrorFn =
        typeof opt.logErrorFn === 'function' ? opt.logErrorFn : error
      i18n.#preserveLegacyCase =
        typeof opt.preserveLegacyCase === 'boolean'
          ? opt.preserveLegacyCase
          : true
      i18n.#missingKeyFn =
        typeof opt.missingKeyFn === 'function'
          ? opt.missingKeyFn
          : undefined
      i18n.#parser =
        opt.parser !== null &&
        typeof opt.parser === 'object' &&
        typeof opt.parser.parse === 'function' &&
        typeof opt.parser.stringify === 'function'
          ? opt.parser
          : JSON

      if (opt.mustacheConfig) {
        if (Array.isArray(opt.mustacheConfig.tags)) {
          i18n.#mustacheConfig.tags = [...opt.mustacheConfig.tags]
        }
        if (opt.mustacheConfig.disable === true) {
          i18n.#mustacheConfig.disable = true
        }
      }
      i18n.#updateMustacheTags()

      const locales = opt.staticCatalog
        ? Object.keys(opt.staticCatalog)
        : opt.locales || i18n.#guessLocales(i18n.#directory)

      if (opt.staticCatalog) {
        i18n.#staticCatalog = true
        i18n.#updateFiles = false
        i18n.#autoReload = false
        i18n.#syncFiles = false
      }

      if (Array.isArray(locales)) {
        if (opt.staticCatalog) {
          for (const locale of locales) {
            if (!isValidLocale(locale)) {
              throw new TypeError('Invalid locale: ' + locale)
            }
            const catalog = opt.staticCatalog[locale]
            if (
              catalog === null ||
              typeof catalog !== 'object' ||
              Array.isArray(catalog)
            ) {
              throw new TypeError('Locale catalog must be an object')
            }
          }
          i18n.#locales = opt.staticCatalog
        } else {
          locales.forEach(i18n.#read)
        }

        if (i18n.#autoReload) {
          i18n.#watchedLocales = new Set(locales)
          i18n.#autoReloadWatcher = fs.watch(
            i18n.#directory,
            { persistent: false },
            (event, filename) => {
              i18n.#reloadWatchedFile(filename, i18n.#extension || '.json')
              if (i18n.#extension !== '.js') {
                i18n.#reloadWatchedFile(filename, '.js')
              }
            }
          )
        }
      }

      if (opt.register && typeof opt.register === 'object') {
        i18n.#register = opt.register
        const objects = Array.isArray(opt.register) ? opt.register : [opt.register]
        for (const object of objects) {
          i18n.#applyAPIToObject(object)
          i18n.setLocale(object, i18n.#defaultLocale)
        }
      }
    })(this)

  init = ((i18n) =>
    function i18nInit(request, response, next) {
      if (typeof request === 'object') {
        i18n.#guessLanguage(request)
        i18n.#applyAPIToObject(request)
        i18n.setLocale(request, request.locale)
      } else {
        return i18n.#logError(
          'i18n.init must be called with one parameter minimum, ie. i18n.init(req)'
        )
      }

      if (typeof response === 'object') {
        i18n.#applyAPIToObject(response)
        i18n.setLocale(response, request.locale)
      }

      if (typeof next === 'function') {
        return next()
      }
    })(this)

  __ = ((i18n) =>
    function i18nTranslate(phrase) {
      let msg
      let namedValues = EMPTY_OBJECT
      let args = EMPTY_ARRAY

      if (
        typeof phrase === 'string' &&
        (arguments.length === 1 ||
          (arguments.length === 2 && i18n.#argsEndWithNamedObject(arguments)))
      ) {
        namedValues = arguments[1] ?? EMPTY_OBJECT
        msg = i18n.#translate(i18n.#getLocaleFromObject(this), phrase)
      } else {
        const parsed = i18n.#parseArgv(arguments)
        namedValues = parsed[0]
        args = parsed[1]
        if (typeof phrase === 'object') {
          if (
            typeof phrase.locale === 'string' &&
            typeof phrase.phrase === 'string'
          ) {
            msg = i18n.#translate(phrase.locale, phrase.phrase)
          }
        } else {
          msg = i18n.#translate(i18n.#getLocaleFromObject(this), phrase)
        }
      }

      if (msg && typeof msg === 'object' && msg.one != null) {
        msg = msg.one
      }

      if (msg && typeof msg === 'object' && msg.other != null) {
        msg = msg.other
      }

      return i18n.#postProcess(msg, namedValues, args)
    })(this)

  __l = ((i18n) =>
    function i18nTranslationList(phrase) {
      const translations = []
      Object.keys(i18n.#locales)
        .sort()
        .forEach((locale) => {
          translations.push(i18n.__({ phrase, locale }))
        })
      return translations
    })(this)

  __h = ((i18n) =>
    function i18nTranslationHash(phrase) {
      const translations = []
      Object.keys(i18n.#locales)
        .sort()
        .forEach((locale) => {
          translations.push({ [locale]: i18n.__({ phrase, locale }) })
        })
      return translations
    })(this)

  __n = ((i18n) =>
    function i18nTranslatePlural(singular, plural, count) {
      let shortCount = typeof plural === 'number'
      if (typeof singular === 'string' && typeof plural === 'string') {
        const number = Number(plural)
        shortCount = String(number) === plural || (
          (arguments.length === 2 || (arguments.length === 3 && i18n.#argsEndWithNamedObject(arguments))) &&
          plural.trim() !== '' && !Number.isNaN(number)
        )
      }
      if (typeof singular === 'string' && (
        (arguments.length === 2 && shortCount) ||
        (arguments.length === 3 && typeof plural === 'string' && !shortCount)
      )) {
        const targetLocale = i18n.#resolveLocale(i18n.#getLocaleFromObject(this))
        if (arguments.length === 2) {
          count = plural
          plural = singular
        }
        let msg = i18n.#translate(targetLocale, singular, plural)
        const numericCount =
          typeof count === 'number' ? count : Number(count)

        if (msg && typeof msg === 'object') {
          msg = i18n.#selectPlural(msg, targetLocale, numericCount)
        }

        return i18n.#postProcess(msg, EMPTY_OBJECT, EMPTY_ARRAY, numericCount)
      }

      let msg
      let namedValues
      let targetLocale
      let args = []

      if (i18n.#argsEndWithNamedObject(arguments)) {
        namedValues = arguments[arguments.length - 1]
        args =
          arguments.length >= 5
            ? Array.prototype.slice.call(arguments, 3, -1)
            : []
      } else {
        namedValues = {}
        args =
          arguments.length >= 4 ? Array.prototype.slice.call(arguments, 3) : []
      }

      if (typeof singular === 'object') {
        if (
          typeof singular.locale === 'string' &&
          typeof singular.singular === 'string' &&
          typeof singular.plural === 'string'
        ) {
          targetLocale = i18n.#resolveLocale(singular.locale)
          msg = i18n.#translate(
            targetLocale,
            singular.singular,
            singular.plural
          )
        }
        const hasInlineCount = typeof singular.count === 'number' ||
          typeof singular.count === 'string'
        args = Array.prototype.slice.call(
          arguments, hasInlineCount ? 1 : 2,
          i18n.#argsEndWithNamedObject(arguments) ? -1 : undefined
        )

        if (hasInlineCount) {
          count = singular.count
        } else if (typeof plural === 'number' || typeof plural === 'string') {
          count = plural
        }
      } else {
        if (shortCount) {
          args = Array.prototype.slice.call(
            arguments,
            2,
            i18n.#argsEndWithNamedObject(arguments) ? -1 : undefined
          )
          count = plural
          plural = singular
        }

        targetLocale = i18n.#resolveLocale(i18n.#getLocaleFromObject(this))
        msg = i18n.#translate(
          targetLocale,
          singular,
          plural
        )
      }

      if (count === null) {
        count = namedValues.count
      }
      count = Number(count)

      if (msg && typeof msg === 'object') {
        msg = i18n.#selectPlural(msg, targetLocale, count)
      }

      return i18n.#postProcess(msg, namedValues, args, count)
    })(this)

  setLocale = ((i18n) =>
    function i18nSetLocale(object, locale, skipImplicitObjects) {
      if (Array.isArray(object) && typeof locale === 'string') {
        for (let i = object.length - 1; i >= 0; i -= 1) {
          i18n.setLocale(object[i], locale, true)
        }
        return i18n.getLocale(object[0])
      }

      let targetObject = object
      let targetLocale = locale

      if (locale === undefined && typeof object === 'string') {
        targetObject = this
        targetLocale = object
      }

      if (!i18n.#hasLocale(targetLocale)) {
        targetLocale = i18n.#getFallback(targetLocale, i18n.#fallbacks) || targetLocale
      }

      const selected = i18n.#hasLocale(targetLocale)
        ? targetLocale
        : i18n.#defaultLocale

      if (!skipImplicitObjects && (targetObject.res || targetObject.locals)) {
        i18n.#visitScopes(targetObject, (scope) => { scope.locale = selected })
      } else {
        targetObject.locale = selected
      }

      if (i18n.#register && !skipImplicitObjects) {
        if (Array.isArray(i18n.#register)) {
          i18n.#register.forEach((registeredObject) => { registeredObject.locale = selected })
        } else {
          i18n.#register.locale = selected
        }
      }

      return i18n.getLocale(targetObject)
    })(this)

  getLocale = ((i18n) =>
    function i18nGetLocale(request) {
      if (request && request.locale) {
        return request.locale
      }

      return this.locale || i18n.#defaultLocale
    })(this)

  getCatalog = ((i18n) =>
    function i18nGetCatalog(object, locale) {
      let targetLocale

      if (
        typeof object === 'object' &&
        typeof object.locale === 'string' &&
        locale === undefined
      ) {
        targetLocale = object.locale
      }

      if (
        !targetLocale &&
        typeof object === 'object' &&
        typeof locale === 'string'
      ) {
        targetLocale = locale
      }

      if (!targetLocale && locale === undefined && typeof object === 'string') {
        targetLocale = object
      }

      if (
        !targetLocale &&
        object === undefined &&
        locale === undefined &&
        typeof this.locale === 'string'
      ) {
        if (i18n.#register && i18n.#register.global) {
          targetLocale = ''
        } else {
          targetLocale = this.locale
        }
      }

      if (targetLocale === undefined || targetLocale === '') {
        return i18n.#locales
      }

      if (!i18n.#hasLocale(targetLocale)) {
        targetLocale =
          i18n.#getFallback(targetLocale, i18n.#fallbacks) || targetLocale
      }

      if (i18n.#hasLocale(targetLocale)) {
        return i18n.#locales[targetLocale]
      }

      i18n.#logWarn('No catalog found for "' + targetLocale + '"')
      return false
    })(this)

  getLocales = ((i18n) =>
    function i18nGetLocales() {
      return i18n.#localesKeys()
    })(this)

  addLocale = ((i18n) =>
    function i18nAddLocale(locale) {
      i18n.#read(locale)
      i18n.#watchedLocales.add(locale)
    })(this)

  removeLocale = ((i18n) =>
    function i18nRemoveLocale(locale) {
      delete i18n.#locales[locale]
      i18n.#watchedLocales.delete(locale)
      i18n.#failedCatalogs.delete(locale)
    })(this)

  #localesKeys = () => Object.keys(this.#locales)

  // Locale names and catalog shapes are validated when catalogs are loaded.
  #hasLocale = (locale) => typeof locale === 'string' && Object.hasOwn(this.#locales, locale)

  #selectPlural = (message, locale, count) => {
    let resolver = this.#pluralsForLocale[locale]
    if (!resolver) {
      const parts = locale.toLowerCase().split(/[_-\s]+/)
      let cardinal
      while (parts.length && !cardinal) {
        cardinal = PLURAL_RULES.get(parts.join('-'))
        parts.pop()
      }
      cardinal ||= MakePlural.en
      const categories = Object.create(null)
      resolver = (value) => {
        if (Number.isInteger(value) && value >= 0 && value < SMALL_PLURAL_COUNT_LIMIT) {
          return categories[value] ??= cardinal(value)
        }
        return cardinal(value)
      }
      this.#pluralsForLocale[locale] = resolver
    }
    return message[resolver(count)] ?? message.other
  }

  #resetConfiguration = () => {
    delete this.locale
    if (this.#autoReloadWatcher) {
      this.#autoReloadWatcher.close()
      this.#autoReloadWatcher = undefined
    }

    this.#pluralsForLocale = {}
    this.#locales = {}
    this.#staticCatalog = false
    this.#failedCatalogs.clear()
    this.#watchedLocales.clear()
    this.#api = cloneApi()
    this.#mustacheConfig = cloneMustacheConfig()
    this.#autoReload = false
    this.#cookiename = null
    this.#languageHeaderName = 'accept-language'
    this.#defaultLocale = 'en'
    this.#retryInDefaultLocale = false
    this.#directory = DEFAULT_DIRECTORY
    this.#directoryPermissions = null
    this.#extension = '.json'
    this.#fallbacks = {}
    this.#indent = '\t'
    this.#logDebugFn = debug
    this.#logWarnFn = warn
    this.#logErrorFn = error
    this.#preserveLegacyCase = true
    this.#objectNotation = false
    this.#prefix = ''
    this.#queryParameter = null
    this.#register = null
    this.#updateFiles = true
    this.#syncFiles = false
    this.#missingKeyFn = undefined
    this.#parser = JSON
    this.#messageFeatures.clear()
    this.#objectPathSegments.clear()
    this.#updateMustacheTags()
  }

  #updateMustacheTags = () => {
    const [start, end] = this.#mustacheConfig.tags
    if (this.#mustacheConfig.tags.length !== 2 ||
        typeof start !== 'string' || !start ||
        typeof end !== 'string' || !end) {
      throw new TypeError('Mustache tags must be two nonempty strings')
    }
    this.#mustacheStart = start
    this.#mustacheEnd = end
    this.#messageFeatures.clear()
  }

  #postProcess = (msg, namedValues, args, count) => {
    if (typeof msg !== 'string') {
      return msg
    }

    const features = this.#getMessageFeatures(msg)
    if (features.flags & MESSAGE_FEATURE_INTERVAL) {
      msg = this.#parsePluralInterval(msg, count, features)
    }

    if (
      typeof count === 'number' &&
      (features.flags & MESSAGE_FEATURE_PERCENT) !== 0
    ) {
      msg = printf(msg, count)
    }

    if (
      !this.#mustacheConfig.disable &&
      (features.flags & MESSAGE_FEATURE_MUSTACHE) !== 0
    ) {
      msg = renderMustache(msg, namedValues, this.#mustacheConfig.tags)
    }

    if (
      args.length > 0 &&
      (features.flags & MESSAGE_FEATURE_PERCENT) !== 0
    ) {
      msg = printfArgs(msg, args)
    }

    return msg
  }

  #getMessageFeatures = (msg) => {
    let features = this.#messageFeatures.get(msg)
    if (features !== undefined) {
      return features
    }

    features = { flags: 0, intervals: undefined }
    if (msg.includes('|')) {
      features.flags |= MESSAGE_FEATURE_INTERVAL
    }
    if (msg.includes('%')) {
      features.flags |= MESSAGE_FEATURE_PERCENT
    }
    if (
      msg.includes(this.#mustacheStart) &&
      msg.includes(this.#mustacheEnd)
    ) {
      features.flags |= MESSAGE_FEATURE_MUSTACHE
    }

    this.#messageFeatures.set(msg, features)
    return features
  }

  #argsEndWithNamedObject = (args) =>
    args.length > 1 &&
    args[args.length - 1] !== null &&
    typeof args[args.length - 1] === 'object'

  #parseArgv = (args) => {
    const hasNamedValues = this.#argsEndWithNamedObject(args)
    const end = args.length - Number(hasNamedValues)
    const namedValues = hasNamedValues ? args[end] : {}
    const positional = []
    for (let index = 1; index < end; index += 1) {
      positional.push(args[index])
    }
    return [namedValues, positional]
  }

  #visitScopes = (root, visit) => {
    const pending = [root]
    const seen = new Set()
    while (pending.length) {
      const scope = pending.pop()
      if (!scope || typeof scope !== 'object' || seen.has(scope)) continue
      seen.add(scope)
      visit(scope)
      if (scope.locals) pending.push(scope.locals)
      if (scope.res) pending.push(scope.res)
    }
  }

  #applyAPIToObject = (root) => {
    this.#visitScopes(root, (scope) => {
      for (const [method, alias] of Object.entries(this.#api)) {
        const current = scope[alias]
        const installed = boundHelpers.get(current)
        if (current && (!installed || (installed.scope === scope && installed.method === this[method]))) {
          continue
        }
        const bound = this[method].bind(scope)
        boundHelpers.set(bound, { scope, method: this[method] })
        scope[alias] = bound
      }
      if (!scope.locale) scope.locale = this.#defaultLocale
    })
  }

  #guessLocales = (directory) => {
    let entries
    try {
      entries = fs.readdirSync(directory)
    } catch (error) {
      if (error.code === 'ENOENT') return [this.#defaultLocale]
      throw error
    }
    const locales = []

    for (let i = entries.length - 1; i >= 0; i -= 1) {
      if (entries[i].startsWith('.')) {
        continue
      }
      const localeFromFile = this.#guessLocaleFromFile(entries[i])
      if (localeFromFile) {
        locales.push(localeFromFile)
      }
    }

    return locales.sort()
  }

  #reloadWatchedFile = (filename, extension) => {
    const locale = this.#guessLocaleFromFile(filename, extension)
    if (locale && this.#watchedLocales.has(locale)) {
      this.#logDebug('Auto reloading locale file "' + filename + '".')
      this.#read(locale)
    }
  }

  #guessLocaleFromFile = (filename, extension = this.#extension || '.json') => {
    if (typeof filename !== 'string') {
      return false
    }
    if (!filename.startsWith(this.#prefix) || !filename.endsWith(extension)) {
      return false
    }
    return filename.slice(this.#prefix.length, -extension.length)
  }

  #extractQueryLanguage = (queryLanguage) => {
    if (Array.isArray(queryLanguage)) {
      return queryLanguage.find((lang) => typeof lang === 'string' && lang !== '')
    }
    return typeof queryLanguage === 'string' && queryLanguage
  }

  #guessLanguage = (request) => {
    if (typeof request === 'object') {
      const languageHeader = request.headers?.[this.#languageHeaderName] ??
        request.headers?.[this.#languageHeaderName.toLowerCase()]
      const languages = []
      const regions = []

      request.languages = [this.#defaultLocale]
      request.regions = [this.#defaultLocale]
      request.language = this.#defaultLocale
      request.region = this.#defaultLocale

      if (this.#queryParameter) {
        let languageQueryParameter

        if (
          request.query &&
          typeof request.query === 'object' &&
          Object.hasOwn(request.query, this.#queryParameter)
        ) {
          languageQueryParameter = request.query[this.#queryParameter]
        }

        if (languageQueryParameter === undefined && request.url) {
          const urlAsString =
            typeof request.url === 'string' ? request.url : request.url.toString()
          const queryIndex = urlAsString.indexOf('?')
          const fragmentIndex = urlAsString.indexOf('#')
          const query = queryIndex >= 0 && (fragmentIndex < 0 || queryIndex < fragmentIndex)
            ? urlAsString.slice(queryIndex + 1, fragmentIndex < 0 ? undefined : fragmentIndex)
            : ''
          const queryParameters = new URLSearchParams(query).getAll(this.#queryParameter)
          languageQueryParameter =
            queryParameters.length <= 1 ? queryParameters[0] : queryParameters
        }

        if (
          languageQueryParameter !== undefined &&
          languageQueryParameter !== null
        ) {
          let queryLanguage = this.#extractQueryLanguage(languageQueryParameter)
          if (queryLanguage) {
            this.#logDebug('Overriding locale from query: ' + queryLanguage)
            if (this.#preserveLegacyCase) {
              queryLanguage = queryLanguage.toLowerCase()
            }
            return this.setLocale(request, queryLanguage)
          }
        }
      }

      const cookieLanguage = this.#cookiename && request.cookies?.[this.#cookiename]
      if (typeof cookieLanguage === 'string' && cookieLanguage) {
        request.language = cookieLanguage
        return this.setLocale(request, request.language)
      }

      if (languageHeader) {
        const acceptedLanguages = this.#getAcceptedLanguagesFromHeader(
          languageHeader
        )
        let match
        let fallbackMatch
        let fallback
        const headerFallbacks = Object.fromEntries(
          Object.entries(this.#fallbacks ?? {}).map(([key, value]) => [key.toLowerCase(), value])
        )
        const processedLanguages = new Set()
        const catalogNames = new Map(
          this.#localesKeys().map((locale) => [locale.toLowerCase(), locale])
        )

        for (let i = 0; i < acceptedLanguages.length; i += 1) {
          const lang = acceptedLanguages[i]
          if (processedLanguages.has(lang)) {
            continue
          }
          processedLanguages.add(lang)
          const localeParts = lang.split('-', 2)
          const parentLang = localeParts[0]
          const region = localeParts[1]

          const fallbackLang = this.#getFallback(lang.toLowerCase(), headerFallbacks)
          if (fallbackLang && !processedLanguages.has(fallbackLang)) {
            fallback = fallbackLang
            const fallbackIndex = acceptedLanguages.indexOf(fallback)
            if (fallbackIndex > i) {
              acceptedLanguages.splice(fallbackIndex, 1)
            }
            acceptedLanguages.splice(i + 1, 0, fallback)
          }

          const fallbackParentLang = this.#getFallback(
            parentLang.toLowerCase(),
            headerFallbacks
          )
          if (fallbackParentLang) {
            fallback = fallbackParentLang
            if (acceptedLanguages.indexOf(fallback) < 0) {
              acceptedLanguages.push(fallback)
            }
          }

          if (languages.indexOf(parentLang) < 0) {
            languages.push(parentLang.toLowerCase())
          }
          if (region) {
            regions.push(region.toLowerCase())
          }

          if (!match && catalogNames.has(lang.toLowerCase())) {
            match = catalogNames.get(lang.toLowerCase())
            break
          }

          let parent = lang.toLowerCase()
          while (!fallbackMatch && parent.includes('-')) {
            parent = parent.slice(0, parent.lastIndexOf('-'))
            fallbackMatch = catalogNames.get(parent)
          }
        }

        request.language = match || fallbackMatch || request.language
        request.region = regions[0] || request.region
        return this.setLocale(request, request.language)
      }
    }

    return this.setLocale(request, this.#defaultLocale)
  }

  #getAcceptedLanguagesFromHeader = (header) => {
    if (typeof header !== 'string') {
      return []
    }
    return header.split(',')
      .map((item) => {
        const match = item.trim().match(/^([^;\s]+)(?:\s*;\s*q=(0(?:\.\d{0,3})?|1(?:\.0{0,3})?))?$/i)
        return match ? { locale: match[1], quality: match[2] === undefined ? 1 : Number(match[2]) } : null
      })
      .filter((item) => item && item.quality > 0)
      .sort((a, b) => b.quality - a.quality)
      .map((item) => item.locale)
  }

  #getLocaleFromObject = (object) => {
    let locale
    if (object && object.scope) {
      locale = object.scope.locale
    }
    if (object && object.locale) {
      locale = object.locale
    }
    return locale
  }

  #parsePluralInterval = (phrase, count, features) => {
    // Retain compiled rules only after a message is reused. One-off strings
    // take the direct parsing path instead of allocating cached rule objects.
    const cacheRules = features.intervals !== undefined
    const rules = features.intervals ?? phrase.split('|')
    features.intervals = cacheRules ? rules : null
    let fallback
    let intervalRuleExists = false

    for (let index = 0; index < rules.length; index += 1) {
      const rule = rules[index]
      if (!cacheRules) {
        const selected = matchIntervalPrefix(rule, count)
        if (selected === null) {
          fallback = rule
        } else {
          intervalRuleExists = true
          if (selected !== false) {
            return selected
          }
        }
        continue
      }
      let part
      let interval
      let text
      if (typeof rule === 'string') {
        part = rule
        const parsed = parseIntervalPrefix(part)
        interval = parsed?.interval ?? null
        text = parsed?.text
        rules[index] = { part, interval, text }
      } else {
        part = rule.part
        interval = rule.interval
        text = rule.text
      }

      if (interval) {
        intervalRuleExists = true
        if (typeof count !== 'number') {
          continue
        }
        const { from, to } = interval
        if (
          (count > from.value || (count === from.value && from.included)) &&
          (count < to.value || (count === to.value && to.included))
        ) {
          return text
        }
      } else {
        fallback = part
      }
    }

    return intervalRuleExists && fallback !== undefined ? fallback : phrase
  }

  #loadLocale = (locale) => {
    if (!this.#hasLocale(locale) && !this.#failedCatalogs.has(locale)) this.#read(locale)
    return this.#hasLocale(locale)
  }

  #resolveLocale = (locale) => {
    if (this.#hasLocale(locale)) {
      return locale
    }

    if (locale === undefined) {
      this.#logWarn(
        'WARN: No locale found - check the context of the call to __(). Using ' +
          this.#defaultLocale +
          ' as current locale'
      )
      locale = this.#defaultLocale
    }

    if (!isValidLocale(locale)) {
      throw new TypeError('Invalid locale: ' + locale)
    }

    if (!this.#hasLocale(locale)) {
      locale = this.#getFallback(locale, this.#fallbacks) || locale
    }

    if (this.#loadLocale(locale)) return locale

    this.#logWarn(
      'WARN: Locale ' + locale + " couldn't be read - check the context of the call to $__. Using " +
        this.#defaultLocale + ' (default) as current locale'
    )
    if (this.#hasLocale(this.#defaultLocale)) return this.#defaultLocale
    const fallback = this.#getFallback(this.#defaultLocale, this.#fallbacks)
    if (fallback && fallback !== locale && this.#loadLocale(fallback)) return fallback

    if (locale === this.#defaultLocale || !this.#loadLocale(this.#defaultLocale)) {
      this.#locales[this.#defaultLocale] = {}
      if (this.#autoReload) this.#watchedLocales.add(this.#defaultLocale)
    }
    return this.#defaultLocale
  }

  #getRetryLocale = (locale, skipRetry) => {
    if (skipRetry || !this.#retryInDefaultLocale || locale === this.#defaultLocale) {
      return undefined
    }
    const retryLocale = this.#resolveLocale(this.#defaultLocale)
    return retryLocale === locale ? undefined : retryLocale
  }

  #translate = (locale, singular, plural) => {
    if (!this.#hasLocale(locale)) locale = this.#resolveLocale(locale)
    const synced = this.#syncFiles ? new Map() : undefined
    const value = this.#translateInLocale(locale, singular, plural, synced)
    if (value === PENDING_TRANSLATION) return {}

    if (synced) {
      for (const target of this.#localesKeys()) {
        if (!synced.has(target)) this.#translateInLocale(target, singular, plural, synced)
      }
    }
    return value
  }

  #inlineDefaultIndex = (phrase) => {
    let colon = phrase.indexOf(':')
    if (colon < 0) return colon
    const separator = this.#objectNotation
    const offset = separator.indexOf(':')
    if (offset < 0) return colon
    while (colon >= offset && phrase.startsWith(separator, colon - offset)) {
      colon = phrase.indexOf(':', colon - offset + separator.length)
    }
    return colon
  }

  #translateInLocale = (locale, singular, plural, synced, skipRetry) => {
    if (synced?.has(locale)) return synced.get(locale)
    let defaultSingular = singular
    let defaultPlural = plural
    const originalSingular = singular
    if (this.#objectNotation) {
      let indexOfColon = this.#inlineDefaultIndex(singular)
      if (indexOfColon > 0) {
        defaultSingular = singular.substring(indexOfColon + 1)
        singular = singular.substring(0, indexOfColon)
      }
      if (typeof plural === 'string') {
        indexOfColon = this.#inlineDefaultIndex(plural)
        if (indexOfColon > 0) {
          defaultPlural = plural.substring(indexOfColon + 1)
        }
      }
    }

    const pathSegments = this.#getObjectPathSegments(singular)
    const catalog = this.#locales[locale]
    const existing = pathSegments
      ? this.#getObjectValue(catalog, pathSegments)
      : Object.hasOwn(catalog, singular) ? catalog[singular] : undefined
    if (existing != null) {
      synced?.set(locale, existing)
      return existing
    }

    let pending = this.#pendingMissingKeys.get(catalog)
    // A callback can translate its own key before it returns a value to store.
    if (pending?.has(singular)) {
      return PENDING_TRANSLATION
    }
    const retryLocale = this.#getRetryLocale(locale, skipRetry)
    let value
    if (retryLocale !== undefined) {
      this.#logDebug('Missing ' + singular + ' in ' + locale + ' retrying in ' + retryLocale)
      value = this.#translateInLocale(retryLocale, originalSingular, plural, synced, true)
      if (value === PENDING_TRANSLATION) return value
    } else {
      value = typeof plural === 'string'
        ? { one: defaultSingular, other: defaultPlural }
        : defaultSingular
    }

    if (this.#missingKeyFn) {
      if (!pending) {
        pending = new Set()
        this.#pendingMissingKeys.set(catalog, pending)
      }
      pending.add(singular)
      try {
        value = this.#missingKeyFn(locale, value)
      } finally {
        pending.delete(singular)
      }
    }

    if (pathSegments) {
      this.#setObjectValue(catalog, pathSegments, value)
    } else {
      setOwn(catalog, singular, value)
    }
    this.#write(locale)
    synced?.set(locale, value)
    return value
  }

  #getObjectPathSegments = (singular) => {
    if (!this.#objectNotation) {
      return null
    }

    let segments = this.#objectPathSegments.get(singular)
    if (segments !== undefined) {
      return segments
    }

    const lastSeparator = singular.lastIndexOf(this.#objectNotation)
    if (lastSeparator <= 0 || lastSeparator + this.#objectNotation.length === singular.length) {
      this.#objectPathSegments.set(singular, null)
      return null
    }

    segments = singular.split(this.#objectNotation)
    this.#objectPathSegments.set(singular, segments)

    return segments
  }

  #getObjectValue = (catalog, segments) => {
    let value = catalog
    for (const key of segments) {
      if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) {
        return undefined
      }
      value = value[key]
    }
    return value
  }

  #setObjectValue = (catalog, segments, value) => {
    let object = catalog
    for (let index = 0; index < segments.length - 1; index += 1) {
      const key = segments[index]
      let child = Object.hasOwn(object, key) ? object[key] : undefined
      if (child === null || typeof child !== 'object') {
        child = setOwn(object, key, {})
      }
      object = child
    }

    setOwn(object, segments.at(-1), value)
  }

  #read = (locale) => {
    if (!isValidLocale(locale)) {
      throw new TypeError('Invalid locale: ' + locale)
    }
    if (this.#staticCatalog) {
      return
    }
    let localeFile = {}
    const file = this.#getStorageFilePath(locale)

    try {
      this.#logDebug('read ' + file + ' for locale: ' + locale)
      localeFile = fs.readFileSync(file, 'utf-8')
      try {
        const catalog = this.#parser.parse(localeFile)
        if (
          catalog === null ||
          typeof catalog !== 'object' ||
          Array.isArray(catalog)
        ) {
          throw new TypeError('Locale catalog must be an object')
        }
        this.#locales[locale] = catalog
        this.#failedCatalogs.delete(locale)
      } catch (parseError) {
        this.#logError(
          'unable to parse locales from file (maybe ' +
            file +
            ' is empty or invalid json?): ',
          parseError
        )
        this.#failedCatalogs.set(locale, file)
      }
    } catch (readError) {
      if (fs.existsSync(file)) {
        this.#failedCatalogs.set(locale, file)
        this.#logError('unable to read locale file ' + file, readError)
      } else {
        this.#failedCatalogs.delete(locale)
        if (!this.#hasLocale(locale)) {
          this.#logDebug('initializing ' + file)
          this.#write(locale)
        }
      }
    }
    if (this.#autoReload && (this.#hasLocale(locale) || this.#failedCatalogs.has(locale))) {
      this.#watchedLocales.add(locale)
    }
  }

  #backupFailedCatalog = (file) => {
    for (let suffix = 0; ; suffix += 1) {
      const backup = file + '.invalid' + (suffix ? '.' + suffix : '')
      try {
        fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL)
        this.#logDebug('backed up invalid locale file to ' + backup)
        return
      } catch (error) {
        if (error.code !== 'EEXIST') {
          throw error
        }
      }
    }
  }

  #write = (locale) => {
    let target
    let tmp

    if (!this.#updateFiles) {
      return
    }

    try {
      fs.lstatSync(this.#directory)
    } catch (error) {
      this.#logDebug('creating locales dir in: ' + this.#directory)
      try {
        fs.mkdirSync(this.#directory, { recursive: true, mode: this.#directoryPermissions ?? undefined })
      } catch (mkdirError) {
        if (mkdirError.code !== 'EEXIST') {
          throw mkdirError
        }
      }
    }

    if (!this.#locales[locale]) {
      this.#locales[locale] = {}
    }

    try {
      target = this.#getStorageFilePath(locale)
      const contents = this.#parser.stringify(this.#locales[locale], null, this.#indent)
      const current = fs.statSync(target, { throwIfNoEntry: false })
      const mode = current && (current.mode & 0o777)
      tmp = path.join(path.dirname(target), '.' + randomUUID() + '.tmp')
      const fd = fs.openSync(tmp, 'wx', mode)
      try {
        try {
          fs.writeFileSync(fd, contents, 'utf8')
          if (mode !== undefined) fs.fchmodSync(fd, mode)
        } finally {
          fs.closeSync(fd)
        }
        const failedFile = this.#failedCatalogs.get(locale)
        if (failedFile) this.#backupFailedCatalog(failedFile)
        fs.renameSync(tmp, target)
        this.#failedCatalogs.delete(locale)
      } catch (error) {
        fs.rmSync(tmp, { force: true })
        throw error
      }
    } catch (error) {
      this.#logError(
        'unexpected error writing files (either ' +
          tmp +
          ' or ' +
          target +
          ' are not writeable?): ',
        error
      )
    }
  }

  #getStorageFilePath = (locale) => {
    if (!isValidLocale(locale)) {
      throw new TypeError('Invalid locale: ' + locale)
    }
    const ext = this.#extension || '.json'
    const filepath = path.normalize(
      this.#directory + path.sep + this.#prefix + locale + ext
    )
    const filepathJS = path.normalize(
      this.#directory + path.sep + this.#prefix + locale + '.js'
    )

    for (const candidate of [filepath, filepathJS]) {
      const relative = path.relative(
        path.resolve(this.#directory), path.resolve(candidate)
      )
      if (
        relative === '..' ||
        relative.startsWith('..' + path.sep) ||
        path.isAbsolute(relative)
      ) {
        throw new TypeError('Locale file must be inside the locale directory')
      }
    }

    try {
      if (ext !== '.js' && fs.statSync(filepathJS).isFile()) {
        this.#logDebug('using existing file ' + filepathJS)
        return filepathJS
      }
    } catch (error) {
      this.#logDebug('will use ' + filepath)
    }

    return filepath
  }

  #getFallback = (targetLocale, fallbacks = {}) => {
    if (!isValidLocale(targetLocale) || !fallbacks) {
      return null
    }
    if (
      Object.hasOwn(fallbacks, targetLocale) &&
      isValidLocale(fallbacks[targetLocale])
    ) {
      return fallbacks[targetLocale]
    }

    let fallbackLocale = null
    for (const key in fallbacks) {
      if (!Object.hasOwn(fallbacks, key) || !isValidLocale(fallbacks[key])) {
        continue
      }
      const pattern = '^' + key.split('*').map(RegExp.escape).join('.*') + '$'
      if (targetLocale.match(new RegExp(pattern))) {
        fallbackLocale = fallbacks[key]
        break
      }
    }

    return fallbackLocale
  }

  #logDebug = (msg) => {
    this.#logDebugFn(msg)
  }

  #logWarn = (msg) => {
    this.#logWarnFn(msg)
  }

  #logError = (msg, errorValue) => {
    this.#logErrorFn(msg, errorValue)
  }
}

export default I18n
