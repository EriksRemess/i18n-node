const FORMAT_PATTERN = /%%|%((\d+)\$)?(?:\.(\d+))?([dfs])/g
const tokenCache = new Map()

const compile = (template) => {
  const tokens = []
  let lastIndex = 0
  let match

  FORMAT_PATTERN.lastIndex = 0

  while ((match = FORMAT_PATTERN.exec(template)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({
        type: 'text',
        value: template.slice(lastIndex, match.index)
      })
    }

    if (match[0] === '%%') {
      tokens.push({
        type: 'text',
        value: '%'
      })
    } else {
      tokens.push({
        type: 'format',
        index: match[2] === undefined ? undefined : Number(match[2]) - 1,
        precision: match[3] === undefined ? undefined : Number(match[3]),
        specifier: match[4],
        raw: match[0]
      })
    }

    lastIndex = FORMAT_PATTERN.lastIndex
  }

  if (lastIndex < template.length) {
    tokens.push({
      type: 'text',
      value: template.slice(lastIndex)
    })
  }

  return tokens
}

const formatValue = (specifier, precision, value) => {
  switch (specifier) {
    case 'd':
      return String(Number.parseInt(value, 10))
    case 'f':
      if (precision === undefined) {
        return String(Number(value))
      }
      return Number(value).toFixed(precision)
    case 's':
    default:
      return String(value)
  }
}

export const printf = (template, ...args) => {
  let tokens = tokenCache.get(template)
  if (!tokens) {
    tokens = compile(template)
    tokenCache.set(template, tokens)
  }

  let nextIndex = 0
  let out = ''

  for (const token of tokens) {
    if (token.type === 'text') {
      out += token.value
      continue
    }

    const argIndex = token.index === undefined ? nextIndex++ : token.index
    if (argIndex >= args.length || args[argIndex] === undefined) {
      out += token.raw
      continue
    }

    out += formatValue(token.specifier, token.precision, args[argIndex])
  }

  return out
}
