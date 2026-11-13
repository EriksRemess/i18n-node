// Keep FIFO eviction independent of Map's deleted-entry iteration cost.
export default class BoundedCache {
  #values = new Map()
  #keys = []
  #next = 0
  #limit

  constructor(limit = 1024) {
    this.#limit = limit
  }

  get(key) {
    return this.#values.get(key)
  }

  set(key, value) {
    if (!this.#values.has(key)) {
      if (this.#keys.length === this.#limit) {
        this.#values.delete(this.#keys[this.#next])
        this.#keys[this.#next] = key
        this.#next = (this.#next + 1) % this.#limit
      } else {
        this.#keys.push(key)
      }
    }
    this.#values.set(key, value)
    return this
  }

  clear() {
    this.#values.clear()
    this.#keys.length = 0
    this.#next = 0
  }
}
