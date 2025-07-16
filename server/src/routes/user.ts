import { Router } from 'express'
import { authenticateJWT } from '../middlewares/authenticateJWT'
import { updateNickname } from '../controllers/userController'

const router = Router()

router.put('/me/nickname', authenticateJWT, updateNickname)

export default router
