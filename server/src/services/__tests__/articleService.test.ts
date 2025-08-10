import { ProcessedArticle } from '@prisma/client'
import { prismaMock } from '../../../prisma/mock'
import { articleService, ArticleNotFoundError } from '../articleService'
import { createCursor, decodeCursor } from '../../utils/cursor'
import dayjs from 'dayjs'

jest.mock('../../utils/cursor', () => ({
  createCursor: jest.fn(),
  decodeCursor: jest.fn(),
}))

const mockCreateCursor = createCursor as jest.MockedFunction<typeof createCursor>
const mockDecodeCursor = decodeCursor as jest.MockedFunction<typeof decodeCursor>

describe('ArticleService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getArticlesByCursor', () => {
    const mockArticle1: ProcessedArticle = {
      id: 1,
      title: 'Test Article 1',
      one_line_summary: 'Summary 1',
      full_summary: 'Full summary 1',
      language: 'ko',
      region: 'KR',
      section: 'tech',
      created_at: new Date('2025-07-17T00:00:00Z'),
    }

    const mockArticle2: ProcessedArticle = {
      id: 2,
      title: 'Test Article 2',
      one_line_summary: 'Summary 2',
      full_summary: 'Full summary 2',
      language: 'en',
      region: 'US',
      section: 'business',
      created_at: new Date('2025-07-18T00:00:00Z'),
    }

    const mockArticle3: ProcessedArticle = {
      id: 3,
      full_summary: 'Full summary 3',
      language: 'ko',
      region: null,
      section: null,
      created_at: new Date('2025-07-19T00:00:00Z'),
    }

    describe('When cursor is NOT provided', () => {
      it('Fetches articles from the last 24 hours and there is a next page', async () => {
        const limit = 2
        const mockArticles = [mockArticle1, mockArticle2, mockArticle3]

        prismaMock.processedArticle.findMany.mockResolvedValue(mockArticles)
        mockCreateCursor.mockReturnValue('next-cursor')

        const result = await articleService.getArticlesByCursor(limit)

        expect(prismaMock.processedArticle.findMany).toHaveBeenCalledWith({
          where: {
            OR: [
              { created_at: { gt: expect.any(Date) } },
              { created_at: expect.any(Date), id: { gt: Number.MIN_SAFE_INTEGER } },
            ],
          },
          orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
          take: limit + 1,
        })

        // Check if the date is from 24 hours ago
        // const calledArgs = prismaMock.processedArticle.findMany.mock.calls[0][0]
        // const expectedDate = dayjs().subtract(24, 'hour')
        // const actualDate = dayjs(calledArgs.where.OR[0].created_at.gt)
        // expect(Math.abs(expectedDate.diff(actualDate, 'minute'))).toBeLessThan(1)

        expect(mockCreateCursor).toHaveBeenCalledWith(mockArticle2.created_at, mockArticle2.id)
        expect(result).toEqual({
          data: [mockArticle1, mockArticle2],
          hasNext: true,
          nextCursor: 'next-cursor',
        })
      })

      it('Fetches from the last 24 hours and there is no next page', async () => {
        const limit = 3
        const mockArticles = [mockArticle1, mockArticle2]

        prismaMock.processedArticle.findMany.mockResolvedValue(mockArticles)

        const result = await articleService.getArticlesByCursor(limit)

        expect(result).toEqual({
          data: [mockArticle1, mockArticle2],
          hasNext: false,
          nextCursor: undefined,
        })
        expect(mockCreateCursor).not.toHaveBeenCalled()
      })

      it('Returns empty result set', async () => {
        const limit = 2

        prismaMock.processedArticle.findMany.mockResolvedValue([])

        const result = await articleService.getArticlesByCursor(limit)

        expect(result).toEqual({
          data: [],
          hasNext: false,
          nextCursor: undefined,
        })
        expect(mockCreateCursor).not.toHaveBeenCalled()
      })
    })

    describe('When cursor is provided', () => {
      const mockCursor = 'test-cursor'
      const decodedCursor = {
        createdAt: new Date('2024-01-01T12:00:00Z'),
        id: 5,
      }

      beforeEach(() => {
        mockDecodeCursor.mockReturnValue(decodedCursor)
      })

      it('Decodes the cursor, fetches with the correct condition, and there is a next page', async () => {
        const limit = 2
        const mockArticles = [mockArticle1, mockArticle2, mockArticle3]

        prismaMock.processedArticle.findMany.mockResolvedValue(mockArticles)
        mockCreateCursor.mockReturnValue('next-cursor')

        const result = await articleService.getArticlesByCursor(limit, mockCursor)

        expect(mockDecodeCursor).toHaveBeenCalledWith(mockCursor)
        expect(prismaMock.processedArticle.findMany).toHaveBeenCalledWith({
          where: {
            OR: [
              { created_at: { gt: decodedCursor.createdAt } },
              { created_at: decodedCursor.createdAt, id: { gt: decodedCursor.id } },
            ],
          },
          orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
          take: limit + 1,
        })

        expect(mockCreateCursor).toHaveBeenCalledWith(mockArticle2.created_at, mockArticle2.id)
        expect(result).toEqual({
          data: [mockArticle1, mockArticle2],
          hasNext: true,
          nextCursor: 'next-cursor',
        })
      })

      it('Decodes the cursor, fetches, and there is no next page', async () => {
        const limit = 3
        const mockArticles = [mockArticle1, mockArticle2]

        prismaMock.processedArticle.findMany.mockResolvedValue(mockArticles)

        const result = await articleService.getArticlesByCursor(limit, mockCursor)

        expect(mockDecodeCursor).toHaveBeenCalledWith(mockCursor)
        expect(result).toEqual({
          data: [mockArticle1, mockArticle2],
          hasNext: false,
          nextCursor: undefined,
        })
        expect(mockCreateCursor).not.toHaveBeenCalled()
      })

      it('Returns exactly the limit number of articles and there is no next page', async () => {
        const limit = 2
        const mockArticles = [mockArticle1, mockArticle2]

        prismaMock.processedArticle.findMany.mockResolvedValue(mockArticles)

        const result = await articleService.getArticlesByCursor(limit, mockCursor)

        expect(result).toEqual({
          data: [mockArticle1, mockArticle2],
          hasNext: false,
          nextCursor: undefined,
        })
        expect(mockCreateCursor).not.toHaveBeenCalled()
      })
    })

    describe('Exception cases', () => {
      it('Throws error when Prisma returns an error', async () => {
        const error = new Error('Database connection failed')
        prismaMock.processedArticle.findMany.mockRejectedValue(error)

        await expect(articleService.getArticlesByCursor(10)).rejects.toThrow('Database connection failed')
      })

      it('Throws error when cursor decoding fails', async () => {
        const invalidCursor = 'invalid-cursor'
        const decodingError = new Error('Invalid cursor format')

        mockDecodeCursor.mockImplementation(() => {
          throw decodingError
        })

        await expect(articleService.getArticlesByCursor(10, invalidCursor)).rejects.toThrow('Invalid cursor format')

        expect(mockDecodeCursor).toHaveBeenCalledWith(invalidCursor)
        expect(prismaMock.processedArticle.findMany).not.toHaveBeenCalled()
      })

      it('Throws error when createCursor throws', async () => {
        const limit = 2
        const mockArticles = [mockArticle1, mockArticle2, mockArticle3]

        prismaMock.processedArticle.findMany.mockResolvedValue(mockArticles)
        mockCreateCursor.mockImplementation(() => {
          throw new Error('Cursor creation failed')
        })

        await expect(articleService.getArticlesByCursor(limit)).rejects.toThrow('Cursor creation failed')
      })
    })
  })

  describe('getArticleById', () => {
    const mockArticle: ProcessedArticle = {
      id: 1,
      title: 'Test Article',
      one_line_summary: 'Test summary',
      full_summary: 'Test full summary',
      language: 'ko',
      region: 'KR',
      section: 'tech',
      created_at: new Date('2024-01-01T00:00:00Z'),
    }

    it('Successfully fetches an article with an existing ID', async () => {
      const articleId = 1
      prismaMock.processedArticle.findUnique.mockResolvedValue(mockArticle)

      const result = await articleService.getArticleById(articleId)

      expect(prismaMock.processedArticle.findUnique).toHaveBeenCalledWith({
        where: { id: articleId },
      })
      expect(result).toEqual(mockArticle)
    })

    it('Throws ArticleNotFoundError when querying with a non-existing ID', async () => {
      const articleId = 999
      prismaMock.processedArticle.findUnique.mockResolvedValue(null)

      await expect(articleService.getArticleById(articleId)).rejects.toThrow(ArticleNotFoundError)

      await expect(articleService.getArticleById(articleId)).rejects.toThrow(`Article with ID ${articleId} not found`)

      expect(prismaMock.processedArticle.findUnique).toHaveBeenCalledWith({
        where: { id: articleId },
      })
    })

    it('Throws error when Prisma returns an error', async () => {
      const articleId = 1
      const error = new Error('Database connection failed')
      prismaMock.processedArticle.findUnique.mockRejectedValue(error)

      await expect(articleService.getArticleById(articleId)).rejects.toThrow('Database connection failed')
    })

    it('Checks that method is called properly for a range of IDs', async () => {
      const testIds = [0, 1, 100, 999999]

      prismaMock.processedArticle.findUnique.mockResolvedValue(mockArticle)

      for (const id of testIds) {
        await articleService.getArticleById(id)
        expect(prismaMock.processedArticle.findUnique).toHaveBeenCalledWith({
          where: { id },
        })
      }

      expect(prismaMock.processedArticle.findUnique).toHaveBeenCalledTimes(testIds.length)
    })
  })

  describe('storeArticleViewEvent', () => {
    it('Successfully stores an article view event', async () => {
      const userId = 1
      const articleId = 2
      const eventType = 'VIEW'

      await articleService.storeArticleViewEvent(userId, articleId, eventType)

      expect(prismaMock.articleViewEvent.create).toHaveBeenCalledWith({
        data: {
          user_id: userId,
          p_article_id: articleId,
          event_type: eventType,
        },
      })
    })
  })

  describe('ArticleNotFoundError', () => {
    it('Should have correct name and message', () => {
      const message = 'Test error message'
      const error = new ArticleNotFoundError(message)

      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(ArticleNotFoundError)
      expect(error.name).toBe('ArticleNotFoundError')
      expect(error.message).toBe(message)
    })

    it('Should be distinguishable from other Error instances', () => {
      const articleError = new ArticleNotFoundError('Article not found')
      const genericError = new Error('Generic error')

      expect(articleError).not.toEqual(genericError)
      expect(articleError.name).not.toBe(genericError.name)
    })
  })

  describe('addLikeToArticle', () => {
    it('Successfully adds a like to an article', async () => {
      const userId = 1
      const articleId = 2

      await articleService.addLikeToArticle(userId, articleId)

      expect(prismaMock.like.create).toHaveBeenCalledWith({
        data: {
          user_id: userId,
          p_article_id: articleId,
        },
      })
    })

    it('Throws error when Prisma returns an error', async () => {
      const userId = 1
      const articleId = 2
      const error = new Error('Database connection failed')
      prismaMock.like.create.mockRejectedValue(error)

      await expect(articleService.addLikeToArticle(userId, articleId)).rejects.toThrow('Database connection failed')
    })
  })

  describe('removeLikeFromArticle', () => {
    it('Successfully removes a like from an article', async () => {
      const userId = 1
      const articleId = 2

      await articleService.removeLikeFromArticle(userId, articleId)

      expect(prismaMock.like.deleteMany).toHaveBeenCalledWith({
        where: {
          user_id: userId,
          p_article_id: articleId,
        },
      })
    })

    it('Throws error when Prisma returns an error', async () => {
      const userId = 1
      const articleId = 2
      const error = new Error('Database connection failed')
      prismaMock.like.deleteMany.mockRejectedValue(error)

      await expect(articleService.removeLikeFromArticle(userId, articleId)).rejects.toThrow(
        'Database connection failed',
      )
    })
  })
})
