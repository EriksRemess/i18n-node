/**
 * @author      Created by Marcus Spiegel <spiegel@uscreen.de> on 2011-03-25.
 * @link        https://github.com/mashpie/i18n-node
 * @license     http://opensource.org/licenses/MIT
 */

import fs from 'node:fs'
import path from 'node:path'
import * as MakePlural from 'make-plural'
import parseIntervalModule from 'math-interval-parser'
import Mustache from 'mustache'
import pkg from '#package' with { type: 'json' }
import createDebug from '#debug'
import { printf } from '#printf'

const pkgVersion = pkg.version
const parseInterval = parseIntervalModule.default
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
const CACHE_LIMIT = 1024
const cloneApi = () => ({ ...DEFAULT_API })
const cloneMustacheConfig = () => ({
  disable: DEFAULT_MUSTACHE_CONFIG.disable,
  tags: [...DEFAULT_MUSTACHE_CONFIG.tags]
})

// utils
const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // $& means the whole matched string
const setBoundedCache = (cache, key, value) => {
  if (cache.size >= CACHE_LIMIT) {
    const firstKey = cache.keys().next().value
    cache.delete(firstKey)
  }

  cache.set(key, value)
}

/**
 * create constructor class
 */
class I18n {
  version = pkgVersion

  #pluralsForLocale = {}
  #locales = {}
  #api = cloneApi()
  #mustacheConfig = cloneMustacheConfig()
  #mustacheRegex = /{{.*}}/
  #mustacheStart = '{{'
  #mustacheEnd = '}}'
  #autoReload = false
  #autoReloadWatcher
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
  #messageFeatures = new Map()
  #objectPathSegments = new Map()

