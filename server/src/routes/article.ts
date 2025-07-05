import { Router } from 'express'
import { prisma } from '../../prisma/prisma'

const router = Router()

/**
 * 기사 목록을 페이지네이션과 함께 조회합니다.
 * @route GET /
 * @param {string} [req.query.page] - 페이지 번호 (기본값: 1)
 * @param {string} [req.query.limit] - 페이지당 항목 수 (기본값: 10)
 * @returns {Promise<void>} 기사 목록과 페이지네이션 정보를 JSON 형태로 반환
 * @example
 * // GET /?page=1&limit=10
 * // 응답: { articles: [...], pagination: { page: 1, limit: 10, total: 100 } }
 */
router.get('/', async (req, res) => {
  const page = req.query.page ? parseInt(req.query.page as string) : 1
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 10

  console.log(`Fetching articles for page ${page} with limit ${limit}`)

  const articles = await prisma.processedArticle.findMany({
    skip: (page - 1) * limit,
    take: limit,
    orderBy: {
      created_at: 'desc',
    },
  })

  const totalCount = await prisma.processedArticle.count()

  if (articles.length === 0) {
    return res.status(404).json({ error: 'No articles found' })
  }

  res.json({
    articles,
    pagination: {
      page: page,
      limit: limit,
      total: totalCount,
    },
  })
})

/**
 * 특정 ID의 기사를 조회합니다.
 * @route GET /:id
 * @param {string} req.params.id - 조회할 기사의 ID
 * @returns {Promise<void>} 기사 정보를 JSON 형태로 반환
 * @example
 * // GET /123
 * // 성공 응답: { id: 123, title: "기사 제목", content: "기사 내용", ... }
 * // 실패 응답: { error: "Article not found" }
 */
router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id)

  console.log(`Fetching article with ID ${id}`)

  const article = await prisma.processedArticle.findUnique({
    where: { id: id },
  })

  if (!article) {
    return res.status(404).json({ error: 'Article not found' })
  }

  res.json(article)
})

export default router
