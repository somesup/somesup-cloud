import { Request, Response } from 'express'
import { errors, success } from '../utils/response'
import { authService, CodeDoesnotExistError, RefreshTokenNotFoundError } from '../services/authService'
import { userService } from '../services/userService'
import { generateGuestPhoneNumber, generateRandomNickname } from '../utils/generate'
import { verifyRefreshToken } from '../config/jwt'
import { sectionService } from '../services/sectionService'

/**
 * 휴대폰 번호로 인증을 요청하는 컨트롤러입니다.
 * 사용자가 휴대폰 번호를 입력하면, 해당 번호로 인증 코드를 전송합니다.
 *
 * @param {Request} req - Express 요청 객체. body에 phoneNumber가 포함되어야 합니다.
 * @param {Response} res - Express 응답 객체.
 *
 * @example
 * // 요청 예시
 * POST /api/auth/phone/request
 * {
 *   "phoneNumber": "01012345678"
 * }
 */
export const requestPhoneAuth = async (req: Request, res: Response) => {
  const { phoneNumber } = req.body

  if (!phoneNumber) {
    return errors.badRequest(res, 'Phone number is required')
  }

  try {
    authService.sendVerificationCode(phoneNumber)
    return success(res, null, {
      message: 'Verification code sent successfully',
    })
  } catch (error) {
    return errors.internal(res)
  }
}

/**
 * 휴대폰 번호로 인증 코드를 검증하는 컨트롤러입니다.
 * 사용자가 입력한 인증 코드가 올바른지 확인하고, 사용자 정보와 JWT 토큰을 반환합니다.
 * 사용자가 해당 번호로 인증을 받은 적이 없다면, 새로운 사용자를 생성하여 반환합니다.
 *
 * @param {Request} req - Express 요청 객체. body에 phoneNumber와 code가 포함되어야 합니다.
 * @param {Response} res - Express 응답 객체.
 *
 * @example
 * // 요청 예시
 * POST /api/auth/phone/verify
 *
 * {
 *   "phoneNumber": "01012345678",
 *   "code": "123456"
 * }
 */
export const verifyPhoneAuth = async (req: Request, res: Response) => {
  const { phoneNumber, code } = req.body

  if (!phoneNumber || !code) {
    return errors.badRequest(res, 'Phone number and verification code are required')
  }

  try {
    const isValidCode = await authService.verifyPhoneCode(phoneNumber, code)
    if (!isValidCode) {
      return errors.unauthorized(res, 'Invalid verification code')
    }

    let user = await userService.findUserByPhone(phoneNumber)
    let isCreated: Boolean = false
    if (!user) {
      const nickname = await generateRandomNickname()
      // 새로운 사용자를 생성합니다.
      user = await userService.createUser(phoneNumber, nickname, true)
      // 기본 섹션 선호도를 생성합니다.
      await sectionService.createDefaultSectionPreferences(user.id)
      // 사용자가 새로 생성되었음을 표시합니다.
      isCreated = true
    }

    const tokens = await authService.generateTokens(user.id)
    const sectionPreferences = await sectionService.getSectionPreferencesByUserId(user.id)

    const userData = {
      user: {
        id: user.id,
        phone: user.phone,
        nickname: user.nickname,
      },
      tokens,
      isCreated,
      sectionPreferences,
    }

    return success(res, userData, {
      message: 'Phone verification successful',
    })
  } catch (error) {
    if (error instanceof CodeDoesnotExistError) {
      return errors.notFound(res, 'Verification code does not exist or has expired')
    }
    return errors.internal(res)
  }
}

/**
 * 게스트 로그인 컨트롤러입니다.
 * 사용자가 게스트로 로그인할 때 호출되며, 임시 휴대폰 번호와 닉네임을 생성하여 새로운 사용자를 생성합니다.
 * 생성된 사용자 정보와 JWT 토큰을 반환합니다.
 *
 * @param {Request} req - Express 요청 객체.
 * @param {Response} res - Express 응답 객체.
 *
 * @example
 * // 요청 예시
 * POST /api/auth/guest-login
 */
export const guestLogin = async (req: Request, res: Response) => {
  try {
    const phoneNumber = await generateGuestPhoneNumber()
    const nickname = await generateRandomNickname()
    // 게스트 사용자를 생성합니다.
    const user = await userService.createUser(phoneNumber, nickname, false)
    // 기본 섹션 선호도를 생성합니다.
    await sectionService.createDefaultSectionPreferences(user.id)

    const tokens = await authService.generateTokens(user.id)
    const sectionPreferences = await sectionService.getSectionPreferencesByUserId(user.id)

    const userData = {
      user: {
        id: user.id,
        phone: user.phone,
        nickname: user.nickname,
      },
      tokens,
      isCreated: true,
    }

    return success(res, userData, {
      message: 'Guest login successful',
    })
  } catch (error) {
    console.error('Error during guest login:', error)
    return errors.internal(res)
  }
}

/**
 * 액세스 토큰을 갱신하는 컨트롤러입니다.
 * 사용자가 유효한 리프레시 토큰을 제공하면, 새로운 액세스 토큰을 발급합니다.
 * 리프레시 토큰이 유효하지 않거나 만료된 경우, 에러를 반환합니다.
 *
 * @param {Request} req - Express 요청 객체. body에 refreshToken이 포함되어야 합니다.
 * @param {Response} res - Express 응답 객체.
 * @example
 * // 요청 예시
 * POST /api/auth/refresh
 * {
 *  "refreshToken": "your_refresh_token_here"
 *  }
 */
export const refreshAccessToken = async (req: Request, res: Response) => {
  const { refreshToken } = req.body
  if (!refreshToken) {
    return errors.badRequest(res, 'Refresh token is required')
  }

  try {
    const decoded = verifyRefreshToken(refreshToken)
    const dbToken = await authService.getRefreshTokenByUserId(decoded.userId)
    if (!dbToken) {
      return errors.unauthorized(res, 'Refresh token not found')
    }

    if (dbToken !== refreshToken) {
      return errors.unauthorized(res, 'Invalid refresh token')
    }

    const user = await userService.findUserById(decoded.userId)
    if (!user) {
      return errors.notFound(res, 'User not found')
    }

    const tokens = await authService.generateTokens(user.id)

    return success(res, tokens, {
      message: 'Access token refreshed successfully',
    })
  } catch (error) {
    if (error instanceof RefreshTokenNotFoundError) {
      return errors.unauthorized(res, 'Refresh token not found for the user')
    }
    return errors.unauthorized(res, 'Invalid refresh token')
  }
}
