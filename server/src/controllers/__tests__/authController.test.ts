import { requestPhoneAuth, verifyPhoneAuth, refreshAccessToken } from '../authController'
import { sendError, sendSuccess } from '../../utils/response'
import { authService, CodeDoesnotExistError, RefreshTokenNotFoundError } from '../../services/authService'
import { userService } from '../../services/userService'
import { generateRandomNickname } from '../../utils/nickname'
import { verifyRefreshToken } from '../../config/jwt'

jest.mock('../../utils/response')
jest.mock('../../services/authService')
jest.mock('../../services/userService')
jest.mock('../../utils/nickname')
jest.mock('../../config/jwt')

const mockReq = (body: any = {}) => ({ body }) as any
const mockRes = () => {
  const res: any = {}
  res.status = jest.fn(() => res)
  res.send = jest.fn(() => res)
  res.json = jest.fn(() => res)
  return res
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('requestPhoneAuth', () => {
  it('should return 400 if phoneNumber is missing', async () => {
    const req = mockReq({})
    const res = mockRes()

    await requestPhoneAuth(req, res)

    expect(sendError).toHaveBeenCalledWith(res, 'Phone number is required', 400)
  })

  it('should call sendVerificationCode and sendSuccess if phoneNumber exists', async () => {
    ;(authService.sendVerificationCode as jest.Mock).mockReturnValue(undefined)
    const req = mockReq({ phoneNumber: '01012345678' })
    const res = mockRes()

    await requestPhoneAuth(req, res)

    expect(authService.sendVerificationCode).toHaveBeenCalledWith('01012345678')
    expect(sendSuccess).toHaveBeenCalledWith(res, 'Verification code sent successfully')
  })

  it('should catch errors and send 500', async () => {
    ;(authService.sendVerificationCode as jest.Mock).mockImplementation(() => {
      throw new Error()
    })
    const req = mockReq({ phoneNumber: '01012345678' })
    const res = mockRes()

    await requestPhoneAuth(req, res)

    expect(sendError).toHaveBeenCalledWith(res, 'Internal server error', 500)
  })
})

describe('verifyPhoneAuth', () => {
  it('should return 400 if phoneNumber or code is missing', async () => {
    const res = mockRes()

    await verifyPhoneAuth(mockReq({ code: '123456' }), res)
    expect(sendError).toHaveBeenCalledWith(res, 'Phone number and code are required', 400)

    await verifyPhoneAuth(mockReq({ phoneNumber: '01012345678' }), res)
    expect(sendError).toHaveBeenCalledWith(res, 'Phone number and code are required', 400)
  })

  it('should return 400 if verification code is invalid', async () => {
    ;(authService.verifyPhoneCode as jest.Mock).mockResolvedValue(false)
    const req = mockReq({ phoneNumber: '010', code: '123' })
    const res = mockRes()

    await verifyPhoneAuth(req, res)

    expect(sendError).toHaveBeenCalledWith(res, 'Invalid verification code', 400)
  })

  it('should return user data and tokens if user exists', async () => {
    ;(authService.verifyPhoneCode as jest.Mock).mockResolvedValue(true)
    ;(userService.findUserByPhone as jest.Mock).mockResolvedValue({ id: 1, phone: '010', nickname: '닉네임' })
    ;(authService.generateTokens as jest.Mock).mockResolvedValue({ accessToken: 'A', refreshToken: 'R' })

    const req = mockReq({ phoneNumber: '010', code: '123' })
    const res = mockRes()

    await verifyPhoneAuth(req, res)

    expect(sendSuccess).toHaveBeenCalledWith(res, {
      user: { id: 1, phone: '010', nickname: '닉네임' },
      tokens: { accessToken: 'A', refreshToken: 'R' },
    })
  })

  it('should create new user if not exists and return user data and tokens', async () => {
    ;(authService.verifyPhoneCode as jest.Mock).mockResolvedValue(true)
    ;(userService.findUserByPhone as jest.Mock).mockResolvedValue(null)
    ;(generateRandomNickname as jest.Mock).mockResolvedValue('랜덤닉네임')
    ;(userService.createUser as jest.Mock).mockResolvedValue({ id: 1, phone: '010', nickname: '랜덤닉네임' })
    ;(authService.generateTokens as jest.Mock).mockResolvedValue({ accessToken: 'A', refreshToken: 'R' })

    const req = mockReq({ phoneNumber: '010', code: '123' })
    const res = mockRes()

    await verifyPhoneAuth(req, res)

    expect(userService.createUser).toHaveBeenCalledWith('010', '랜덤닉네임', true)
    expect(sendSuccess).toHaveBeenCalledWith(res, {
      user: { id: 1, phone: '010', nickname: '랜덤닉네임' },
      tokens: { accessToken: 'A', refreshToken: 'R' },
    })
  })

  it('should handle CodeDoesnotExistError', async () => {
    ;(authService.verifyPhoneCode as jest.Mock).mockImplementation(() => {
      throw new CodeDoesnotExistError('Verification code does not exist or has expired')
    })
    const req = mockReq({ phoneNumber: '010', code: '123' })
    const res = mockRes()

    await verifyPhoneAuth(req, res)

    expect(sendError).toHaveBeenCalledWith(res, 'Verification code does not exist or has expired', 400)
  })

  it('should return Internal server error on unexpected error', async () => {
    ;(authService.verifyPhoneCode as jest.Mock).mockImplementation(() => {
      throw new Error('Unexpected error')
    })
    const req = mockReq({ phoneNumber: '010', code: '123' })
    const res = mockRes()

    await verifyPhoneAuth(req, res)

    expect(sendError).toHaveBeenCalledWith(res, 'Internal server error', 500)
  })
})

describe('refreshAccessToken', () => {
  it('should return 400 if refreshToken is missing', async () => {
    const req = mockReq({})
    const res = mockRes()

    await refreshAccessToken(req, res)

    expect(sendError).toHaveBeenCalledWith(res, 'Refresh token is required', 400)
  })

  it('should return 401 if dbToken not found', async () => {
    ;(verifyRefreshToken as jest.Mock).mockReturnValue({ userId: 1 })
    ;(authService.getRefreshTokenByUserId as jest.Mock).mockResolvedValue(undefined)

    const req = mockReq({ refreshToken: 'RT' })
    const res = mockRes()

    await refreshAccessToken(req, res)

    expect(sendError).toHaveBeenCalledWith(res, 'Refresh token not found', 401)
  })

  it('should return 401 if tokens are not matched', async () => {
    ;(verifyRefreshToken as jest.Mock).mockReturnValue({ userId: 1 })
    ;(authService.getRefreshTokenByUserId as jest.Mock).mockResolvedValue('DB_RT_NOT_MATCH')

    const req = mockReq({ refreshToken: 'RT' })
    const res = mockRes()

    await refreshAccessToken(req, res)

    expect(sendError).toHaveBeenCalledWith(res, 'Invalid refresh token', 401)
  })

  it('should return 404 if user is not found', async () => {
    ;(verifyRefreshToken as jest.Mock).mockReturnValue({ userId: 1 })
    ;(authService.getRefreshTokenByUserId as jest.Mock).mockResolvedValue('RT')
    ;(userService.findUserById as jest.Mock).mockResolvedValue(undefined)

    const req = mockReq({ refreshToken: 'RT' })
    const res = mockRes()

    await refreshAccessToken(req, res)

    expect(sendError).toHaveBeenCalledWith(res, 'User not found', 404)
  })

  it('should generate and return new tokens if valid', async () => {
    ;(verifyRefreshToken as jest.Mock).mockReturnValue({ userId: 1 })
    ;(authService.getRefreshTokenByUserId as jest.Mock).mockResolvedValue('RT')
    ;(userService.findUserById as jest.Mock).mockResolvedValue({ id: 1 })
    ;(authService.generateTokens as jest.Mock).mockResolvedValue({ accessToken: 'A', refreshToken: 'R' })

    const req = mockReq({ refreshToken: 'RT' })
    const res = mockRes()

    await refreshAccessToken(req, res)

    expect(sendSuccess).toHaveBeenCalledWith(res, { accessToken: 'A', refreshToken: 'R' })
  })

  it('should handle RefreshTokenNotFoundError', async () => {
    ;(verifyRefreshToken as jest.Mock).mockReturnValue({ userId: 1 })
    ;(authService.getRefreshTokenByUserId as jest.Mock).mockImplementation(() => {
      throw new RefreshTokenNotFoundError('Refresh token not found for the user')
    })

    const req = mockReq({ refreshToken: 'RT' })
    const res = mockRes()

    await refreshAccessToken(req, res)

    expect(sendError).toHaveBeenCalledWith(res, 'Refresh token not found for the user', 401)
  })

  it('should handle unexpected errors', async () => {
    ;(verifyRefreshToken as jest.Mock).mockReturnValue({ userId: 1 })
    ;(authService.getRefreshTokenByUserId as jest.Mock).mockImplementation(() => {
      throw new Error('Unexpected error')
    })

    const req = mockReq({ refreshToken: 'RT' })
    const res = mockRes()

    await refreshAccessToken(req, res)

    expect(sendError).toHaveBeenCalledWith(res, 'Invalid refresh token', 401)
  })
})
