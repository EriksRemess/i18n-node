const splitPatterns = (value) =>
  value
    .split(/[\s,]+/)
    .filter(Boolean)

const matchesPattern = (namespace, pattern) => {
  const regex = new RegExp(
    `^${pattern.split('*').map(RegExp.escape).join('.*?')}$`,
    'i'
  )
  return regex.test(namespace)
}

const isEnabled = (namespace, patterns) => {
  let enabled = false

  for (const pattern of patterns) {
    if (!matchesPattern(namespace, pattern.replace(/^-/, ''))) {
      continue
    }

    if (pattern.startsWith('-')) {
      return false
    }

    enabled = true
  }

  return enabled
}

const createDebug = (namespace) => {
  const debug = (...args) => {
    if (!debug.enabled) {
      return
    }

    console.error(namespace, ...args)
  }

  const patterns = splitPatterns(process.env.DEBUG ?? '')
  debug.enabled = isEnabled(namespace, patterns)

  return debug
}

export default createDebug
