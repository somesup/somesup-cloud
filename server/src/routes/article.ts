import { Router } from 'express'
import { getArticles, getArticleById, recordViewEvent } from '../controllers/articleController'
import { authenticateJWT } from '../middlewares/authenticateJWT'

const router = Router()

/**
 * 기사 목록 조회 (페이지네이션)
 * GET /
 */
router.get('/', getArticles)

/**
 * 특정 기사 조회
 * GET /:id
 */
router.get('/:id', getArticleById)

/**
 * 기사 조회 이벤트 기록
 * POST /view-event
 */
router.post('/view-event', authenticateJWT, recordViewEvent)

export default router
