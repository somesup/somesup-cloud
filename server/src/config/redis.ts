import { createClient, RedisClientType } from 'redis'
import { getEnv } from '../utils/env'

export const REDIS_URL = getEnv('REDIS_URL')

export function createRedisClient(url: string = REDIS_URL): RedisClientType {
  return createClient({ url })
}

let _redisClient: RedisClientType | null = null

export const getRedisClient = (): RedisClientType => {
  if (!_redisClient) {
    _redisClient = createRedisClient()
  }
  return _redisClient
}

export const resetRedisClient = (): void => {
  if (_redisClient) {
    _redisClient = null
  }
}

export const redisClient = getRedisClient()
