/*
 * Rendering subset derived from Mustache.js 4.2.0.
 * https://github.com/janl/mustache.js/tree/v4.2.0
 * MIT license: see mustache.LICENSE.
 * Internal to i18n: interpolation, sections, lambdas, and custom delimiters.
 */

const DEFAULT_TAGS = ['{{', '}}']
const CACHE_LIMIT = 1024
const templates = new Map()
const templateQueue = []
let nextTemplate = 0
let lastTemplate
let previousTemplate

const hasProperty = (object, name) =>
  object != null && typeof object === 'object' && name in object
const primitiveHasOwnProperty = (value, name) =>
  value != null && typeof value !== 'object' && Object.hasOwn(value, name)

const HTML_ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;'
}
const escapeEntity = (character) => HTML_ENTITIES[character]

const escapeHtml = (value) => {
  const text = String(value)
  return /[&<>"'`=\/]/.test(text)
    ? text.replace(/[&<>"'`=\/]/g, escapeEntity)
    : text
}

const WHITESPACE_PATTERN = /\s*/
// Start whitespace prefixes only at the beginning of a run, so a failed
// search does not retry the same run from every whitespace character.
const EQUALS_PATTERN = /(?<!\s)\s*=/
const CURLY_PATTERN = /\s*\}/
const TAG_PATTERN = /[#^/>{&=!]/
const DEFAULT_OPENING_TAG = /\{\{\s*/
const DEFAULT_CLOSING_TAG = /(?<!\s)\s*\}\}/
const DEFAULT_CLOSING_CURLY = /(?<!\s)\s*\}\}\}/

const validateTags = (tags) => {
  if (
    !Array.isArray(tags) || tags.length !== 2 ||
    typeof tags[0] !== 'string' || !tags[0] ||
    typeof tags[1] !== 'string' || !tags[1]
  ) {
    throw new TypeError('Invalid Mustache tags')
  }
}

const getTokens = (template, tags) => {
  validateTags(tags)
  const last = lastTemplate
  if (last && last.template === template && last.open === tags[0] && last.close === tags[1]) {
    return last.tokens
  }
  const previous = previousTemplate
  if (previous && previous.template === template && previous.open === tags[0] && previous.close === tags[1]) {
    previousTemplate = last
    lastTemplate = previous
    return previous.tokens
  }
  // Index by the original string so rotating templates reuse its cached hash.
  // Only the much shorter delimiter pair needs a composite key.
  const key = tags[0] === '{{' && tags[1] === '}}'
    ? '2:{{}}' : tags[0].length + ':' + tags[0] + tags[1]
  const variants = templates.get(template)
  let entry = variants?.get(key)
  if (!entry) {
    entry = cacheTemplate(template, tags, key, variants)
  }
  previousTemplate = lastTemplate
  lastTemplate = entry
  return entry.tokens
}

const cacheTemplate = (template, tags, key, variants) => {
  const tokens = parseTemplate(template, tags)
  if (templateQueue.length === CACHE_LIMIT) {
    const oldest = templateQueue[nextTemplate]
    const oldestVariants = templates.get(oldest.template)
    oldestVariants.delete(oldest.key)
    if (oldestVariants.size === 0) {
      templates.delete(oldest.template)
      if (oldest.template === template) {
        variants = undefined
      }
    }
  }
  if (!variants) {
    variants = new Map()
    templates.set(template, variants)
  }
  const entry = { template, key, open: tags[0], close: tags[1], tokens }
  variants.set(key, entry)
  if (templateQueue.length < CACHE_LIMIT) {
    templateQueue.push(entry)
  } else {
    templateQueue[nextTemplate] = entry
    nextTemplate = (nextTemplate + 1) % CACHE_LIMIT
  }
  // Drop hints that could reference an evicted entry.
  lastTemplate = undefined
  return entry
}

