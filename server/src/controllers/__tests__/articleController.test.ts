import { getArticles, getArticleById } from '../articleController'
import { articleService } from '../../services/articleService'
import { successWithCursor, success, errors } from '../../utils/response'

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

    it('should respond with internal error on service exception', async () => {
      req.params.id = '100'
      ;(articleService.getArticleById as jest.Mock).mockRejectedValue(new Error('err'))
      await getArticleById(req, res)
      expect(mockInternalError).toHaveBeenCalledWith(res)
      expect(mockSuccess).not.toHaveBeenCalled()
    })
  })
})
