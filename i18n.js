/**
 * @author      Created by Marcus Spiegel <spiegel@uscreen.de> on 2011-03-25.
 * @link        https://github.com/mashpie/i18n-node
 * @license     http://opensource.org/licenses/MIT
 */

import fs from 'node:fs'
import path from 'node:path'
import { URLSearchParams } from 'node:url'
import * as MakePlural from 'make-plural'
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
const EMPTY_ARRAY = Object.freeze([])
const EMPTY_OBJECT = Object.freeze({})
const MESSAGE_FEATURE_INTERVAL = 1
const MESSAGE_FEATURE_PERCENT = 2
const MESSAGE_FEATURE_MUSTACHE = 4
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
    this.#missingKeyFn = this.#missingKey
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
          : i18n.#missingKey
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
              const localeFromFile = i18n.#guessLocaleFromFile(filename)

              if (localeFromFile && i18n.#watchedLocales.has(localeFromFile)) {
                i18n.#logDebug('Auto reloading locale file "' + filename + '".')
                i18n.#read(localeFromFile)
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
      if (
        typeof singular === 'string' &&
        ((arguments.length === 2 &&
          (typeof plural === 'number' ||
            (typeof plural === 'string' && String(Number(plural)) === plural))) ||
          (arguments.length === 3 &&
            typeof plural === 'string' && String(Number(plural)) !== plural))
      ) {
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

        if (typeof plural === 'number' || Number(plural) + '' === plural) {
          count = plural
        }

        if (hasInlineCount) {
          count = singular.count
        }
      } else {
        if (typeof plural === 'number' || Number(plural) + '' === plural) {
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

      targetObject.locale = i18n.#hasLocale(targetLocale)
        ? targetLocale
        : i18n.#defaultLocale

      if (i18n.#register && typeof i18n.#register === 'object') {
        if (Array.isArray(i18n.#register) && !skipImplicitObjects) {
          i18n.#register.forEach((registeredObject) => {
            registeredObject.locale = targetObject.locale
          })
        } else {
          i18n.#register.locale = targetObject.locale
        }
      }

      if (targetObject.res && !skipImplicitObjects) {
        if (targetObject.res.locals) {
          i18n.setLocale(targetObject.res, targetObject.locale, true)
          i18n.setLocale(targetObject.res.locals, targetObject.locale, true)
        } else {
          i18n.setLocale(targetObject.res, targetObject.locale)
        }
      }

      if (targetObject.locals && !skipImplicitObjects) {
        if (targetObject.locals.res) {
          i18n.setLocale(targetObject.locals, targetObject.locale, true)
          i18n.setLocale(targetObject.locals.res, targetObject.locale, true)
        } else {
          i18n.setLocale(targetObject.locals, targetObject.locale)
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
  #hasLocale = (locale) => Object.hasOwn(this.#locales, locale)

  #selectPlural = (message, locale, count) => {
    let resolver = this.#pluralsForLocale[locale]
    if (!resolver) {
      const parts = locale.toLowerCase().split(/[_-\s]+/)
      while (parts.length && !resolver) {
        resolver = PLURAL_RULES.get(parts.join('-'))
        parts.pop()
      }
      resolver ||= MakePlural.en
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
    this.#missingKeyFn = this.#missingKey
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

  #applyAPIToObject = (object) => {
    let alreadySet = true

    for (const method in this.#api) {
      if (Object.hasOwn(this.#api, method)) {
        const alias = this.#api[method]
        if (!object[alias]) {
          alreadySet = false
          object[alias] = this[method].bind(object)
        }
      }
    }

    if (!object.locale) {
      object.locale = this.#defaultLocale
    }

    if (alreadySet) {
      return
    }

    if (object.res) {
      this.#applyAPIToObject(object.res)
    }

    if (object.locals) {
      this.#applyAPIToObject(object.locals)
    }
  }

  #guessLocales = (directory) => {
    const entries = fs.readdirSync(directory)
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

  #guessLocaleFromFile = (filename) => {
    const extension = this.#extension || '.json'
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
      const languageHeader = request.headers
        ? request.headers[this.#languageHeaderName]
        : undefined
      const languages = []
      const regions = []

      request.languages = [this.#defaultLocale]
      request.regions = [this.#defaultLocale]
      request.language = this.#defaultLocale
      request.region = this.#defaultLocale

      if (this.#queryParameter && request.url) {
        let languageQueryParameter

        if (
          request.query &&
          typeof request.query === 'object' &&
          Object.hasOwn(request.query, this.#queryParameter)
        ) {
          languageQueryParameter = request.query[this.#queryParameter]
        }

        if (languageQueryParameter === undefined) {
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

      if (
        this.#cookiename &&
        request.cookies &&
        request.cookies[this.#cookiename]
      ) {
        request.language = request.cookies[this.#cookiename]
        return this.setLocale(request, request.language)
      }

      if (languageHeader) {
        const acceptedLanguages = this.#getAcceptedLanguagesFromHeader(
          languageHeader
        )
        let match
        let fallbackMatch
        let fallback
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

          const fallbackLang = this.#getFallback(lang, this.#fallbacks)
          if (fallbackLang && !processedLanguages.has(fallbackLang)) {
            fallback = fallbackLang
            const fallbackIndex = acceptedLanguages.indexOf(fallback)
            if (fallbackIndex > i) {
              acceptedLanguages.splice(fallbackIndex, 1)
            }
            acceptedLanguages.splice(i + 1, 0, fallback)
          }

          const fallbackParentLang = this.#getFallback(
            parentLang,
            this.#fallbacks
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

          if (!fallbackMatch && catalogNames.has(parentLang.toLowerCase())) {
            fallbackMatch = catalogNames.get(parentLang.toLowerCase())
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

    if (!this.#hasLocale(locale) && !this.#failedCatalogs.has(locale)) {
      this.#read(locale)
    }

    if (!this.#hasLocale(locale)) {
      this.#logWarn(
        'WARN: Locale ' +
          locale +
          " couldn't be read - check the context of the call to $__. Using " +
          this.#defaultLocale +
          ' (default) as current locale'
      )

      locale = this.#defaultLocale
      if (!this.#hasLocale(locale)) {
        if (!this.#failedCatalogs.has(locale)) {
          this.#read(locale)
        }
        if (!this.#hasLocale(locale)) {
          this.#locales[locale] = {}
        }
      }
    }

    return locale
  }

  #getRetryLocale = (locale, skipRetry) => {
    if (skipRetry || !this.#retryInDefaultLocale || locale === this.#defaultLocale) {
      return undefined
    }
    const retryLocale = this.#resolveLocale(this.#defaultLocale)
    return retryLocale === locale ? undefined : retryLocale
  }

  #translate = (locale, singular, plural, skipSyncToAllFiles, skipRetry) => {
    if (!this.#hasLocale(locale)) {
      locale = this.#resolveLocale(locale)
    }
    if (!skipSyncToAllFiles && this.#syncFiles) {
      this.#syncToAllFiles(singular, plural)
    }

    let defaultSingular = singular
    let defaultPlural = plural
    const originalSingular = singular
    const originalPlural = plural
    if (this.#objectNotation) {
      let indexOfColon = singular.indexOf(':')
      if (indexOfColon > 0) {
        defaultSingular = singular.substring(indexOfColon + 1)
        singular = singular.substring(0, indexOfColon)
      }
      if (plural && typeof plural !== 'number') {
        indexOfColon = plural.indexOf(':')
        if (indexOfColon > 0) {
          defaultPlural = plural.substring(indexOfColon + 1)
          plural = plural.substring(0, indexOfColon)
        }
      }
    }

    const pathSegments = this.#getObjectPathSegments(singular)
    if (!pathSegments) {
      const catalog = this.#locales[locale]
      let value = Object.hasOwn(catalog, singular) ? catalog[singular] : undefined
      const retryLocale = value == null ? this.#getRetryLocale(locale, skipRetry) : undefined

      if (plural && value == null) {
        if (retryLocale !== undefined) {
          this.#logDebug(
            'Missing ' +
              singular +
              ' in ' +
              locale +
              ' retrying in ' +
              retryLocale
          )
          value = this.#translate(retryLocale, originalSingular, originalPlural, true, true)
        } else {
          value = {
            one: defaultSingular || singular,
            other: defaultPlural || plural
          }
        }

        setOwn(catalog, singular, this.#missingKeyFn(locale, value))
        this.#write(locale)
        value = catalog[singular]
      }

      if (value == null) {
        if (retryLocale !== undefined) {
          this.#logDebug(
            'Missing ' +
              singular +
              ' in ' +
              locale +
              ' retrying in ' +
              retryLocale
          )
          value = this.#translate(retryLocale, originalSingular, originalPlural, true, true)
        } else {
          value = defaultSingular || singular
        }

        setOwn(catalog, singular, this.#missingKeyFn(locale, value))
        this.#write(locale)
        value = catalog[singular]
      }

      return value
    }

    let value = this.#getObjectValue(locale, pathSegments)
    if (value != null) {
      return value
    }
    const retryLocale = this.#getRetryLocale(locale, skipRetry)

    if (plural) {
      if (retryLocale !== undefined) {
        this.#logDebug(
          'Missing ' +
            singular +
            ' in ' +
            locale +
            ' retrying in ' +
            retryLocale
        )
        this.#setObjectValue(locale, pathSegments, this.#translate(
          retryLocale, originalSingular, originalPlural, true, true
        ))
      } else {
        this.#setObjectValue(locale, pathSegments, {
          one: defaultSingular || singular,
          other: defaultPlural || plural
        })
      }
      this.#write(locale)
      value = this.#getObjectValue(locale, pathSegments)
    }

    if (value == null) {
      if (retryLocale !== undefined) {
        this.#logDebug(
          'Missing ' +
            singular +
            ' in ' +
            locale +
            ' retrying in ' +
            retryLocale
        )
        this.#setObjectValue(locale, pathSegments, this.#translate(
          retryLocale, originalSingular, originalPlural, true, true
        ))
      } else {
        this.#setObjectValue(locale, pathSegments, defaultSingular || singular)
      }
      this.#write(locale)
    }

    return this.#getObjectValue(locale, pathSegments)
  }

  #syncToAllFiles = (singular, plural) => {
    for (const locale in this.#locales) {
      this.#translate(locale, singular, plural, true)
    }
  }

  #getObjectPathSegments = (singular) => {
    if (!this.#objectNotation) {
      return null
    }

    let segments = this.#objectPathSegments.get(singular)
    if (segments !== undefined) {
      return segments
    }

    const indexOfDot = singular.lastIndexOf(this.#objectNotation)
    if (indexOfDot <= 0 || indexOfDot >= singular.length - 1) {
      this.#objectPathSegments.set(singular, null)
      return null
    }

    segments = singular.split(this.#objectNotation)
    this.#objectPathSegments.set(singular, segments)

    return segments
  }

  #getObjectValue = (locale, segments) => {
    let value = this.#locales[locale]
    for (const key of segments) {
      if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) {
        return undefined
      }
      value = value[key]
    }
    return value
  }

  #setObjectValue = (locale, segments, value) => {
    let object = this.#locales[locale]
    for (let index = 0; index < segments.length - 1; index += 1) {
      const key = segments[index]
      let child = Object.hasOwn(object, key) ? object[key] : undefined
      if (child === null || typeof child !== 'object') {
        child = setOwn(object, key, {})
      }
      object = child
    }

    const key = segments.at(-1)
    // A callback can translate this same path before returning its replacement.
    if (!Object.hasOwn(object, key)) {
      setOwn(object, key, {})
    }
    setOwn(object, key, this.#missingKeyFn(locale, value))
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
        return
      }

      this.#failedCatalogs.delete(locale)
      if (this.#hasLocale(locale)) {
        return
      }
      this.#logDebug('initializing ' + file)
      this.#write(locale)
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
    let stats
    let target
    let tmp

    if (!this.#updateFiles) {
      return
    }

    try {
      stats = fs.lstatSync(this.#directory)
    } catch (error) {
      this.#logDebug('creating locales dir in: ' + this.#directory)
      try {
        fs.mkdirSync(this.#directory, this.#directoryPermissions)
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
      const failedFile = this.#failedCatalogs.get(locale)
      if (failedFile) {
        this.#backupFailedCatalog(failedFile)
        this.#failedCatalogs.delete(locale)
      }
      tmp = target + '.tmp'
      fs.writeFileSync(
        tmp,
        this.#parser.stringify(this.#locales[locale], null, this.#indent),
        'utf8'
      )
      stats = fs.statSync(tmp)
      if (stats.isFile()) {
        fs.renameSync(tmp, target)
      } else {
        this.#logError(
          'unable to write locales to file (either ' +
            tmp +
            ' or ' +
            target +
            ' are not writeable?): '
        )
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
      if (ext !== '.js' && fs.statSync(filepathJS)) {
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

  #missingKey = (locale, value) => value
}

export default I18n