  constructor(_OPTS = false) {
    this.#missingKeyFn = this.#missingKey
    this.#updateMustacheRegex()

    if (_OPTS) {
      this.configure(_OPTS)
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
          ? parseInt(opt.directoryPermissions, 8)
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
      i18n.#retryInDefaultLocale =
        typeof opt.retryInDefaultLocale === 'boolean'
          ? opt.retryInDefaultLocale
          : false
      i18n.#autoReload =
        typeof opt.autoReload === 'boolean' ? opt.autoReload : false
      i18n.#objectNotation =
        typeof opt.objectNotation !== 'undefined' ? opt.objectNotation : false
      if (i18n.#objectNotation === true) i18n.#objectNotation = '.'
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
        typeof opt.parser === 'object' &&
        typeof opt.parser.parse === 'function' &&
        typeof opt.parser.stringify === 'function'
          ? opt.parser
          : JSON

      if (opt.mustacheConfig) {
        if (Array.isArray(opt.mustacheConfig.tags)) {
          i18n.#mustacheConfig.tags = opt.mustacheConfig.tags
        }
        if (opt.mustacheConfig.disable === true) {
          i18n.#mustacheConfig.disable = true
        }
      }
      i18n.#updateMustacheRegex()

      if (typeof opt.register === 'object') {
        i18n.#register = opt.register
        if (Array.isArray(opt.register)) {
          opt.register.forEach(i18n.#applyAPIToObject)
        } else {
          i18n.#applyAPIToObject(opt.register)
        }
      }

      const locales = opt.staticCatalog
        ? Object.keys(opt.staticCatalog)
        : opt.locales || i18n.#guessLocales(i18n.#directory)

      if (opt.staticCatalog) {
        i18n.#updateFiles = false
        i18n.#autoReload = false
        i18n.#syncFiles = false
      }

      if (Array.isArray(locales)) {
        if (opt.staticCatalog) {
          i18n.#locales = opt.staticCatalog
        } else {
          locales.forEach(i18n.#read)
        }

        if (i18n.#autoReload) {
          i18n.#autoReloadWatcher = fs.watch(
            i18n.#directory,
            { persistent: false },
            (event, filename) => {
              const localeFromFile = i18n.#guessLocaleFromFile(filename)

              if (localeFromFile && locales.indexOf(localeFromFile) > -1) {
                i18n.#logDebug('Auto reloading locale file "' + filename + '".')
                i18n.#read(localeFromFile)
              }
            }
          )
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
      if (typeof phrase === 'string' && arguments.length === 1) {
        let msg = i18n.#translate(i18n.#getLocaleFromObject(this), phrase)

        if (typeof msg === 'object' && msg.one) {
          msg = msg.one
        }

        if (typeof msg === 'object' && msg.other) {
          msg = msg.other
        }

        return i18n.#postProcess(msg, EMPTY_OBJECT, EMPTY_ARRAY)
      }

      let msg
      const [namedValues, args] = i18n.#parseArgv(arguments)

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

      if (typeof msg === 'object' && msg.one) {
        msg = msg.one
      }

      if (typeof msg === 'object' && msg.other) {
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
        typeof plural === 'string' &&
        arguments.length === 3
      ) {
        const targetLocale = i18n.#getLocaleFromObject(this)
        let msg = i18n.#translate(targetLocale, singular, plural)
        const numericCount =
          typeof count === 'number' ? count : Number(count)

        if (typeof msg === 'object') {
          let pluralResolver = i18n.#pluralsForLocale[targetLocale]
          if (!pluralResolver) {
            const localeParts = targetLocale
              .toLowerCase()
              .split(/[_-\s]+/)
              .filter(Boolean)
            pluralResolver = MakePlural[localeParts[0] || targetLocale]
            i18n.#pluralsForLocale[targetLocale] = pluralResolver
          }

          msg = msg[pluralResolver(numericCount)] || msg.other
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
          targetLocale = singular.locale
          msg = i18n.#translate(
            singular.locale,
            singular.singular,
            singular.plural
          )
        }
        args.unshift(count)

        if (typeof plural === 'number' || Number(plural) + '' === plural) {
          count = plural
        }

        if (
          typeof singular.count === 'number' ||
          typeof singular.count === 'string'
        ) {
          count = singular.count
          args.unshift(plural)
        }
      } else {
        if (typeof plural === 'number' || Number(plural) + '' === plural) {
          count = plural
          plural = singular
          args.unshift(count)
          args.unshift(plural)
        }

        msg = i18n.#translate(
          i18n.#getLocaleFromObject(this),
          singular,
          plural
        )
        targetLocale = i18n.#getLocaleFromObject(this)
      }

      if (count === null) count = namedValues.count
      count = Number(count)

      if (typeof msg === 'object') {
        let pluralResolver
        if (i18n.#pluralsForLocale[targetLocale]) {
          pluralResolver = i18n.#pluralsForLocale[targetLocale]
        } else {
          const localeParts = targetLocale
            .toLowerCase()
            .split(/[_-\s]+/)
            .filter(Boolean)
          pluralResolver = MakePlural[localeParts[0] || targetLocale]
          i18n.#pluralsForLocale[targetLocale] = pluralResolver
        }

        msg = msg[pluralResolver(count)] || msg.other
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

      if (!i18n.#locales[targetLocale]) {
        targetLocale = i18n.#getFallback(targetLocale, i18n.#fallbacks) || targetLocale
      }

      targetObject.locale = i18n.#locales[targetLocale]
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

      if (!i18n.#locales[targetLocale]) {
        targetLocale =
          i18n.#getFallback(targetLocale, i18n.#fallbacks) || targetLocale
      }

      if (i18n.#locales[targetLocale]) {
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
    })(this)

  removeLocale = ((i18n) =>
    function i18nRemoveLocale(locale) {
      delete i18n.#locales[locale]
    })(this)

  #localesKeys = () => Object.keys(this.#locales)

  #resetConfiguration = () => {
    if (this.#autoReloadWatcher) {
      this.#autoReloadWatcher.close()
      this.#autoReloadWatcher = undefined
    }

    this.#pluralsForLocale = {}
    this.#locales = {}
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
    this.#updateMustacheRegex()
  }

  #updateMustacheRegex = () => {
    const [start, end] = this.#mustacheConfig.tags
    this.#mustacheStart = start
    this.#mustacheEnd = end
    this.#messageFeatures.clear()
    this.#mustacheRegex = new RegExp(
      escapeRegExp(start) + '.*' + escapeRegExp(end)
    )
  }

  #postProcess = (msg, namedValues, args, count) => {
    if (typeof msg !== 'string') {
      return msg
    }

    const features = this.#getMessageFeatures(msg)
    if (features & MESSAGE_FEATURE_INTERVAL) {
      msg = this.#parsePluralInterval(msg, count)
    }

    if (
      typeof count === 'number' &&
      (features & MESSAGE_FEATURE_PERCENT) !== 0
    ) {
      msg = printf(msg, Number(count))
    }

    if (
      !this.#mustacheConfig.disable &&
      (features & MESSAGE_FEATURE_MUSTACHE) !== 0
    ) {
      msg = Mustache.render(msg, namedValues, {}, this.#mustacheConfig.tags)
    }

    if (
      args.length > 0 &&
      (features & MESSAGE_FEATURE_PERCENT) !== 0
    ) {
      msg = printf(msg, ...args)
    }

    return msg
  }

  #getMessageFeatures = (msg) => {
    let features = this.#messageFeatures.get(msg)
    if (features !== undefined) {
      return features
    }

    features = 0
    if (msg.includes('|')) {
      features |= MESSAGE_FEATURE_INTERVAL
    }
    if (msg.includes('%')) {
      features |= MESSAGE_FEATURE_PERCENT
    }
    if (
      msg.includes(this.#mustacheStart) &&
      msg.includes(this.#mustacheEnd)
    ) {
      features |= MESSAGE_FEATURE_MUSTACHE
    }

    setBoundedCache(this.#messageFeatures, msg, features)
    return features
  }

  #argsEndWithNamedObject = (args) =>
    args.length > 1 &&
    args[args.length - 1] !== null &&
    typeof args[args.length - 1] === 'object'

  #parseArgv = (args) => {
    let namedValues
    let returnArgs

    if (this.#argsEndWithNamedObject(args)) {
      namedValues = args[args.length - 1]
      returnArgs = Array.prototype.slice.call(args, 1, -1)
    } else {
      namedValues = {}
      returnArgs = args.length >= 2 ? Array.prototype.slice.call(args, 1) : []
    }

    return [namedValues, returnArgs]
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
      if (entries[i].match(/^\./)) continue
      const localeFromFile = this.#guessLocaleFromFile(entries[i])
      if (localeFromFile) locales.push(localeFromFile)
    }

    return locales.sort()
  }

  #guessLocaleFromFile = (filename) => {
    const extensionRegex = new RegExp(this.#extension + '$', 'g')
    const prefixRegex = new RegExp('^' + this.#prefix, 'g')

    if (!filename) return false
    if (this.#prefix && !filename.match(prefixRegex)) return false
    if (this.#extension && !filename.match(extensionRegex)) return false
    return filename.replace(this.#prefix, '').replace(extensionRegex, '')
  }

  #extractQueryLanguage = (queryLanguage) => {
    if (Array.isArray(queryLanguage)) {
      return queryLanguage.find((lang) => lang !== '' && lang)
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

        const urlAsString =
          typeof request.url === 'string' ? request.url : request.url.toString()
        const urlObj = new URL(urlAsString, 'http://localhost')
        if (languageQueryParameter === undefined) {
          const queryParameters = urlObj.searchParams.getAll(this.#queryParameter)
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

        for (let i = 0; i < acceptedLanguages.length; i += 1) {
          const lang = acceptedLanguages[i]
          const localeParts = lang.split('-', 2)
          const parentLang = localeParts[0]
          const region = localeParts[1]

          const fallbackLang = this.#getFallback(lang, this.#fallbacks)
          if (fallbackLang) {
            fallback = fallbackLang
            const acceptedLanguageIndex = acceptedLanguages.indexOf(lang)
            const fallbackIndex = acceptedLanguages.indexOf(fallback)
            if (fallbackIndex > -1) {
              acceptedLanguages.splice(fallbackIndex, 1)
            }
            acceptedLanguages.splice(acceptedLanguageIndex + 1, 0, fallback)
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

          if (!match && this.#locales[lang]) {
            match = lang
            break
          }

          if (!fallbackMatch && this.#locales[parentLang]) {
            fallbackMatch = parentLang
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
    const languages = header.split(',')
    const preferences = {}

    return languages
      .map((item) => {
        const preferenceParts = item.trim().split(';q=')
        if (preferenceParts.length < 2) {
          preferenceParts[1] = 1.0
        } else {
          const quality = parseFloat(preferenceParts[1])
          preferenceParts[1] = quality || 0.0
        }
        preferences[preferenceParts[0]] = preferenceParts[1]
        return preferenceParts[0]
      })
      .filter((lang) => preferences[lang] > 0)
      .sort((a, b) => preferences[b] - preferences[a])
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

  #parsePluralInterval = (phrase, count) => {
    let returnPhrase = phrase
    const phrases = phrase.split(/\|/)
    let intervalRuleExists = false

    phrases.some((part) => {
      const matches = part.match(/^\s*([()[\]]+[\d,]+[()[\]]+)?\s*(.*)$/)

      if (matches != null && matches[1]) {
        intervalRuleExists = true
        if (this.#matchInterval(count, matches[1]) === true) {
          returnPhrase = matches[2]
          return true
        }
      } else if (intervalRuleExists) {
        returnPhrase = part
      }

      return false
    })

    return returnPhrase
  }

  #matchInterval = (number, interval) => {
    interval = parseInterval(interval)
    if (interval && typeof number === 'number') {
      if (interval.from.value === number) {
        return interval.from.included
      }
      if (interval.to.value === number) {
        return interval.to.included
      }

      return (
        Math.min(interval.from.value, number) === interval.from.value &&
        Math.max(interval.to.value, number) === interval.to.value
      )
    }
    return false
  }

  #translate = (locale, singular, plural, skipSyncToAllFiles) => {
    if (!skipSyncToAllFiles && this.#syncFiles) {
      this.#syncToAllFiles(singular, plural)
    }

    if (locale === undefined) {
      this.#logWarn(
        'WARN: No locale found - check the context of the call to __(). Using ' +
          this.#defaultLocale +
          ' as current locale'
      )
      locale = this.#defaultLocale
    }

    if (!this.#locales[locale]) {
      locale = this.#getFallback(locale, this.#fallbacks) || locale
    }

    if (!this.#locales[locale]) {
      this.#read(locale)
    }

    if (!this.#locales[locale]) {
      this.#logWarn(
        'WARN: Locale ' +
          locale +
          " couldn't be read - check the context of the call to $__. Using " +
          this.#defaultLocale +
          ' (default) as current locale'
      )

      locale = this.#defaultLocale
      this.#read(locale)
    }

    let defaultSingular = singular
    let defaultPlural = plural
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

    if (!this.#usesObjectPath(singular)) {
      const catalog = this.#locales[locale]
      let value = catalog[singular]

      if (plural && value == null) {
        if (this.#retryInDefaultLocale && locale !== this.#defaultLocale) {
          this.#logDebug(
            'Missing ' +
              singular +
              ' in ' +
              locale +
              ' retrying in ' +
              this.#defaultLocale
          )
          value = this.#translate(this.#defaultLocale, singular, plural, true)
        } else {
          value = {
            one: defaultSingular || singular,
            other: defaultPlural || plural
          }
        }

        catalog[singular] = this.#missingKeyFn(locale, value)
        this.#write(locale)
        value = catalog[singular]
      }

      if (value == null) {
        if (this.#retryInDefaultLocale && locale !== this.#defaultLocale) {
          this.#logDebug(
            'Missing ' +
              singular +
              ' in ' +
              locale +
              ' retrying in ' +
              this.#defaultLocale
          )
          value = this.#translate(this.#defaultLocale, singular, plural, true)
        } else {
          value = defaultSingular || singular
        }

        catalog[singular] = this.#missingKeyFn(locale, value)
        this.#write(locale)
        value = catalog[singular]
      }

      return value
    }

    const accessor = this.#localeAccessor(locale, singular)
    const mutator = this.#localeMutator(locale, singular)

    if (plural) {
      if (accessor() == null) {
        if (this.#retryInDefaultLocale && locale !== this.#defaultLocale) {
          this.#logDebug(
            'Missing ' +
              singular +
              ' in ' +
              locale +
              ' retrying in ' +
              this.#defaultLocale
          )
          mutator(this.#translate(this.#defaultLocale, singular, plural, true))
        } else {
          mutator({
            one: defaultSingular || singular,
            other: defaultPlural || plural
          })
        }
        this.#write(locale)
      }
    }

    if (accessor() == null) {
      if (this.#retryInDefaultLocale && locale !== this.#defaultLocale) {
        this.#logDebug(
          'Missing ' +
            singular +
            ' in ' +
            locale +
            ' retrying in ' +
            this.#defaultLocale
        )
        mutator(this.#translate(this.#defaultLocale, singular, plural, true))
      } else {
        mutator(defaultSingular || singular)
      }
      this.#write(locale)
    }

    return accessor()
  }

  #syncToAllFiles = (singular, plural) => {
    for (const locale in this.#locales) {
      this.#translate(locale, singular, plural, true)
    }
  }

  #usesObjectPath = (singular) => this.#getObjectPathSegments(singular) !== null

  #getObjectPathSegments = (singular) => {
    if (!this.#objectNotation) {
      return null
    }

    const indexOfDot = singular.lastIndexOf(this.#objectNotation)
    if (indexOfDot <= 0 || indexOfDot >= singular.length - 1) {
      return null
    }

    let segments = this.#objectPathSegments.get(singular)
    if (!segments) {
      segments = singular.split(this.#objectNotation)
      setBoundedCache(this.#objectPathSegments, singular, segments)
    }

    return segments
  }

  #localeAccessor = (locale, singular, allowDelayedTraversal) => {
    /* node:coverage ignore next */
    if (!this.#locales[locale]) return Function.prototype

    const pathSegments = this.#getObjectPathSegments(singular)

    if (typeof allowDelayedTraversal === 'undefined') {
      allowDelayedTraversal = true
    }

    let accessor = null
    const nullAccessor = () => null
    let reTraverse = false

    pathSegments.reduce((object, index) => {
      accessor = nullAccessor
      if (object === null || !Object.hasOwn(object, index)) {
        reTraverse = allowDelayedTraversal
        return null
      }

      accessor = () => object[index]
      return object[index]
    }, this.#locales[locale])

    return () =>
      reTraverse
        ? this.#localeAccessor(locale, singular, false)()
        : accessor()
  }

  #localeMutator = (locale, singular, allowBranching) => {
    /* node:coverage ignore next */
    if (!this.#locales[locale]) return Function.prototype

    const pathSegments = this.#getObjectPathSegments(singular)

    if (typeof allowBranching === 'undefined') allowBranching = false

    let accessor = null
    let fixObject
    let reTraverse = false

    pathSegments.reduce((object, index) => {
      if (object === null || !Object.hasOwn(object, index)) {
        if (allowBranching) {
          if (object === null || typeof object !== 'object') {
            object = fixObject()
          }
          object[index] = {}
        } else {
          reTraverse = true
          return null
        }
      }

      accessor = (value) => {
        object[index] = value
        return value
      }
      fixObject = () => {
        object[index] = {}
        return object[index]
      }

      return object[index]
    }, this.#locales[locale])

    return (value) => {
      value = this.#missingKeyFn(locale, value)
      return reTraverse
        ? this.#localeMutator(locale, singular, true)(value)
        : accessor(value)
    }
  }

  #read = (locale) => {
    let localeFile = {}
    const file = this.#getStorageFilePath(locale)

    try {
      this.#logDebug('read ' + file + ' for locale: ' + locale)
      localeFile = fs.readFileSync(file, 'utf-8')
      try {
        this.#locales[locale] = this.#parser.parse(localeFile)
      } catch (parseError) {
        this.#logError(
          'unable to parse locales from file (maybe ' +
            file +
            ' is empty or invalid json?): ',
          parseError
        )
      }
    } catch (readError) {
      if (fs.existsSync(file)) {
        this.#logDebug(
          'backing up invalid locale ' + locale + ' to ' + file + '.invalid'
        )
        fs.renameSync(file, file + '.invalid')
      }

      this.#logDebug('initializing ' + file)
      this.#write(locale)
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
        if (mkdirError.code !== 'EEXIST') throw mkdirError
      }
    }

    if (!this.#locales[locale]) {
      this.#locales[locale] = {}
    }

    try {
      target = this.#getStorageFilePath(locale)
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
    const ext = this.#extension || '.json'
    const filepath = path.normalize(
      this.#directory + path.sep + this.#prefix + locale + ext
    )
    const filepathJS = path.normalize(
      this.#directory + path.sep + this.#prefix + locale + '.js'
    )

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
    if (fallbacks[targetLocale]) return fallbacks[targetLocale]

    let fallbackLocale = null
    for (const key in fallbacks) {
      if (targetLocale.match(new RegExp('^' + key.replace('*', '.*') + '$'))) {
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
