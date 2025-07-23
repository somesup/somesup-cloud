import { getArticles, getArticleById, recordViewEvent } from '../articleController'
import { ArticleNotFoundError, articleService } from '../../services/articleService'
import { successWithCursor, success, errors } from '../../utils/response'
import { ViewEventType } from '@prisma/client'

jest.mock('../../services/articleService')
jest.mock('../../utils/response')

const mockSuccessWithCursor = successWithCursor as jest.Mock
const mockSuccess = success as jest.Mock
const mockInternalError = errors.internal as jest.Mock

describe('articleController', () => {
  let req: any
  let res: any

  beforeEach(() => {
    req = { query: {}, params: {} }
    res = {}
    mockSuccessWithCursor.mockReset()
    mockSuccess.mockReset()
    mockInternalError.mockReset()
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

    it('should respond with notFound error on ArticleNotFoundError exception', async () => {
      req.params.id = '100'
      const articleNotFoundError = new ArticleNotFoundError('Article not found')
      ;(articleService.getArticleById as jest.Mock).mockRejectedValue(articleNotFoundError)

      await getArticleById(req, res)

      expect(errors.notFound).toHaveBeenCalledWith(res, 'Article not found')
      expect(errors.internal).not.toHaveBeenCalled()
    })

    it('should respond with internal error on service exception', async () => {
      req.params.id = '100'
      ;(articleService.getArticleById as jest.Mock).mockRejectedValue(new Error('err'))
      await getArticleById(req, res)
      expect(mockInternalError).toHaveBeenCalledWith(res)
      expect(mockSuccess).not.toHaveBeenCalled()
    })
  })

  describe('recordViewEvent', () => {
    it('should return unauthorized if user is not authenticated', async () => {
      req.userId = undefined
      req.body = { pArticleId: 1, eventType: ViewEventType.impression }

      await recordViewEvent(req, res)

      expect(errors.unauthorized).toHaveBeenCalledWith(res, 'User ID is required')
    })

    it('should return bad request if pArticleId or eventType is missing', async () => {
      req.userId = 1
      req.body = {}

      await recordViewEvent(req, res)

      expect(errors.badRequest).toHaveBeenCalledWith(res, 'pArticleId and eventType are required')
    })

    it('should return bad request if eventType is invalid', async () => {
      req.userId = 1
      req.body = { pArticleId: 1, eventType: 'wrong_event_type' }

      await recordViewEvent(req, res)

      expect(errors.badRequest).toHaveBeenCalledWith(res, 'Invalid event type')
    })

    it('should call service and response success on valid input', async () => {
      req.userId = 123
      req.body = { pArticleId: 456, eventType: ViewEventType.detail }
      ;(articleService.recordViewEvent as jest.Mock).mockResolvedValue(undefined)

      await recordViewEvent(req, res)

      expect(articleService.recordViewEvent).toHaveBeenCalledWith(123, 456, ViewEventType.detail)
      expect(success).toHaveBeenCalledWith(res, null, { message: 'View event recorded successfully' })
    })

    it('should return internal error if service throws', async () => {
      req.userId = 123
      req.body = { pArticleId: 456, eventType: ViewEventType.detail }

      const error = new Error('service error')
      ;(articleService.recordViewEvent as jest.Mock).mockRejectedValue(error)

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      await recordViewEvent(req, res)

      expect(articleService.recordViewEvent).toHaveBeenCalledWith(123, 456, ViewEventType.detail)
      expect(errors.internal).toHaveBeenCalledWith(res)
      expect(consoleSpy).toHaveBeenCalledWith('Failed to record view event:', error)

      consoleSpy.mockRestore()
    })
  })
})
