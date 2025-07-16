import jwt from 'jsonwebtoken'
import { JWT_SECRET } from '../config/jwt'
import { sendError } from '../utils/response'
import { Request, Response, NextFunction } from 'express'

/**
 * JWT 페이로드의 타입을 정의합니다.
 *
 * @interface JWTPayload
 * @property {number} id - 사용자 고유 ID
 * @property {number} [iat] - 토큰 발급 시간(Unix timestamp, 선택)
 * @property {number} [exp] - 토큰 만료 시간(Unix timestamp, 선택)
 */
export interface JWTPayload {
  userId: number
  iat?: number
  exp?: number
}

/**
 * 인증된 요청 객체의 타입을 확장합니다.
 *
 * @interface AuthenticatedRequest
 * @extends Request
 * @property {JWTPayload} [user] - JWT 인증 후 추가되는 사용자 정보
 */
export interface AuthenticatedRequest extends Request {
  userId?: number
}

/**
 * JWT 토큰을 인증하는 미들웨어 함수입니다.
 *
 * 요청 헤더의 Authorization에서 토큰을 추출하여 검증하고,
 * 검증에 성공하면 req.user에 사용자 정보를 할당합니다.
 * 토큰이 없거나 유효하지 않은 경우 401 에러를 반환합니다.
 *
 * @function authenticateJWT
 * @param {AuthenticatedRequest} req - 인증된 요청 객체
 * @param {Response<} res - Express 응답 객체
 * @param {NextFunction} next - 다음 미들웨어로 제어를 넘기는 함수
 *
 * @example
 * // 사용 예시 (라우터에서 미들웨어로 사용)
 * router.get('/profile', authenticateJWT, (req, res) => {
 *   // req.user를 통해 사용자 정보 접근 가능
 * });
 */
export const authenticateJWT = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1]

  if (!token) {
    return sendError(res, 'Access token is required', 401)
  }

  try {
    const decodedJwtPayload = jwt.verify(token, JWT_SECRET) as JWTPayload
    req.userId = decodedJwtPayload.userId
    next()
  } catch (error) {
    return sendError(res, 'Invalid or expired access token', 401)
  }
}
