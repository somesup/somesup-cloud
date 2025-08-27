import { Response } from 'express'
import { errors, success, successWithCursor } from '../utils/response'
import { ArticleNotFoundError, articleService } from '../services/articleService'
import { AuthenticatedRequest } from '../middlewares/authenticateJWT'
import { ArticleViewEventType } from '@prisma/client'

/**
 * 사용자가 추천된 기사를 조회하는 컨트롤러입니다.
 * 사용자가 인증된 상태에서 추천된 기사를 조회할 수 있습니다.
 * @param {AuthenticatedRequest} req - 인증된 사용자 요청 객체. userId와 쿼리 파라미터가 포함되어야 합니다.
 * @param {Response} res - Express 응답 객체.
 * @example
 * // 요청 예시
 * GET /api/articles?limit=10&cursor=abc123&scraped=false&liked=false
 */
export const getArticles = async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId
  if (!userId) {
    return errors.unauthorized(res, 'User ID is required')
  }

  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined
  const cursor = req.query.cursor as string | undefined
  const scrapped: boolean = req.query.scraped === 'true'
  const liked: boolean = req.query.liked === 'true'
  const highlight: boolean = req.query.highlight === 'true'

  if (!limit || limit < 1 || limit > 100) {
    return errors.badRequest(res, 'Invalid limit. It must be a number between 1 and 100.')
  }

  try {
    let result
    if (scrapped) {
      result = await articleService.getScrapedArticlesByCursor(userId, limit, cursor)
    } else if (liked) {
      result = await articleService.getLikedArticlesByCursor(userId, limit, cursor)
    } else if (highlight) {
      result = await articleService.getHighlightArticlesByCursor(userId, limit, cursor)
    } else {
      // 추천 기사 조회, 캐시 사용
      const cachedRecommendations = await articleService.getCachedRecommendations(userId)
      if (cachedRecommendations) {
        // 캐시된 추천 기사가 있으면 이를 사용
        result = await articleService.getArticlesByCursor(cachedRecommendations.articleIds, userId, limit, cursor)
        res.set('X-Cache', 'HIT')
      } else {
        // 캐시된 추천 기사가 없으면 새로 생성
        const newRecommendations = await articleService.regenerateUserCache(userId)
        result = await articleService.getArticlesByCursor(newRecommendations.articleIds, userId, limit, cursor)
        res.set('X-Cache', 'MISS')
      }
    }

    return successWithCursor(res, result.data, {
      hasNext: result.hasNext,
      nextCursor: result.nextCursor,
      message: 'Articles retreived successfully',
    })
  } catch (error) {
    if (error instanceof ArticleNotFoundError) {
      return errors.notFound(res, 'No articles found')
    }
    console.error('Error retrieving articles:', error)
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
export const getArticleById = async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId
  if (!userId) {
    return errors.unauthorized(res, 'User ID is required')
  }

  const articleId = parseInt(req.params.id, 10)

  try {
    const article = await articleService.getDetailedArticleById(articleId, userId)
    return success(res, article, {
      message: 'Article retrieved successfully',
    })
  } catch (error) {
    console.error('Error retrieving article:', error)
    if (error instanceof ArticleNotFoundError) {
      return errors.notFound(res, 'Article not found')
    }
    return errors.internal(res)
  }
}

/**
 * 기사 조회 이벤트를 저장하는 컨트롤러입니다.
 * 사용자가 특정 기사를 조회할 때 발생하는 이벤트를 저장합니다.
 * @param {AuthenticatedRequest} req - 인증된 사용자 요청 객체.
 * @param {Response} res - Express 응답 객체.
 * @example
 * // 요청 예시
 * POST /api/articles/view-events
 * {
 *  "articleId": 1,
 *  "eventType": "VIEW"
 *  }
 */
export const storeArticleViewEvent = async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId
  if (!userId) {
    return errors.unauthorized(res, 'User ID is required')
  }

  const articleId = parseInt(req.params.id, 10)

  const { eventType } = req.body
  if (!eventType) {
    return errors.badRequest(res, 'eventType is required')
  }

  if (!Object.values(ArticleViewEventType).includes(eventType)) {
    return errors.badRequest(res, 'Invalid eventType')
  }

  try {
    await articleService.storeArticleViewEvent(userId, articleId, eventType)
    return success(res, null, {
      message: 'Article view event stored successfully',
    })
  } catch (error) {
    console.error('Error storing article view event:', error)
    return errors.internal(res)
  }
}