const parseTemplate = (template, tags) => {
  if (!template) {
    return []
  }
  if (!template.includes(tags[0])) {
    return [{ type: 'text', value: template }]
  }
  const sections = []
  const tokens = []
  const spaces = []
  let hasTag = false
  let nonSpace = false

  // Discard whitespace around standalone tags.
  const stripSpace = () => {
    if (hasTag && !nonSpace) {
      for (const index of spaces) {
        tokens[index] = null
      }
    }
    spaces.length = 0

    hasTag = false
    nonSpace = false
  }

  let openingTagRe
  let closingTagRe
  let closingCurlyRe
  const compileTags = (tagsToCompile) => {
    if (typeof tagsToCompile === 'string') {
      tagsToCompile = tagsToCompile.trim().split(/\s+/)
    }
    validateTags(tagsToCompile)

    if (tagsToCompile[0] === '{{' && tagsToCompile[1] === '}}') {
      openingTagRe = DEFAULT_OPENING_TAG
      closingTagRe = DEFAULT_CLOSING_TAG
      closingCurlyRe = DEFAULT_CLOSING_CURLY
    } else {
      openingTagRe = new RegExp(RegExp.escape(tagsToCompile[0]) + '\\s*')
      closingTagRe = new RegExp('(?<!\\s)\\s*' + RegExp.escape(tagsToCompile[1]))
      closingCurlyRe = new RegExp('(?<!\\s)\\s*' + RegExp.escape('}' + tagsToCompile[1]))
    }
  }

  compileTags(tags)

  const scanner = new Scanner(template)

  while (scanner.tail) {
    // Match any text between tags.
    let value = scanner.scanUntil(openingTagRe)

    if (value) {
      // Standalone tags strip whole lines. Keep each line together instead of
      // allocating separate tokens for every word and whitespace run.
      for (const chunk of value.match(/[^\n]*\n|[^\n]+/g)) {
        if (!/\S/.test(chunk)) {
          spaces.push(tokens.length)
        } else {
          nonSpace = true
        }

        tokens.push({ type: 'text', value: chunk })

        // Check for whitespace on the current line.
        if (chunk.endsWith('\n')) {
          stripSpace()
        }
      }
    }

    const start = scanner.pos

    // Match the opening tag.
    if (!scanner.scan(openingTagRe)) {
      break
    }

    hasTag = true

    // Get the tag type.
    let type = scanner.scan(TAG_PATTERN) || 'name'
    scanner.scan(WHITESPACE_PATTERN)

    // Get the tag value.
    if (type === '=') {
      value = scanner.scanUntil(EQUALS_PATTERN)
      scanner.scan(EQUALS_PATTERN)
      scanner.scanUntil(closingTagRe)
    } else if (type === '{') {
      value = scanner.scanUntil(closingCurlyRe)
      scanner.scan(CURLY_PATTERN)
      scanner.scanUntil(closingTagRe)
      type = '&'
    } else {
      value = scanner.scanUntil(closingTagRe)
    }

    // Match the closing tag.
    if (!scanner.scan(closingTagRe)) {
      throw new Error('Unclosed tag at ' + scanner.pos)
    }

    // Partial and comment tags affect whitespace but produce no output.
    if (type === '>' || type === '!') {
      continue
    }
    if (type === '=') {
      compileTags(value)
      continue
    }

    const token = {
      type,
      value,
      path: value.indexOf('.') > 0 ? value.split('.') : undefined,
      start,
      end: scanner.pos,
      children: undefined,
      sectionEnd: undefined
    }
    tokens.push(token)

    if (type === '#' || type === '^') {
      sections.push(token)
    } else if (type === '/') {
      // Check section nesting.
      const openSection = sections.pop()

      if (!openSection) {
        throw new Error('Unopened section "' + value + '" at ' + start)
      }

      if (openSection.value !== value) {
        throw new Error('Unclosed section "' + openSection.value + '" at ' + start)
      }
    } else if (type === 'name' || type === '&') {
      nonSpace = true
    }
  }

  stripSpace()

  // Make sure there are no open sections when we're done.
  const openSection = sections.pop()

  if (openSection) {
    throw new Error('Unclosed section "' + openSection.value + '" at ' + scanner.pos)
  }

  return nestTokens(tokens)
}

const nestTokens = (tokens) => {
  const nested = []
  const sections = []
  let collector = nested

  for (const token of tokens) {
    if (!token) {
      continue
    }

    switch (token.type) {
      case '#':
      case '^':
        collector.push(token)
        sections.push(token)
        collector = token.children = []
        break
      case '/': {
        const section = sections.pop()
        section.sectionEnd = token.start
        collector = sections.length > 0 ? sections.at(-1).children : nested
        break
      }
      case 'text': {
        const previous = collector.at(-1)
        if (previous?.type === 'text') {
          previous.value += token.value
        } else {
          collector.push(token)
        }
        break
      }
      default:
        collector.push(token)
    }
  }

  return nested
}

