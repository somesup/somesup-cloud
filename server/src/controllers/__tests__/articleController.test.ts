import { getArticles, getArticleById, storeArticleViewEvent } from '../articleController'
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
    res = {}
    mockSuccessWithCursor.mockReset()
    mockSuccess.mockReset()
    mockInternalError.mockReset()
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  describe('getArticles', () => {
    it('should call service and respond with successWithCursor on success', async () => {
      req.query.limit = '20'
      req.query.cursor = 'abc'
      const mockResult = {
        data: [{ id: 1, title: 'news' }],
        hasNext: true,
        nextCursor: 'zzz',
      }
      ;(articleService.getArticlesByCursor as jest.Mock).mockResolvedValue(mockResult)

      await getArticles(req as any, res as any)

      expect(articleService.getArticlesByCursor).toHaveBeenCalledWith(20, 'abc')
      expect(mockSuccessWithCursor).toHaveBeenCalledWith(res, mockResult.data, { hasNext: true, nextCursor: 'zzz' })
    })

    it('should use fallback limit 10 if not specified in query', async () => {
      // req.query.limit not set
      req.query.cursor = undefined
      const mockResult = {
        data: [{ id: 1 }],
        hasNext: false,
        nextCursor: undefined,
      }
      ;(articleService.getArticlesByCursor as jest.Mock).mockResolvedValue(mockResult)

      await getArticles(req, res)

      expect(articleService.getArticlesByCursor).toHaveBeenCalledWith(10, undefined)
      expect(mockSuccessWithCursor).toHaveBeenCalledWith(res, mockResult.data, {
        hasNext: false,
        nextCursor: undefined,
      })
    })

    it('should respond with internal error on service exception', async () => {
      req.query.limit = '10'
      req.query.cursor = 'fail'
      const error = new Error('fail')
      ;(articleService.getArticlesByCursor as jest.Mock).mockRejectedValue(error)

      await getArticles(req, res)

      expect(articleService.getArticlesByCursor).toHaveBeenCalled()
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error fetching articles:', error)
      expect(mockInternalError).toHaveBeenCalledWith(res)
      expect(mockSuccessWithCursor).not.toHaveBeenCalled()
    })
  })

  describe('getArticleById', () => {
    it('should get article and call success on success', async () => {
      req.params.id = '42'
      const article = { id: 42, title: 'test' }
      ;(articleService.getArticleById as jest.Mock).mockResolvedValue(article)

      await getArticleById(req, res)

      expect(articleService.getArticleById).toHaveBeenCalledWith(42)
      expect(mockSuccess).toHaveBeenCalledWith(res, article, {
        message: 'Article retrieved successfully',
      })
    })

    it('should parse id as integer', async () => {
      req.params.id = '3'
      const article = { id: 3 }
      ;(articleService.getArticleById as jest.Mock).mockResolvedValue(article)

      await getArticleById(req, res)

      expect(articleService.getArticleById).toHaveBeenCalledWith(3)
      expect(mockSuccess).toHaveBeenCalled()
    })

    it('should respond with not found if article does not exist', async () => {
      req.params.id = '100'
      ;(articleService.getArticleById as jest.Mock).mockRejectedValue(new ArticleNotFoundError('Article not found'))

      await getArticleById(req, res)

      expect(mockSuccess).not.toHaveBeenCalled()
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error retrieving article:', expect.any(ArticleNotFoundError))
      expect(errors.notFound).toHaveBeenCalledWith(res, 'Article not found')
    })

    it('should respond with internal error on service exception', async () => {
      req.params.id = '100'
      ;(articleService.getArticleById as jest.Mock).mockRejectedValue(new Error('err'))
      await getArticleById(req, res)
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error retrieving article:', expect.any(Error))
      expect(mockInternalError).toHaveBeenCalledWith(res)
      expect(mockSuccess).not.toHaveBeenCalled()
    })
  })

  describe('storeArticleViewEvent', () => {
    it('should store article view event and respond with success', async () => {
      req.userId = 1
      req.body = { articleId: 123, eventType: 'VIEW' }

      await storeArticleViewEvent(req as any, res as any)

      expect(articleService.storeArticleViewEvent).toHaveBeenCalledWith(1, 123, 'VIEW')
      expect(mockSuccess).toHaveBeenCalledWith(res, null, {
        message: 'Article view event stored successfully',
      })
    })

    it('should return unauthorized if userId is missing', async () => {
      req.userId = null
      req.body = { articleId: 123, eventType: 'VIEW' }

      await storeArticleViewEvent(req as any, res as any)

      expect(errors.unauthorized).toHaveBeenCalledWith(res, 'User ID is required')
      expect(mockSuccess).not.toHaveBeenCalled()
    })

    it('should return bad request if articleId or eventType is missing', async () => {
      req.userId = 1
      req.body = { articleId: null, eventType: 'VIEW' }

      await storeArticleViewEvent(req as any, res as any)

      expect(errors.badRequest).toHaveBeenCalledWith(res, 'articleId and eventType are required')
      expect(mockSuccess).not.toHaveBeenCalled()
    })

    it('should return bad request if eventType is invalid', async () => {
      req.userId = 1
      req.body = { articleId: 123, eventType: 'INVALID_EVENT' }

      await storeArticleViewEvent(req as any, res as any)

      expect(errors.badRequest).toHaveBeenCalledWith(res, 'Invalid eventType')
      expect(mockSuccess).not.toHaveBeenCalled()
    })

    it('should respond with internal error on service exception', async () => {
      req.userId = 1
      req.body = { articleId: 123, eventType: 'VIEW' }
      const error = new Error('Service error')
      ;(articleService.storeArticleViewEvent as jest.Mock).mockRejectedValue(error)

      await storeArticleViewEvent(req as any, res as any)

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error storing article view event:', error)
      expect(mockInternalError).toHaveBeenCalledWith(res)
      expect(mockSuccess).not.toHaveBeenCalled()
    })
  })
})