/**
 * 특정 기사에 사용자가 좋아요를 추가하는 컨트롤러입니다.
 * 사용자가 인증된 상태에서 특정 기사에 좋아요를 추가할 수 있습니다.
 * @param {AuthenticatedRequest} req - 인증된 사용자 요청 객체. userId와 body에 articleId가 포함되어야 합니다.
 * @param {Response} res - Express 응답 객체.
 * @example
 * // 요청 예시
 * POST /api/articles/:id/like
 */
export const addLikeToArticle = async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId
  if (!userId) {
    return errors.unauthorized(res, 'User ID is required')
  }

  const articleId = parseInt(req.params.id, 10)

  try {
    const article = await articleService.getArticleById(articleId)
    await articleService.addLikeToArticle(userId, article.id)
    return success(res, null, {
      message: 'Like added to article successfully',
    })
  } catch (error) {
    if (error instanceof ArticleNotFoundError) {
      return errors.notFound(res, 'Article not found')
    }
    console.error('Error adding like to article:', error)
    return errors.internal(res)
  }
}

/**
 * 특정 기사에 사용자가 좋아요를 제거하는 컨트롤러입니다.
 * 사용자가 인증된 상태에서 특정 기사에 좋아요를 제거할 수 있습니다.
 * @param {AuthenticatedRequest} req - 인증된 사용자 요청 객체. userId와 body에 articleId가 포함되어야 합니다.
 * @param {Response} res - Express 응답 객체.
 * @example
 * // 요청 예시
 * DELETE /api/articles/:id/like
 */
export const removeLikeFromArticle = async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId
  if (!userId) {
    return errors.unauthorized(res, 'User ID is required')
  }

  const articleId = parseInt(req.params.id, 10)

  try {
    const article = await articleService.getArticleById(articleId)
    await articleService.removeLikeFromArticle(userId, article.id)
    return success(res, null, {
      message: 'Like removed from article successfully',
    })
  } catch (error) {
    if (error instanceof ArticleNotFoundError) {
      return errors.notFound(res, 'Article not found')
    }
    console.error('Error removing like from article:', error)
    return errors.internal(res)
  }
}

/**
 * 특정 기사를 스크랩하는 컨트롤러입니다.
 * 사용자가 인증된 상태에서 특정 기사를 스크랩할 수 있습니다.
 * @param {AuthenticatedRequest} req - 인증된 사용자 요청 객체. userId와 body에 articleId가 포함되어야 합니다.
 * @param {Response} res - Express 응답 객체.
 * @example
 * // 요청 예시
 * POST /api/articles/:id/scrap
 */
export const scrapArticle = async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId
  if (!userId) {
    return errors.unauthorized(res, 'User ID is required')
  }

  const articleId = parseInt(req.params.id, 10)

  try {
    const article = await articleService.getArticleById(articleId)
    await articleService.scrapArticle(userId, article.id)
    return success(res, null, {
      message: 'Article scraped successfully',
    })
  } catch (error) {
    if (error instanceof ArticleNotFoundError) {
      return errors.notFound(res, 'Article not found')
    }
    console.error('Error scraping article:', error)
    return errors.internal(res)
  }
}

/**
 * 특정 기사에 대한 사용자의 스크랩을 제거하는 컨트롤러입니다.
 * 사용자가 인증된 상태에서 특정 기사에 대한 스크랩을 제거할 수 있습니다
 * @param {AuthenticatedRequest} req - 인증된 사용자 요청 객체. userId와 body에 articleId가 포함되어야 합니다.
 * @param {Response} res - Express 응답 객체.
 * @example
 * // 요청 예시
 * DELETE /api/articles/:id/scrap
 */
export const unscrapArticle = async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId
  if (!userId) {
    return errors.unauthorized(res, 'User ID is required')
  }

  const articleId = parseInt(req.params.id, 10)

  try {
    const article = await articleService.getArticleById(articleId)
    await articleService.unscrapArticle(userId, article.id)
    return success(res, null, {
      message: 'Article unscraped successfully',
    })
  } catch (error) {
    if (error instanceof ArticleNotFoundError) {
      return errors.notFound(res, 'Article not found')
    }
    console.error('Error unscraping article:', error)
    return errors.internal(res)
  }
}
