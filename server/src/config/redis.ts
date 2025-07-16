import { createClient, RedisClientType } from 'redis'
import { getEnv } from '../utils/env'

export const REDIS_URL = getEnv('REDIS_URL')

export function createRedisClient(url: string = REDIS_URL): RedisClientType {
  return createClient({ url })
}

let _redisClient: RedisClientType | null = null

/**
 * Redis 클라이언트를 가져오는 함수입니다.
 * 클라이언트가 아직 생성되지 않았다면 새로 생성합니다.
 *
 * @returns {RedisClientType} Redis 클라이언트 인스턴스
 */
export const getRedisClient = (): RedisClientType => {
  if (!_redisClient) {
    _redisClient = createRedisClient()
  }
  return _redisClient
}

/**
 * Redis 클라이언트를 재설정하는 함수입니다.
 * 기존 클라이언트를 null로 설정하여 다음 호출 시 새 클라이언트를 생성하도록 합니다.
 */
export const resetRedisClient = (): void => {
  if (_redisClient) {
    _redisClient = null
  }
}

/**
 * 싱글톤 Redis 클라이언트를 가져옵니다.
 */
export const redisClient = getRedisClient()
