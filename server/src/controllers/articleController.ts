import { Request, Response } from 'express'
import { prisma } from '../../prisma/prisma'
import { errors, success, successWithOffset } from '../utils/response'

/**
 * 기사 목록을 페이지네이션과 함께 조회합니다.
 */
export const getArticles = async (req: Request, res: Response) => {
  const page = req.query.page ? parseInt(req.query.page as string, 10) : 1
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10

  try {
    const articles = await prisma.processedArticle.findMany({
      skip: (page - 1) * limit,
      take: limit,
      orderBy: {
        created_at: 'desc',
      },
    })

    const totalCount = await prisma.processedArticle.count()

    if (articles.length === 0) {
      return errors.notFound(res, 'No articles found')
    }

    return successWithOffset(res, articles, {
      page,
      limit,
      total: totalCount,
      message: 'Articles retrieved successfully',
    })
  } catch (error) {
    console.error(error)
    return errors.internal(res)
  }
}

/**
 * 특정 ID의 기사를 조회합니다.
 */
export const getArticleById = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10)

  try {
    const article = await prisma.processedArticle.findUnique({
      where: { id },
    })

    if (!article) {
      return errors.notFound(res)
    }

    return success(res, article, {
      message: 'Article retrieved successfully',
    })
  } catch (error) {
    console.error(error)
    return errors.internal(res)
  }
}
