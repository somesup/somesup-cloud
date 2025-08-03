import { requestPhoneAuth, verifyPhoneAuth, refreshAccessToken, guestLogin } from '../authController'
import { success, errors } from '../../utils/response'
import { authService, CodeDoesnotExistError, RefreshTokenNotFoundError } from '../../services/authService'
import { userService } from '../../services/userService'
import { generateGuestPhoneNumber, generateRandomNickname } from '../../utils/generate'
import { verifyRefreshToken } from '../../config/jwt'
import { sectionService } from '../../services/sectionService'

jest.mock('../../utils/response')
jest.mock('../../services/authService')
jest.mock('../../services/userService')
jest.mock('../../services/sectionService')
jest.mock('../../utils/generate')
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

    expect(errors.badRequest).toHaveBeenCalledWith(res, 'Phone number is required')
  })

  it('should call sendVerificationCode and sendSuccess if phoneNumber exists', async () => {
    ;(authService.sendVerificationCode as jest.Mock).mockReturnValue(undefined)
    const req = mockReq({ phoneNumber: '01012345678' })
    const res = mockRes()

    await requestPhoneAuth(req, res)

    expect(authService.sendVerificationCode).toHaveBeenCalledWith('01012345678')
    expect(success).toHaveBeenCalledWith(res, null, { message: 'Verification code sent successfully' })
  })

  it('should catch errors and send 500', async () => {
    ;(authService.sendVerificationCode as jest.Mock).mockImplementation(() => {
      throw new Error()
    })
    const req = mockReq({ phoneNumber: '01012345678' })
    const res = mockRes()

    await requestPhoneAuth(req, res)

    expect(errors.internal).toHaveBeenCalledWith(res)
  })
})

