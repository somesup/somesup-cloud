import {
  getArticleById,
  storeArticleViewEvent,
  addLikeToArticle,
  removeLikeFromArticle,
  scrapArticle,
  unscrapArticle,
  getArticles,
} from '../articleController'
import { ArticleNotFoundError, articleService } from '../../services/articleService'
import { successWithCursor, success, errors } from '../../utils/response'

jest.mock('../../services/articleService')
jest.mock('../../utils/response')

const mockSuccessWithCursor = successWithCursor as jest.Mock
const mockSuccess = success as jest.Mock
const mockInternalError = errors.internal as jest.Mock

describe('articleController', () => {
  let req: any
  let res: any
  let consoleErrorSpy: jest.SpyInstance

  beforeEach(() => {
    req = { query: {}, params: {} }
    res = { set: jest.fn() }
    mockSuccessWithCursor.mockReset()
    mockSuccess.mockReset()
    mockInternalError.mockReset()
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  describe('getArticles', () => {
    it('should return unauthorized if userId is missing', async () => {
      req.userId = null
      req.query = { limit: '10' }

      await getArticles(req, res)

      expect(errors.unauthorized).toHaveBeenCalledWith(res, 'User ID is required')
      expect(mockSuccessWithCursor).not.toHaveBeenCalled()
    })

    it('should return bad request if limit is not a number', async () => {
      req.userId = 1
      req.query = { limit: 'invalid' }

      await getArticles(req, res)

      expect(errors.badRequest).toHaveBeenCalledWith(res, 'Invalid limit. It must be a number between 1 and 100.')
      expect(mockSuccessWithCursor).not.toHaveBeenCalled()
    })

    it('should return bad request if limit is not provided', async () => {
      req.userId = 1
      req.query = {}

      await getArticles(req, res)

      expect(errors.badRequest).toHaveBeenCalledWith(res, 'Invalid limit. It must be a number between 1 and 100.')
      expect(mockSuccessWithCursor).not.toHaveBeenCalled()
    })

    it('should return bad request if limit is out of range', async () => {
      req.userId = 1
      req.query = { limit: '0' }

      await getArticles(req, res)

      expect(errors.badRequest).toHaveBeenCalledWith(res, 'Invalid limit. It must be a number between 1 and 100.')
      expect(mockSuccessWithCursor).not.toHaveBeenCalled()
    })

    it('should return scraped articles successfully', async () => {
      req.userId = 1
      req.query = { limit: '10', scraped: 'true' }

      const mockScrapedArticlesByCursor = {
        data: [{ id: 1, title: 'Scraped Article 1' }],
        hasNext: false,
        nextCursor: null,
      }

      ;(articleService.getScrapedArticlesByCursor as jest.Mock).mockResolvedValue(mockScrapedArticlesByCursor)

      await getArticles(req, res)

      expect(articleService.getScrapedArticlesByCursor).toHaveBeenCalledWith(1, 10, undefined)
      expect(mockSuccessWithCursor).toHaveBeenCalledWith(res, mockScrapedArticlesByCursor.data, {
        hasNext: mockScrapedArticlesByCursor.hasNext,
        nextCursor: mockScrapedArticlesByCursor.nextCursor,
        message: 'Articles retreived successfully',
      })
    })

    it('should return liked articles successfully', async () => {
      req.userId = 1
      req.query = { limit: '10', liked: 'true' }

      const mockLikedArticlesByCursor = {
        data: [{ id: 1, title: 'Liked Article 1' }],
        hasNext: false,
        nextCursor: null,
      }

      ;(articleService.getLikedArticlesByCursor as jest.Mock).mockResolvedValue(mockLikedArticlesByCursor)

      await getArticles(req, res)

      expect(articleService.getLikedArticlesByCursor).toHaveBeenCalledWith(1, 10, undefined)
      expect(mockSuccessWithCursor).toHaveBeenCalledWith(res, mockLikedArticlesByCursor.data, {
        hasNext: mockLikedArticlesByCursor.hasNext,
        nextCursor: mockLikedArticlesByCursor.nextCursor,
        message: 'Articles retreived successfully',
      })
    })

    it('should return recommended articles successfully with cache hit', async () => {
      req.userId = 1
      req.query = { limit: '10' }

      const mockCachedRecommendations = {
        articleIds: [1, 2, 3],
      }

      const mockArticlesByCursor = {
        data: [{ id: 1, title: 'Article 1' }],
        hasNext: false,
        nextCursor: null,
      }

      ;(articleService.getCachedRecommendations as jest.Mock).mockResolvedValue(mockCachedRecommendations)
      ;(articleService.getArticlesByCursor as jest.Mock).mockResolvedValue(mockArticlesByCursor)

      await getArticles(req, res)

      expect(articleService.getCachedRecommendations).toHaveBeenCalledWith(1)
      expect(articleService.getArticlesByCursor).toHaveBeenCalledWith(
        mockCachedRecommendations.articleIds,
        1,
        10,
        undefined,
      )
      expect(res.set).toHaveBeenCalledWith('X-Cache', 'HIT')
      expect(mockSuccessWithCursor).toHaveBeenCalledWith(res, mockArticlesByCursor.data, {
        hasNext: mockArticlesByCursor.hasNext,
        nextCursor: mockArticlesByCursor.nextCursor,
        message: 'Articles retreived successfully',
      })
    })

    it('should return recommended articles successfully with cache miss', async () => {
      req.userId = 1
      req.query = { limit: '10' }

      const mockNewRecommendations = {
        articleIds: [4, 5, 6],
      }

      const mockArticlesByCursor = {
        data: [{ id: 4, title: 'Article 4' }],
        hasNext: false,
        nextCursor: null,
      }

      ;(articleService.getCachedRecommendations as jest.Mock).mockResolvedValue(null)
      ;(articleService.regenerateUserCache as jest.Mock).mockResolvedValue(mockNewRecommendations)
      ;(articleService.getArticlesByCursor as jest.Mock).mockResolvedValue(mockArticlesByCursor)

      await getArticles(req, res)

      expect(articleService.getCachedRecommendations).toHaveBeenCalledWith(1)
      expect(articleService.regenerateUserCache).toHaveBeenCalledWith(1)
      expect(articleService.getArticlesByCursor).toHaveBeenCalledWith(
        mockNewRecommendations.articleIds,
        1,
        10,
        undefined,
      )
      expect(res.set).toHaveBeenCalledWith('X-Cache', 'MISS')
      expect(mockSuccessWithCursor).toHaveBeenCalledWith(res, mockArticlesByCursor.data, {
        hasNext: mockArticlesByCursor.hasNext,
        nextCursor: mockArticlesByCursor.nextCursor,
        message: 'Articles retreived successfully',
      })
    })

    it('should return highlight articles successfully', async () => {
      req.userId = 1
      req.query = { limit: '10', highlight: 'true' }

      const mockHighlightArticlesByCursor = {
        data: [{ id: 1, title: 'Article 1' }],
        hasNext: false,
        nextCursor: null,
      }

      ;(articleService.getHighlightArticlesByCursor as jest.Mock).mockResolvedValue(mockHighlightArticlesByCursor)

      await getArticles(req, res)

      expect(articleService.getHighlightArticlesByCursor).toHaveBeenCalledWith(1, 10, undefined)
      expect(mockSuccessWithCursor).toHaveBeenCalledWith(res, mockHighlightArticlesByCursor.data, {
        hasNext: mockHighlightArticlesByCursor.hasNext,
        nextCursor: mockHighlightArticlesByCursor.nextCursor,
        message: 'Articles retreived successfully',
      })
    })

    it('should return not found if no articles are found', async () => {
      req.userId = 1
      req.query = { limit: '10' }
      ;(articleService.getArticlesByCursor as jest.Mock).mockRejectedValue(
        new ArticleNotFoundError('No articles found'),
      )

      await getArticles(req, res)

      expect(mockSuccessWithCursor).not.toHaveBeenCalled()
      expect(errors.notFound).toHaveBeenCalledWith(res, 'No articles found')
    })

    it('should return internal error on service exception', async () => {
      req.userId = 1
      req.query = { limit: '10' }
      const error = new Error('Service error')
      ;(articleService.getArticlesByCursor as jest.Mock).mockRejectedValue(error)

      await getArticles(req, res)

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error retrieving articles:', error)
      expect(mockInternalError).toHaveBeenCalledWith(res)
      expect(mockSuccessWithCursor).not.toHaveBeenCalled()
    })
  })

  describe('getArticleById', () => {
    it('should get article and call success on success', async () => {
      req.userId = 1
      req.params.id = '42'
      const article = { id: 42, title: 'test' }
      ;(articleService.getDetailedArticleById as jest.Mock).mockResolvedValue(article)

      await getArticleById(req, res)

      expect(articleService.getDetailedArticleById).toHaveBeenCalledWith(42, 1)
      expect(mockSuccess).toHaveBeenCalledWith(res, article, {
        message: 'Article retrieved successfully',
      })
    })

    it('should return unauthorized if userId is missing', async () => {
      req.userId = null
      req.params.id = '42'

      await getArticleById(req, res)

      expect(errors.unauthorized).toHaveBeenCalledWith(res, 'User ID is required')
      expect(mockSuccess).not.toHaveBeenCalled()
    })

    it('should parse id as integer', async () => {
      req.userId = 1
      req.params.id = '3'
      const article = { id: 3 }
      ;(articleService.getDetailedArticleById as jest.Mock).mockResolvedValue(article)

      await getArticleById(req, res)

      expect(articleService.getDetailedArticleById).toHaveBeenCalledWith(3, 1)
      expect(mockSuccess).toHaveBeenCalled()
    })

    it('should respond with not found if article does not exist', async () => {
      req.userId = 1
      req.params.id = '100'
      ;(articleService.getDetailedArticleById as jest.Mock).mockRejectedValue(
        new ArticleNotFoundError('Article not found'),
      )

      await getArticleById(req, res)

      expect(mockSuccess).not.toHaveBeenCalled()
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error retrieving article:', expect.any(ArticleNotFoundError))
      expect(errors.notFound).toHaveBeenCalledWith(res, 'Article not found')
    })

    it('should respond with internal error on service exception', async () => {
      req.userId = 1
      req.params.id = '100'
      ;(articleService.getDetailedArticleById as jest.Mock).mockRejectedValue(new Error('err'))
      await getArticleById(req, res)
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error retrieving article:', expect.any(Error))
      expect(mockInternalError).toHaveBeenCalledWith(res)
      expect(mockSuccess).not.toHaveBeenCalled()
    })
  })

  describe('storeArticleViewEvent', () => {
    it('should store article view event and respond with success', async () => {
      req.userId = 1
      req.params.id = '123'
      req.body = { eventType: 'VIEW' }

      await storeArticleViewEvent(req as any, res as any)

      expect(articleService.storeArticleViewEvent).toHaveBeenCalledWith(1, 123, 'VIEW')
      expect(mockSuccess).toHaveBeenCalledWith(res, null, {
        message: 'Article view event stored successfully',
      })
    })

    it('should return unauthorized if userId is missing', async () => {
      req.userId = null
      req.params.id = '123'
      req.body = { eventType: 'VIEW' }

      await storeArticleViewEvent(req as any, res as any)

      expect(errors.unauthorized).toHaveBeenCalledWith(res, 'User ID is required')
      expect(mockSuccess).not.toHaveBeenCalled()
    })

    it('should return bad request if eventType is missing', async () => {
      req.userId = 1
      req.params.id = '123'
      req.body = {}

      await storeArticleViewEvent(req as any, res as any)

      expect(errors.badRequest).toHaveBeenCalledWith(res, 'eventType is required')
      expect(mockSuccess).not.toHaveBeenCalled()
    })

    it('should return bad request if eventType is invalid', async () => {
      req.userId = 1
      req.params.id = '123'
      req.body = { eventType: 'INVALID_EVENT' }

      await storeArticleViewEvent(req as any, res as any)

      expect(errors.badRequest).toHaveBeenCalledWith(res, 'Invalid eventType')
      expect(mockSuccess).not.toHaveBeenCalled()
    })

    it('should respond with internal error on service exception', async () => {
      req.userId = 1
      req.params.id = '123'
      req.body = { eventType: 'VIEW' }
      const error = new Error('Service error')
      ;(articleService.storeArticleViewEvent as jest.Mock).mockRejectedValue(error)

      await storeArticleViewEvent(req as any, res as any)

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error storing article view event:', error)
      expect(mockInternalError).toHaveBeenCalledWith(res)
      expect(mockSuccess).not.toHaveBeenCalled()
    })
  })

  describe('addLikeToArticle', () => {
    it('should add like to article and respond with success', async () => {
      req.userId = 1
      req.params.id = '42'
      ;(articleService.getArticleById as jest.Mock).mockResolvedValue({ id: 42 })

      await addLikeToArticle(req as any, res as any)

      expect(articleService.addLikeToArticle).toHaveBeenCalledWith(1, 42)
      expect(mockSuccess).toHaveBeenCalledWith(res, null, {
        message: 'Like added to article successfully',
      })
    })

    it('should return unauthorized if userId is missing', async () => {
      req.userId = null
      req.params.id = '42'
      ;(articleService.getArticleById as jest.Mock).mockResolvedValue({ id: 42 })

      await addLikeToArticle(req as any, res as any)

      expect(errors.unauthorized).toHaveBeenCalledWith(res, 'User ID is required')
      expect(mockSuccess).not.toHaveBeenCalled()
    })

    it('should return not found if article does not exist', async () => {
      req.userId = 1
      req.params.id = '42'
      ;(articleService.getArticleById as jest.Mock).mockRejectedValue(new ArticleNotFoundError('Article not found'))

      await addLikeToArticle(req as any, res as any)

      expect(mockSuccess).not.toHaveBeenCalled()
      expect(errors.notFound).toHaveBeenCalledWith(res, 'Article not found')
      expect(articleService.addLikeToArticle).not.toHaveBeenCalled()
    })

    it('should respond with internal error on service exception', async () => {
      req.userId = 1
      req.params.id = '42'
      ;(articleService.getArticleById as jest.Mock).mockResolvedValue({ id: 42 })

      const error = new Error('Service error')
      ;(articleService.addLikeToArticle as jest.Mock).mockRejectedValue(error)

      await addLikeToArticle(req as any, res as any)

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error adding like to article:', error)
      expect(mockInternalError).toHaveBeenCalledWith(res)
      expect(mockSuccess).not.toHaveBeenCalled()
    })
  })

  describe('removeLikeFromArticle', () => {
    it('should remove like from article and respond with success', async () => {
      req.userId = 1
      req.params.id = '42'
      ;(articleService.getArticleById as jest.Mock).mockResolvedValue({ id: 42 })

      await removeLikeFromArticle(req as any, res as any)

      expect(articleService.removeLikeFromArticle).toHaveBeenCalledWith(1, 42)
      expect(mockSuccess).toHaveBeenCalledWith(res, null, {
        message: 'Like removed from article successfully',
      })
    })

    it('should return unauthorized if userId is missing', async () => {
      req.userId = null
      req.params.id = '42'
      ;(articleService.getArticleById as jest.Mock).mockResolvedValue({ id: 42 })

      await removeLikeFromArticle(req as any, res as any)

      expect(errors.unauthorized).toHaveBeenCalledWith(res, 'User ID is required')
      expect(mockSuccess).not.toHaveBeenCalled()
    })

    it('should return not found if article does not exist', async () => {
      req.userId = 1
      req.params.id = '42'
      ;(articleService.getArticleById as jest.Mock).mockRejectedValue(new ArticleNotFoundError('Article not found'))

      await removeLikeFromArticle(req as any, res as any)

      expect(mockSuccess).not.toHaveBeenCalled()
      expect(errors.notFound).toHaveBeenCalledWith(res, 'Article not found')
      expect(articleService.removeLikeFromArticle).not.toHaveBeenCalled()
    })

    it('should respond with internal error on service exception', async () => {
      req.userId = 1
      req.params.id = '42'
      ;(articleService.getArticleById as jest.Mock).mockResolvedValue({ id: 42 })

      const error = new Error('Service error')
      ;(articleService.removeLikeFromArticle as jest.Mock).mockRejectedValue(error)

      await removeLikeFromArticle(req as any, res as any)

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error removing like from article:', error)
      expect(mockInternalError).toHaveBeenCalledWith(res)
      expect(mockSuccess).not.toHaveBeenCalled()
    })
  })

  describe('scrapArticle', () => {
    it('should scrap article and respond with success', async () => {
      req.userId = 1
      req.params.id = '42'
      ;(articleService.getArticleById as jest.Mock).mockResolvedValue({ id: 42 })

      await scrapArticle(req as any, res as any)

      expect(articleService.scrapArticle).toHaveBeenCalledWith(1, 42)
      expect(mockSuccess).toHaveBeenCalledWith(res, null, {
        message: 'Article scraped successfully',
      })
    })

    it('should return unauthorized if userId is missing', async () => {
      req.userId = null
      req.params.id = '42'
      ;(articleService.getArticleById as jest.Mock).mockResolvedValue({ id: 42 })

      await scrapArticle(req as any, res as any)

      expect(errors.unauthorized).toHaveBeenCalledWith(res, 'User ID is required')
      expect(mockSuccess).not.toHaveBeenCalled()
    })

    it('should return not found if article does not exist', async () => {
      req.userId = 1
      req.params.id = '42'
      ;(articleService.getArticleById as jest.Mock).mockRejectedValue(new ArticleNotFoundError('Article not found'))

      await scrapArticle(req as any, res as any)

      expect(mockSuccess).not.toHaveBeenCalled()
      expect(errors.notFound).toHaveBeenCalledWith(res, 'Article not found')
      expect(articleService.scrapArticle).not.toHaveBeenCalled()
    })

    it('should respond with internal error on service exception', async () => {
      req.userId = 1
      req.params.id = '42'
      ;(articleService.getArticleById as jest.Mock).mockResolvedValue({ id: 42 })

      const error = new Error('Service error')
      ;(articleService.scrapArticle as jest.Mock).mockRejectedValue(error)

      await scrapArticle(req as any, res as any)

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error scraping article:', error)
      expect(mockInternalError).toHaveBeenCalledWith(res)
      expect(mockSuccess).not.toHaveBeenCalled()
    })
  })

  describe('unscrapArticle', () => {
    it('should unscrap article and respond with success', async () => {
      req.userId = 1
      req.params.id = '42'
      ;(articleService.getArticleById as jest.Mock).mockResolvedValue({ id: 42 })

      await unscrapArticle(req as any, res as any)

      expect(articleService.unscrapArticle).toHaveBeenCalledWith(1, 42)
      expect(mockSuccess).toHaveBeenCalledWith(res, null, {
        message: 'Article unscraped successfully',
      })
    })

    it('should return unauthorized if userId is missing', async () => {
      req.userId = null
      req.params.id = '42'
      ;(articleService.getArticleById as jest.Mock).mockResolvedValue({ id: 42 })

      await unscrapArticle(req as any, res as any)

      expect(errors.unauthorized).toHaveBeenCalledWith(res, 'User ID is required')
      expect(mockSuccess).not.toHaveBeenCalled()
    })

    it('should return not found if article does not exist', async () => {
      req.userId = 1
      req.params.id = '42'
      ;(articleService.getArticleById as jest.Mock).mockRejectedValue(new ArticleNotFoundError('Article not found'))

      await unscrapArticle(req as any, res as any)

      expect(mockSuccess).not.toHaveBeenCalled()
      expect(errors.notFound).toHaveBeenCalledWith(res, 'Article not found')
      expect(articleService.unscrapArticle).not.toHaveBeenCalled()
    })

    it('should respond with internal error on service exception', async () => {
      req.userId = 1
      req.params.id = '42'
      ;(articleService.getArticleById as jest.Mock).mockResolvedValue({ id: 42 })

      const error = new Error('Service error')
      ;(articleService.unscrapArticle as jest.Mock).mockRejectedValue(error)

      await unscrapArticle(req as any, res as any)

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error unscraping article:', error)
      expect(mockInternalError).toHaveBeenCalledWith(res)
      expect(mockSuccess).not.toHaveBeenCalled()
    })
  })
})
