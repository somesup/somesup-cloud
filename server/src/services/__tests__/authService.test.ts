import {
  authService,
  CodeDoesnotExistError,
  PHONE_VERIFICATION_EXPIRATION,
  RefreshTokenNotFoundError,
} from '../authService'
import { redisClient } from '../../config/redis'
import { generateAccessToken, generateRefreshToken } from '../../config/jwt'
import { sendSMSVerificationCode } from '../coolsmsService'
import { prismaMock } from '../../../prisma/mock'

jest.mock('../../config/redis')
jest.mock('../../config/jwt')
jest.mock('../coolsmsService')

describe('authService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('sendVerificationCode', () => {
    it('should generate code, store in redis, and send SMS', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0)

      const setExMock = jest.fn().mockResolvedValue(undefined)
      ;(redisClient.setEx as jest.Mock) = setExMock

      const sendSMSMock = jest.fn()
      ;(sendSMSVerificationCode as jest.Mock) = sendSMSMock

      const phoneNumber = '01012345678'

      await authService.sendVerificationCode(phoneNumber)

      expect(setExMock).toHaveBeenCalledWith(
        `phone_verification:${phoneNumber}`,
        PHONE_VERIFICATION_EXPIRATION,
        '100000',
      )
      expect(sendSMSMock).toHaveBeenCalledWith(phoneNumber, 100000)
    })

    it('should throw error if redis or sms fails', async () => {
      ;(redisClient.setEx as jest.Mock).mockRejectedValue(new Error('redis fail'))
      const phoneNumber = '01012345678'
      await expect(authService.sendVerificationCode(phoneNumber)).rejects.toThrow('Failed to send verification code')
    })
  })

  describe('verifyPhoneCode', () => {
    it('should return true if code matches', async () => {
      ;(redisClient.get as jest.Mock).mockResolvedValue('123456')
      const result = await authService.verifyPhoneCode('01012345678', 123456)
      expect(result).toBe(true)
    })

    it('should return false if code does not match', async () => {
      ;(redisClient.get as jest.Mock).mockResolvedValue('654321')
      const result = await authService.verifyPhoneCode('01012345678', 123456)
      expect(result).toBe(false)
    })

    it('should throw CodeDoesnotExistError if code not found', async () => {
      ;(redisClient.get as jest.Mock).mockResolvedValue(null)
      await expect(authService.verifyPhoneCode('01012345678', 123456)).rejects.toThrow(CodeDoesnotExistError)
    })
  })

  describe('generateTokens', () => {
    it('should generate tokens and upsert refreshToken', async () => {
      ;(generateAccessToken as jest.Mock).mockReturnValue('access-token')
      ;(generateRefreshToken as jest.Mock).mockReturnValue('refresh-token')
      prismaMock.refreshToken.upsert.mockResolvedValue({
        id: 1,
        user_id: 1,
        token: 'refresh-token',
        expires_at: new Date(),
        created_at: new Date(),
        revoked_at: null,
        is_revoked: false,
      })

      const result = await authService.generateTokens(1)

      expect(generateAccessToken).toHaveBeenCalledWith(1)
      expect(generateRefreshToken).toHaveBeenCalledWith(1)

      expect(prismaMock.refreshToken.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: 1 },
          update: expect.any(Object),
          create: expect.any(Object),
        }),
      )
      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      })
    })
  })

  describe('getRefreshTokenByUserId', () => {
    it('should return token if found', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue({
        id: 1,
        user_id: 1,
        token: 'refresh-token',
        expires_at: new Date(),
        created_at: new Date(),
        revoked_at: null,
        is_revoked: false,
      })

      const result = await authService.getRefreshTokenByUserId(1)
      expect(result).toBe('refresh-token')
    })

    it('should throw RefreshTokenNotFoundError if not found', async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValue(null)
      await expect(authService.getRefreshTokenByUserId(1)).rejects.toThrow(RefreshTokenNotFoundError)
    })
  })
})
