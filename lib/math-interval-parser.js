/*
 * Derived from math-interval-parser 2.0.1 by Dmitry Semigradsky.
 * https://github.com/Semigradsky/math-interval-parser
 * MIT license: see math-interval-parser.LICENSE.
 * Node 26+ ES module with strict interval and translation-prefix parsing.
 */

const NUMBER = '[+-]?(?:Infinity|(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?)'
// Keep trailing whitespace inside each optional bound so an absent bound
// cannot leave adjacent whitespace quantifiers competing for the same input.
const INTERVAL_SOURCE =
  '^\\s*([[(\\]])\\s*(?:(' + NUMBER + ')\\s*)?(?:(,)\\s*(?:(' + NUMBER + ')\\s*)?)?([\\])\\[])\\s*'
const INTERVAL = new RegExp(INTERVAL_SOURCE + '$')
const INTERVAL_PREFIX = new RegExp(INTERVAL_SOURCE)

const parseMatch = (match, input, count) => {
  if (!match) {
    return null
  }
  const left = match[1]
  const lower = match[2]
  const comma = match[3]
  const upper = match[4]
  const right = match[5]
  if (!comma && lower === undefined) {
    return null
  }

  const from = lower === undefined ? -Infinity : Number(lower)
  const to = upper === undefined ? (comma ? Infinity : from) : Number(upper)
  const includeFrom = left === '['
  const includeTo = right === ']'
  if (from > to || (from === to && !(includeFrom && includeTo))) {
    return null
  }

  if (input !== undefined) {
    return typeof count === 'number' &&
      (count > from || (count === from && includeFrom)) &&
      (count < to || (count === to && includeTo))
      ? input.slice(match[0].length) : false
  }

  return {
    from: { value: from, included: includeFrom },
    to: { value: to, included: includeTo }
  }
}

const parseInterval = (input) =>
  typeof input === 'string' ? parseMatch(INTERVAL.exec(input)) : null

// Translation rules have text after the interval; parse both in one scan.
export const parseIntervalPrefix = (input) => {
  if (typeof input !== 'string') {
    return null
  }
  const match = INTERVAL_PREFIX.exec(input)
  const interval = parseMatch(match)
  return interval ? { interval, text: input.slice(match[0].length) } : null
}

// Return matching text, false for a valid but unmatched interval, or null for
// invalid input. One-off translations need no allocated bound objects.
export const matchIntervalPrefix = (input, count) =>
  typeof input === 'string' ? parseMatch(INTERVAL_PREFIX.exec(input), input, count) : null

export default parseInterval
