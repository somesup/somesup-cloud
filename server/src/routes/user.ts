import { Router } from 'express'
import { authenticateJWT } from '../middlewares/authenticateJWT'
import { updateUser, updateUserSectionPreferences } from '../controllers/userController'

const router = Router()

/**
 * 사용자 닉네임 업데이트
 */
router.patch('/', authenticateJWT, updateUser)

/**
 * 사용자 섹션 선호도 업데이트
 */
router.patch('/section-preferences', authenticateJWT, updateUserSectionPreferences)

export default router
