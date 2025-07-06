import { getEnv } from '../env'

describe('getEnv', () => {
  const ENV = process.env

  beforeEach(() => {
    process.env = { ...ENV }
  })

  afterEach(() => {
    process.env = ENV
  })

  it('returns the value when the environment variable exists', () => {
    process.env.TEST_KEY = 'test_value'
    expect(getEnv('TEST_KEY')).toBe('test_value')
  })

  it('throws an error when the environment variable does not exist', () => {
    delete process.env.TEST_KEY
    expect(() => getEnv('TEST_KEY')).toThrow('Environment variable TEST_KEY is not set')
  })
})
