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
        setTimeout: 'readonly',
        URL: 'readonly'
      }
    },
    rules: {
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-constant-condition': 'error',
      'no-dupe-args': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-class-members': 'error',
      'no-func-assign': 'error',
      'no-import-assign': 'error',
      'no-debugger': 'error',
      'valid-typeof': 'error'
    }
  },
  {
    files: ['test/**/*.js'],
    languageOptions: {
      globals: testGlobals
    }
  }
]