describe('verifyPhoneAuth', () => {
  it('should return 400 if phoneNumber or code is missing', async () => {
    const res = mockRes()

    await verifyPhoneAuth(mockReq({ code: '123456' }), res)
    expect(errors.badRequest).toHaveBeenCalledWith(res, 'Phone number and verification code are required')

    await verifyPhoneAuth(mockReq({ phoneNumber: '01012345678' }), res)
    expect(errors.badRequest).toHaveBeenCalledWith(res, 'Phone number and verification code are required')
  })

  it('should return 401 if verification code is invalid', async () => {
    ;(authService.verifyPhoneCode as jest.Mock).mockResolvedValue(false)
    const req = mockReq({ phoneNumber: '010', code: '123' })
    const res = mockRes()

    await verifyPhoneAuth(req, res)

    expect(errors.unauthorized).toHaveBeenCalledWith(res, 'Invalid verification code')
  })

  it('should return user data and tokens if user exists', async () => {
    ;(authService.verifyPhoneCode as jest.Mock).mockResolvedValue(true)
    ;(userService.findUserByPhone as jest.Mock).mockResolvedValue({ id: 1, phone: '010', nickname: '닉네임' })
    ;(authService.generateTokens as jest.Mock).mockResolvedValue({ accessToken: 'A', refreshToken: 'R' })
    ;(sectionService.getSectionPreferencesByUserId as jest.Mock).mockResolvedValue([
      { user_id: 1, section_id: 1, preference: 1, section_name: 'politics' },
      { user_id: 1, section_id: 2, preference: 1, section_name: 'economy' },
      { user_id: 1, section_id: 3, preference: 1, section_name: 'society' },
      { user_id: 1, section_id: 4, preference: 1, section_name: 'culture' },
      { user_id: 1, section_id: 5, preference: 1, section_name: 'tech' },
      { user_id: 1, section_id: 6, preference: 1, section_name: 'world' },
    ])

    const req = mockReq({ phoneNumber: '010', code: '123' })
    const res = mockRes()

    await verifyPhoneAuth(req, res)

    expect(success).toHaveBeenCalledWith(
      res,
      {
        user: { id: 1, phone: '010', nickname: '닉네임' },
        tokens: { accessToken: 'A', refreshToken: 'R' },
        isCreated: false,
        sectionPreferences: [
          { user_id: 1, section_id: 1, preference: 1, section_name: 'politics' },
          { user_id: 1, section_id: 2, preference: 1, section_name: 'economy' },
          { user_id: 1, section_id: 3, preference: 1, section_name: 'society' },
          { user_id: 1, section_id: 4, preference: 1, section_name: 'culture' },
          { user_id: 1, section_id: 5, preference: 1, section_name: 'tech' },
          { user_id: 1, section_id: 6, preference: 1, section_name: 'world' },
        ],
      },
      {
        message: 'Phone verification successful',
      },
    )
  })

  it('should create new user if not exists and return user data and tokens', async () => {
    ;(authService.verifyPhoneCode as jest.Mock).mockResolvedValue(true)
    ;(userService.findUserByPhone as jest.Mock).mockResolvedValue(null)
    ;(generateRandomNickname as jest.Mock).mockResolvedValue('랜덤닉네임')
    ;(userService.createUser as jest.Mock).mockResolvedValue({ id: 1, phone: '010', nickname: '랜덤닉네임' })
    ;(authService.generateTokens as jest.Mock).mockResolvedValue({ accessToken: 'A', refreshToken: 'R' })
    ;(sectionService.createDefaultSectionPreferences as jest.Mock).mockResolvedValue([
      { user_id: 1, section_id: 1, preference: 1, section_name: 'politics' },
      { user_id: 1, section_id: 2, preference: 1, section_name: 'economy' },
      { user_id: 1, section_id: 3, preference: 1, section_name: 'society' },
      { user_id: 1, section_id: 4, preference: 1, section_name: 'culture' },
      { user_id: 1, section_id: 5, preference: 1, section_name: 'tech' },
      { user_id: 1, section_id: 6, preference: 1, section_name: 'world' },
    ])

    const req = mockReq({ phoneNumber: '010', code: '123' })
    const res = mockRes()

    await verifyPhoneAuth(req, res)

    expect(userService.createUser).toHaveBeenCalledWith('010', '랜덤닉네임', true)
    expect(success).toHaveBeenCalledWith(
      res,
      {
        user: { id: 1, phone: '010', nickname: '랜덤닉네임' },
        tokens: { accessToken: 'A', refreshToken: 'R' },
        isCreated: true,
        sectionPreferences: [
          { user_id: 1, section_id: 1, preference: 1, section_name: 'politics' },
          { user_id: 1, section_id: 2, preference: 1, section_name: 'economy' },
          { user_id: 1, section_id: 3, preference: 1, section_name: 'society' },
          { user_id: 1, section_id: 4, preference: 1, section_name: 'culture' },
          { user_id: 1, section_id: 5, preference: 1, section_name: 'tech' },
          { user_id: 1, section_id: 6, preference: 1, section_name: 'world' },
        ],
      },
      {
        message: 'Phone verification successful',
      },
    )
  })

  it('should return 404 if verification code does not exist or has expired', async () => {
    ;(authService.verifyPhoneCode as jest.Mock).mockImplementation(() => {
      throw new CodeDoesnotExistError('Verification code does not exist or has expired')
    })
    const req = mockReq({ phoneNumber: '010', code: '123' })
    const res = mockRes()

    await verifyPhoneAuth(req, res)

    expect(errors.notFound).toHaveBeenCalledWith(res, 'Verification code does not exist or has expired')
  })

  it('should return Internal server error on unexpected error', async () => {
    ;(authService.verifyPhoneCode as jest.Mock).mockImplementation(() => {
      throw new Error('Unexpected error')
    })
    const req = mockReq({ phoneNumber: '010', code: '123' })
    const res = mockRes()

    await verifyPhoneAuth(req, res)

    expect(errors.internal).toHaveBeenCalledWith(res)
  })
})

describe('guestLogin', () => {
  it('should create a new user with random phone number and nickname', async () => {
    ;(generateGuestPhoneNumber as jest.Mock).mockReturnValue('GUEST-1')
    ;(generateRandomNickname as jest.Mock).mockResolvedValue('랜덤닉네임')
    ;(userService.createUser as jest.Mock).mockResolvedValue({ id: 1, phone: 'GUEST-1', nickname: '랜덤닉네임' })
    ;(authService.generateTokens as jest.Mock).mockResolvedValue({ accessToken: 'A', refreshToken: 'R' })
    sectionService.createDefaultSectionPreferences as jest.Mock
    ;(sectionService.getSectionPreferencesByUserId as jest.Mock).mockResolvedValue([
      { userId: 1, sectionId: 1, sectionName: 'politics', preference: 1 },
    ])

    const req = mockReq({})
    const res = mockRes()

    await guestLogin(req, res)

    expect(generateRandomNickname).toHaveBeenCalled()
    expect(userService.createUser).toHaveBeenCalledWith('GUEST-1', '랜덤닉네임', false)
    expect(authService.generateTokens).toHaveBeenCalledWith(1)
    expect(success).toHaveBeenCalledWith(
      res,
      {
        user: { id: 1, phone: 'GUEST-1', nickname: '랜덤닉네임' },
        tokens: { accessToken: 'A', refreshToken: 'R' },
        isCreated: true,
        sectionPreferences: [{ userId: 1, sectionId: 1, sectionName: 'politics', preference: 1 }],
      },
      {
        message: 'Guest login successful',
      },
    )
  })

  it('should return internal server error on unexpected error', async () => {
    ;(generateGuestPhoneNumber as jest.Mock).mockReturnValue('GUEST-1')
    ;(generateRandomNickname as jest.Mock).mockResolvedValue('랜덤닉네임')
    ;(userService.createUser as jest.Mock).mockImplementation(() => {
      throw new Error('Unexpected error')
    })

    const req = mockReq({})
    const res = mockRes()

    await guestLogin(req, res)

    expect(errors.internal).toHaveBeenCalledWith(res)
  })
})

