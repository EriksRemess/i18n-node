const testGlobals = {
  after: 'readonly',
  afterEach: 'readonly',
  before: 'readonly',
  beforeEach: 'readonly',
  context: 'readonly',
  describe: 'readonly',
  it: 'readonly',
  should: 'readonly',
  __: 'readonly',
  __n: 'readonly'
}

export default [
  {
    ignores: ['node_modules/**']
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        console: 'readonly',
        global: 'readonly',
        globalThis: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly'
      }
    },
    rules: {
      'generator-star-spacing': 'off',
      'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
      'space-before-function-paren': 'off'
    }
  },
  {
    files: ['test/**/*.js'],
    languageOptions: {
      globals: testGlobals
    }
  }
]
