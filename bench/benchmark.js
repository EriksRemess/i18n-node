import { performance } from 'node:perf_hooks'

const duration = Number(process.env.BENCH_MS ?? 150)
const rounds = 5

const measure = (fn) => {
  for (let index = 0; index < 5000; index += 1) {
    fn(index)
  }

  let iterations = 0
  const start = performance.now()
  while (performance.now() - start < duration) {
    const end = iterations + 128
    while (iterations < end) {
      fn(iterations++)
    }
  }
  return iterations / (performance.now() - start) * 1000
}

export const compare = (label, implementations) => {
  const rates = implementations.map(() => [])
  for (let round = 0; round < rounds; round += 1) {
    // Alternate order to reduce warm-up and frequency-scaling bias.
    for (let offset = 0; offset < implementations.length; offset += 1) {
      const index = (round + offset) % implementations.length
      rates[index].push(measure(implementations[index][1]))
    }
  }

  const medians = rates.map((values) =>
    values.sort((a, b) => a - b)[Math.floor(rounds / 2)]
  )
  const results = implementations.map(([name], index) =>
    `${name}: ${Math.round(medians[index]).toLocaleString('en-US')} ops/s`
  )
  const ratio = medians.length > 1 ? ` (${(medians[1] / medians[0]).toFixed(2)}x)` : ''
  console.log(`${label} ${results.join(', ')}${ratio}`)
}
