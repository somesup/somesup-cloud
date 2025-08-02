import { Router } from 'express'
import { guestLogin, refreshAccessToken, requestPhoneAuth, verifyPhoneAuth } from '../controllers/authController'

const router = Router()

/**
 * 전화번호 인증 요청
 * POST /phone/request
 */
router.post('/phone/request', requestPhoneAuth)

/**
 * 전화번호 인증 코드 검증
 * POST /phone/verify
 */
router.post('/phone/verify', verifyPhoneAuth)

/**
 * Guest 사용자 생성
 * POST /guest-login
 */
router.post('/guest-login', guestLogin)

/**
 * Access Token 갱신
 * POST /refresh
 */
router.post('/refresh', refreshAccessToken)

export default router
