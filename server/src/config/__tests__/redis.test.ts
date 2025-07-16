const mockCreateClient = jest.fn(() => ({
  on: jest.fn(),
}))

jest.mock('redis', () => ({
  createClient: mockCreateClient,
}))

describe('redisClient', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCreateClient.mockClear()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should export REDIS constants', () => {
    const { REDIS_URL } = require('../redis')
    expect(REDIS_URL).toBe('redis://test_redis')
  })

  it('should create a Redis client with the correct URL', () => {
    const { createRedisClient } = require('../redis')

    createRedisClient('redis://test_redis')

    expect(mockCreateClient).toHaveBeenCalledWith({
      url: 'redis://test_redis',
    })
  })

  it('should not reset Redis client if it is already null', () => {
    const { resetRedisClient } = require('../redis')

    resetRedisClient()

    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('should return the same client instance', () => {
    const { getRedisClient, resetRedisClient } = require('../redis')

    resetRedisClient() // 테스트를 위해 리셋

    const client1 = getRedisClient()
    const client2 = getRedisClient()

    expect(client1).toBe(client2)
    expect(mockCreateClient).toHaveBeenCalledTimes(1)
  })
})
