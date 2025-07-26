import { Router } from 'express'
import { authenticateJWT } from '../middlewares/authenticateJWT'
import { updateNickname, updateUser } from '../controllers/userController'

const router = Router()

/**
 * 사용자 닉네임 업데이트
 */
router.patch('/', authenticateJWT, updateUser)

export default router
