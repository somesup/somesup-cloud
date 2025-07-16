import { prisma } from '../../prisma/prisma'
import { generateAccessToken, generateRefreshToken } from '../config/jwt'
import { redisClient } from '../config/redis'
import { sendSMSVerificationCode } from './coolsmsService'

export const PHONE_VERIFICATION_EXPIRATION = 5 * 60 // 5분(초 단위)

/**
 * 인증 코드가 존재하지 않거나 만료된 경우 발생하는 에러 클래스입니다.
 */
export class CodeDoesnotExistError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CodeDoesnotExistError'
  }
}

/**
 * 리프레시 토큰이 존재하지 않는 경우 발생하는 에러 클래스입니다.
 */
export class RefreshTokenNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RefreshTokenNotFoundError'
  }
}

/**
 * 액세스 토큰과 리프레시 토큰을 담는 인터페이스입니다.
 * @property accessToken 액세스 토큰 문자열
 * @property refreshToken 리프레시 토큰 문자열
 */
interface Tokens {
  accessToken: string
  refreshToken: string
}

/**
 * 인증 관련 서비스 객체입니다.
 * 휴대폰 인증 코드 발송, 인증 코드 검증, JWT 토큰 발급 기능을 제공합니다.
 */
export const authService = {
  /**
   * 주어진 휴대폰 번호로 6자리 인증 코드를 생성하여 SMS로 전송합니다.
   * 인증 코드는 Redis에 `PHONE_VERIFICATION_EXPIRATION`기간 동안 저장됩니다.
   *
   * @param {string} phoneNumber - 인증 코드를 받을 휴대폰 번호
   * @returns {Promise<void>} 반환값 없음
   * @throws 인증 코드 발송에 실패할 경우 에러를 발생시킵니다.
   */
  sendVerificationCode: async (phoneNumber: string): Promise<void> => {
    try {
      const code = Math.floor(100000 + Math.random() * 900000) // 6자리 랜덤 코드 생성

      await redisClient.setEx(`phone_verification:${phoneNumber}`, PHONE_VERIFICATION_EXPIRATION, code.toString())

      sendSMSVerificationCode(phoneNumber, code)
    } catch (error) {
      throw new Error('Failed to send verification code')
    }
  },

  /**
   * 휴대폰 번호와 입력된 인증 코드가 일치하는지 검증합니다.
   * 인증 코드는 Redis에서 조회하며, 일치하지 않거나 만료된 경우 에러를 발생시킵니다.
   *
   * @async
   * @param {string} phoneNumber - 인증을 시도하는 휴대폰 번호
   * @param {number} code - 사용자가 입력한 인증 코드
   * @returns {Promise<boolean>} 인증 성공 여부 (성공 시 true)
   * @throws 인증 코드가 없거나 일치하지 않을 경우 에러를 발생시킵니다.
   */
  verifyPhoneCode: async (phoneNumber: string, code: number): Promise<boolean> => {
    const storedCode = await redisClient.get(`phone_verification:${phoneNumber}`)

    if (!storedCode) {
      throw new CodeDoesnotExistError('Verification code does not exist or has expired')
    }

    return storedCode === code.toString()
  },

  /**
   * 주어진 사용자 ID로 액세스 토큰과 리프레시 토큰을 생성합니다.
   * 리프레시 토큰은 데이터베이스에 저장(또는 갱신)되며, 만료일은 30일 후로 설정됩니다.
   *
   * @async
   * @param {number} userId - 토큰을 생성할 사용자 ID
   * @returns {Promise<Tokens>} 생성된 액세스 토큰과 리프레시 토큰 객체
   */
  generateTokens: async (userId: number): Promise<Tokens> => {
    const accessToken = generateAccessToken(userId)
    const refreshToken = generateRefreshToken(userId)

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30)

    await prisma.refreshToken.upsert({
      where: { user_id: userId },
      update: {
        token: refreshToken,
        expires_at: expiresAt,
      },
      create: {
        user_id: userId,
        token: refreshToken,
        expires_at: expiresAt,
      },
    })

    return {
      accessToken,
      refreshToken,
    }
  },

  /**
   * 주어진 사용자 ID로 저장된 리프레시 토큰을 조회합니다.
   * 해당 사용자의 리프레시 토큰이 없으면 null을 반환합니다.
   *
   * @async
   * @param {number} userId - 리프레시 토큰을 조회할 사용자 ID
   * @returns {Promise<string>} 해당 사용자의 리프레시 토큰 문자열
   */
  getRefreshTokenByUserId: async (userId: number): Promise<string> => {
    const tokenRecord = await prisma.refreshToken.findUnique({
      where: { user_id: userId },
    })

    if (!tokenRecord) {
      throw new RefreshTokenNotFoundError('Refresh token not found for the user')
    }

    return tokenRecord.token
  },
}
