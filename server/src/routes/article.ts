import { Router } from 'express'
import {
  getArticles,
  getArticleById,
  storeArticleViewEvent,
  addLikeToArticle,
  removeLikeFromArticle,
} from '../controllers/articleController'
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
 * 특정 기사에 좋아요 추가
 * POST /:id/like
 */
router.post('/:id/like', authenticateJWT, addLikeToArticle)

/**
 * 특정 기사에 좋아요 제거
 * DELETE /:id/like
 */
router.delete('/:id/like', authenticateJWT, removeLikeFromArticle)

/**
 * 기사 조회 이벤트 저장
 * POST /view-events
 */
router.post('/view-events', authenticateJWT, storeArticleViewEvent)

export default router
