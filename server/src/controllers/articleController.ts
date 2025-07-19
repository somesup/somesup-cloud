import { Request, Response } from 'express'
import { errors, success, successWithCursor } from '../utils/response'
import { ArticleCursorPaginationResult, ArticleNotFoundError, articleService } from '../services/articleService'

/**
 * Cursor 기반 페이지네이션을 사용하여 기사 목록을 가져오는 컨트롤러입니다.
 * 사용자가 요청한 limit와 cursor를 기반으로 기사를 조회합니다.
 * @param {Request} req - Express 요청 객체. 쿼리 파라미터로 limit와 cursor가 포함되어야 합니다.
 * @param {Response} res - Express 응답 객체.
 * @example
 * // 요청 예시
 * GET /api/articles?limit=10&cursor=eyJjcmVhdGVkQXQiOiIyMDIzLTA5LTIxVDEyOjAwOjAwLjAwMFoiLCJpZCI6MX0=
 * * // 응답 예시
 * {
 *  "data": [
 *    {
 *    "id": 1,
 *    ...나머지 기사 데이터...
 *    }
 *  ],
 *  "pagination": {
 *    "hasNext": true,
 *    "nextCursor": "eyJjcmVhdGVkQXQiOiIyMDIzLTA5LTIxVDEyOjAwOjAwLjAwMFoiLCJpZCI6Mn0="
 *  }
 * }
 */
export const getArticles = async (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10
  const cursor = req.query.cursor as string

  try {
    const { data, hasNext, nextCursor }: ArticleCursorPaginationResult = await articleService.getArticlesByCursor(
      limit,
      cursor,
    )
    return successWithCursor(res, data, {
      hasNext: hasNext,
      nextCursor: nextCursor,
    })
  } catch (error) {
    console.error('Error fetching articles:', error)
    return errors.internal(res)
  }
}

/**
 * 특정 ID의 기사를 조회하는 컨트롤러입니다.
 * 사용자가 요청한 ID에 해당하는 기사를 데이터베이스에서 조회합니다.
 * @param {Request} req - Express 요청 객체. URL 파라미터로 id가 포함되어야 합니다.
 * @param {Response} res - Express 응답 객체.
 * @example
 * // 요청 예시
 * GET /api/articles/1
 * // 응답 예시
 * {
 *   "data": {
 *     "id": 1,
 *     ...나머지 기사 데이터...
 *   }
 * }
 */
export const getArticleById = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10)

  try {
    const article = await articleService.getArticleById(id)
    return success(res, article, {
      message: 'Article retrieved successfully',
    })
  } catch (error) {
    if (error instanceof ArticleNotFoundError) {
      return errors.notFound(res, 'Article not found')
    }
    return errors.internal(res)
  }
}
