import { Request, Response } from 'express'
import { sendError, sendSuccess } from '../utils/response'
import { authService, CodeDoesnotExistError, RefreshTokenNotFoundError } from '../services/authService'
import { userService } from '../services/userService'
import { generateRandomNickname } from '../utils/nickname'
import { verifyRefreshToken } from '../config/jwt'

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
    return sendError(res, 'Phone number is required', 400)
  }

  try {
    authService.sendVerificationCode(phoneNumber)
    return sendSuccess(res, 'Verification code sent successfully')
  } catch (error) {
    return sendError(res, 'Internal server error', 500)
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
    return sendError(res, 'Phone number and code are required', 400)
  }

  try {
    const isValidCode = await authService.verifyPhoneCode(phoneNumber, code)
    if (!isValidCode) {
      return sendError(res, 'Invalid verification code', 400)
    }

    let user = await userService.findUserByPhone(phoneNumber)
    if (!user) {
      const nickname = await generateRandomNickname()
      user = await userService.createUser(phoneNumber, nickname, true)
    }

    const tokens = await authService.generateTokens(user.id)

    const userData = {
      user: {
        id: user.id,
        phone: user.phone,
        nickname: user.nickname,
      },
      tokens,
    }

    return sendSuccess(res, userData)
  } catch (error) {
    if (error instanceof CodeDoesnotExistError) {
      return sendError(res, 'Verification code does not exist or has expired', 400)
    }
    return sendError(res, 'Internal server error', 500)
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
    return sendError(res, 'Refresh token is required', 400)
  }

  try {
    const decoded = verifyRefreshToken(refreshToken)
    const dbToken = await authService.getRefreshTokenByUserId(decoded.userId)
    if (!dbToken) {
      return sendError(res, 'Refresh token not found', 401)
    }

    if (dbToken !== refreshToken) {
      return sendError(res, 'Invalid refresh token', 401)
    }

    const user = await userService.findUserById(decoded.userId)
    if (!user) {
      return sendError(res, 'User not found', 404)
    }

    const tokens = await authService.generateTokens(user.id)

    return sendSuccess(res, tokens)
  } catch (error) {
    if (error instanceof RefreshTokenNotFoundError) {
      return sendError(res, 'Refresh token not found for the user', 401)
    }
    return sendError(res, 'Invalid refresh token', 401)
  }
}