class Scanner {
  constructor(string) {
    this.tail = string
    this.pos = 0
  }

  scan(re) {
    const match = re.exec(this.tail)

    if (!match || match.index !== 0) {
      return ''
    }

    const string = match[0]

    this.tail = this.tail.slice(string.length)
    this.pos += string.length

    return string
  }

  scanUntil(re) {
    const index = this.tail.search(re)
    let match

    switch (index) {
      case -1:
        match = this.tail
        this.tail = ''
        break
      case 0:
        match = ''
        break
      default:
        match = this.tail.slice(0, index)
        this.tail = this.tail.slice(index)
    }

    this.pos += match.length

    return match
  }
}

class Context {
  constructor(view, parentContext) {
    this.view = view
    // Most translation contexts only look up one or two distinct names.
    this.name = undefined
    this.value = undefined
    this.secondName = undefined
    this.secondValue = undefined
    this.cache = undefined
    this.parent = parentContext
  }

  lookup(name, names) {
    const cache = this.cache

    let value
    if (name === '.') {
      value = this.view
    } else if (name === this.name) {
      value = this.value
    } else if (name === this.secondName) {
      value = this.secondValue
    } else if (cache?.has(name)) {
      value = cache.get(name)
    } else {
      let context = this
      let intermediateValue
      let lookupHit = false

      while (context) {
        if (names) {
          intermediateValue = context.view
          let index = 0
          // Once the first segment resolves, an absent child must not cause
          // the whole dotted name to be looked up in a parent context.
          lookupHit = hasProperty(intermediateValue, names[0]) ||
            primitiveHasOwnProperty(intermediateValue, names[0])

          // Dotted lookups also support properties of boxed primitives,
          // such as a string's length, matching Mustache.js behavior.
          while (intermediateValue != null && index < names.length) {
            intermediateValue = intermediateValue[names[index++]]
          }
        } else {
          intermediateValue = context.view?.[name]

          // Plain names deliberately skip boxed primitive properties.
          lookupHit = hasProperty(context.view, name)
        }

        if (lookupHit) {
          value = intermediateValue
          break
        }

        context = context.parent
      }

      if (this.name === undefined) {
        this.name = name
        this.value = value
      } else if (this.secondName === undefined) {
        this.secondName = name
        this.secondValue = value
      } else {
        (this.cache ??= new Map()).set(name, value)
      }
    }

    if (typeof value === 'function') {
      value = value.call(this.view)
    }

    return value
  }
}

const renderTokens = (tokens, context, template, tags) => {
  let output = ''
  for (const token of tokens) {
    switch (token.type) {
      case 'text':
        output += token.value
        break
      case 'name': {
        const value = context.lookup(token.value, token.path)
        if (value != null) {
          output += typeof value === 'number' ? String(value) : escapeHtml(value)
        }
        break
      }
      case '&': {
        const value = context.lookup(token.value, token.path)
        if (value != null) {
          output += value
        }
        break
      }
      case '#': {
        const value = context.lookup(token.value, token.path)
        if (!value) {
          break
        }
        if (Array.isArray(value)) {
          for (let index = 0, length = value.length; index < length; index += 1) {
            output += renderTokens(token.children, new Context(value[index], context), template, tags)
          }
        } else if (typeof value === 'function') {
          const result = value.call(
            context.view,
            template.slice(token.end, token.sectionEnd),
            (text) => renderTokens(getTokens(text, tags), context, text, tags)
          )
          if (result != null) {
            output += result
          }
        } else {
          const child = typeof value === 'object' || typeof value === 'string' || typeof value === 'number'
            ? new Context(value, context) : context
          output += renderTokens(token.children, child, template, tags)
        }
        break
      }
      case '^': {
        const value = context.lookup(token.value, token.path)
        if (!value || (Array.isArray(value) && value.length === 0)) {
          output += renderTokens(token.children, context, template, tags)
        }
        break
      }
    }
  }
  return output
}

const render = (template, view, tags = DEFAULT_TAGS) => {
  const tokens = getTokens(template, tags)
  if (tokens.length === 0) {
    return ''
  }
  if (tokens.length === 1 && tokens[0].type === 'text') {
    return tokens[0].value
  }
  return renderTokens(tokens, new Context(view), template, tags)
}

export default render
