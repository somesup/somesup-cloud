import jwt from 'jsonwebtoken'
import { getEnv } from '../utils/env'

export const JWT_SECRET = getEnv('JWT_SECRET')
export const JWT_REFRESH_SECRET = getEnv('JWT_REFRESH_SECRET')
export const JWT_EXPIRES_IN = getEnv('JWT_EXPIRES_IN')
export const JWT_REFRESH_EXPIRES_IN = getEnv('JWT_REFRESH_EXPIRES_IN')

/**
 * JWT Access Token을 생성하는 함수입니다.
 * @param {number} userId - 사용자 ID
 * @return {string} 생성된 JWT Access Token
 */
export const generateAccessToken = (userId: number): string => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' })
}

/**
 * JWT Refresh Token을 생성하는 함수입니다.
 * @param {number} userId - 사용자 ID
 * @return {string} 생성된 JWT Refresh Token
 */
export const generateRefreshToken = (userId: number): string => {
  return jwt.sign({ userId }, JWT_REFRESH_SECRET, { expiresIn: '30d' })
}

/**
 * JWT Access Token을 검증하는 함수입니다.
 * @param {string} token - 검증할 JWT Access Token
 * @return {object} 검증된 JWT Payload
 */
export const verifyToken = (token: string): { userId: number } => {
  return jwt.verify(token, JWT_SECRET) as { userId: number }
}

/**
 * JWT Refresh Token을 검증하는 함수입니다.
 * @param {string} token - 검증할 JWT Refresh Token
 * @return {object} 검증된 JWT Payload
 */
export const verifyRefreshToken = (token: string): { userId: number } => {
  return jwt.verify(token, JWT_REFRESH_SECRET) as { userId: number }
}