describe('refreshAccessToken', () => {
  it('should return 400 if refreshToken is missing', async () => {
    const req = mockReq({})
    const res = mockRes()

    await refreshAccessToken(req, res)

    expect(errors.badRequest).toHaveBeenCalledWith(res, 'Refresh token is required')
  })

  it('should return 401 if dbToken not found', async () => {
    ;(verifyRefreshToken as jest.Mock).mockReturnValue({ userId: 1 })
    ;(authService.getRefreshTokenByUserId as jest.Mock).mockResolvedValue(undefined)

    const req = mockReq({ refreshToken: 'RT' })
    const res = mockRes()

    await refreshAccessToken(req, res)

    expect(errors.unauthorized).toHaveBeenCalledWith(res, 'Refresh token not found')
  })

  it('should return 401 if tokens are not matched', async () => {
    ;(verifyRefreshToken as jest.Mock).mockReturnValue({ userId: 1 })
    ;(authService.getRefreshTokenByUserId as jest.Mock).mockResolvedValue('DB_RT_NOT_MATCH')

    const req = mockReq({ refreshToken: 'RT' })
    const res = mockRes()

    await refreshAccessToken(req, res)

    expect(errors.unauthorized).toHaveBeenCalledWith(res, 'Invalid refresh token')
  })

  it('should return 404 if user is not found', async () => {
    ;(verifyRefreshToken as jest.Mock).mockReturnValue({ userId: 1 })
    ;(authService.getRefreshTokenByUserId as jest.Mock).mockResolvedValue('RT')
    ;(userService.findUserById as jest.Mock).mockResolvedValue(undefined)

    const req = mockReq({ refreshToken: 'RT' })
    const res = mockRes()

    await refreshAccessToken(req, res)

    expect(errors.notFound).toHaveBeenCalledWith(res, 'User not found')
  })

  it('should generate and return new tokens if valid', async () => {
    ;(verifyRefreshToken as jest.Mock).mockReturnValue({ userId: 1 })
    ;(authService.getRefreshTokenByUserId as jest.Mock).mockResolvedValue('RT')
    ;(userService.findUserById as jest.Mock).mockResolvedValue({ id: 1 })
    ;(authService.generateTokens as jest.Mock).mockResolvedValue({ accessToken: 'A', refreshToken: 'R' })

    const req = mockReq({ refreshToken: 'RT' })
    const res = mockRes()

    await refreshAccessToken(req, res)

    expect(success).toHaveBeenCalledWith(
      res,
      { accessToken: 'A', refreshToken: 'R' },
      {
        message: 'Access token refreshed successfully',
      },
    )
  })

  it('should handle RefreshTokenNotFoundError', async () => {
    ;(verifyRefreshToken as jest.Mock).mockReturnValue({ userId: 1 })
    ;(authService.getRefreshTokenByUserId as jest.Mock).mockImplementation(() => {
      throw new RefreshTokenNotFoundError('Refresh token not found for the user')
    })

    const req = mockReq({ refreshToken: 'RT' })
    const res = mockRes()

    await refreshAccessToken(req, res)

    expect(errors.unauthorized).toHaveBeenCalledWith(res, 'Refresh token not found for the user')
  })

  it('should handle unexpected errors', async () => {
    ;(verifyRefreshToken as jest.Mock).mockReturnValue({ userId: 1 })
    ;(authService.getRefreshTokenByUserId as jest.Mock).mockImplementation(() => {
      throw new Error('Unexpected error')
    })

    const req = mockReq({ refreshToken: 'RT' })
    const res = mockRes()

    await refreshAccessToken(req, res)

    expect(errors.unauthorized).toHaveBeenCalledWith(res, 'Invalid refresh token')
  })
})
