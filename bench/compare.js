import { hrtime } from 'node:process'

const DEFAULT_WARMUP_ITERATIONS = Number(process.env.BENCH_WARMUP ?? 5_000)
const DEFAULT_BENCH_DURATION_MS = Number(process.env.BENCH_MS ?? 750)

const staticCatalog = {
  en: {
    Hello: 'Hello',
    'Hello %s, how are you today?': 'Hello %s, how are you today?',
    'Hello {{name}}': 'Hello {{name}}',
    '%s cat': {
      one: '%s cat',
      other: '%s cats'
    },
    greeting: {
      formal: 'Hello',
      informal: 'Hi'
    }
  }
}

const loadPackage = async (specifier, label) => {
  const module = await import(specifier)
  const entry = module.default ?? module
  const I18n = module.I18n ?? entry.I18n

  if (typeof I18n !== 'function') {
    throw new Error(`Unable to resolve I18n export for ${label}`)
  }

  return {
    label,
    I18n
  }
}

const benchmark = ({ name, setup, fn, warmupIterations, durationMs }) => {
  const state = setup()

  for (let i = 0; i < warmupIterations; i += 1) {
    fn(state, i)
  }

  let iterations = 0
  const start = hrtime.bigint()
  const durationNs = BigInt(durationMs) * 1_000_000n

  while (hrtime.bigint() - start < durationNs) {
    fn(state, iterations)
    iterations += 1
  }

  const elapsedNs = hrtime.bigint() - start
  const elapsedMs = Number(elapsedNs) / 1_000_000
  const opsPerSecond = iterations / (elapsedMs / 1_000)

  return {
    name,
    iterations,
    elapsedMs,
    opsPerSecond
  }
}

const buildBenchmarks = ({ label, I18n }) => {
  const createFlatInstance = () => {
    const instance = new I18n({
      staticCatalog,
      defaultLocale: 'en'
    })
    instance.setLocale('en')
    return instance
  }

  const createObjectNotationInstance = () => {
    const instance = new I18n({
      staticCatalog,
      defaultLocale: 'en',
      objectNotation: true
    })
    instance.setLocale('en')
    return instance
  }

  return [
    benchmark({
      name: `${label} __("Hello")`,
      setup: createFlatInstance,
      fn(instance) {
        instance.__('Hello')
      },
      warmupIterations: DEFAULT_WARMUP_ITERATIONS,
      durationMs: DEFAULT_BENCH_DURATION_MS
    }),
    benchmark({
      name: `${label} __('Hello %s, how are you today?')`,
      setup: createFlatInstance,
      fn(instance) {
        instance.__('Hello %s, how are you today?', 'Marcus')
      },
      warmupIterations: DEFAULT_WARMUP_ITERATIONS,
      durationMs: DEFAULT_BENCH_DURATION_MS
    }),
    benchmark({
      name: `${label} __('Hello {{name}}')`,
      setup: createFlatInstance,
      fn(instance) {
        instance.__('Hello {{name}}', { name: 'Marcus' })
      },
      warmupIterations: DEFAULT_WARMUP_ITERATIONS,
      durationMs: DEFAULT_BENCH_DURATION_MS
    }),
    benchmark({
      name: `${label} __n('%s cat', '%s cats', n)`,
      setup: createFlatInstance,
      fn(instance, iteration) {
        instance.__n('%s cat', '%s cats', iteration % 3)
      },
      warmupIterations: DEFAULT_WARMUP_ITERATIONS,
      durationMs: DEFAULT_BENCH_DURATION_MS
    }),
    benchmark({
      name: `${label} __('greeting.formal')`,
      setup: createObjectNotationInstance,
      fn(instance) {
        instance.__('greeting.formal')
      },
      warmupIterations: DEFAULT_WARMUP_ITERATIONS,
      durationMs: DEFAULT_BENCH_DURATION_MS
    })
  ]
}

const printResults = (results) => {
  const longestName = results.reduce(
    (max, result) => Math.max(max, result.name.length),
    0
  )

  console.log(
    `Benchmark duration: ${DEFAULT_BENCH_DURATION_MS}ms, warmup: ${DEFAULT_WARMUP_ITERATIONS} iterations`
  )

  for (const result of results) {
    const name = result.name.padEnd(longestName)
    const opsPerSecond = Math.round(result.opsPerSecond)
      .toString()
      .padStart(10)
    const iterations = result.iterations.toString().padStart(9)
    const elapsedMs = result.elapsedMs.toFixed(1).padStart(7)

    console.log(
      `${name}  ${opsPerSecond} ops/s  ${iterations} iters  ${elapsedMs} ms`
    )
  }
}

const printComparison = (results) => {
  const upstreamResults = new Map()
  const localResults = new Map()

  for (const result of results) {
    if (result.name.startsWith('upstream ')) {
      upstreamResults.set(result.name.slice('upstream '.length), result)
    } else if (result.name.startsWith('local ')) {
      localResults.set(result.name.slice('local '.length), result)
    }
  }

  console.log('\nRelative speed (local vs upstream):')

  for (const [name, localResult] of localResults) {
    const upstreamResult = upstreamResults.get(name)
    if (!upstreamResult) {
      continue
    }

    const ratio = localResult.opsPerSecond / upstreamResult.opsPerSecond
    console.log(`${name}: ${ratio.toFixed(2)}x`)
  }
}

const localPackage = await loadPackage('i18n-local', 'local')
const upstreamPackage = await loadPackage('i18n-upstream', 'upstream')

const results = [
  ...buildBenchmarks({ label: 'local', I18n: localPackage.I18n }),
  ...buildBenchmarks({ label: 'upstream', I18n: upstreamPackage.I18n })
]

printResults(results)
printComparison(results)
