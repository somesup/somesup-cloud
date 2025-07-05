import { Router } from 'express'
import { getArticles, getArticleById } from '../controllers/articleController'

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

export default router
