import { ProcessedArticle } from '@prisma/client'
import { prismaMock } from '../../../prisma/mock'
import { articleService, ArticleNotFoundError } from '../articleService'
import { createCursor, decodeCursor } from '../../utils/cursor'
import { redisClient } from '../../config/redis'
import { bigqueryClient } from '../../config/bigquery'
import { beforeEach } from 'node:test'

jest.mock('../../utils/cursor', () => ({
  createCursor: jest.fn(),
  decodeCursor: jest.fn(),
}))

jest.mock('../../config/redis', () => ({
  redisClient: {
    get: jest.fn(),
    setEx: jest.fn(),
  },
}))

jest.mock('../../config/bigquery', () => ({
  bigqueryClient: {
    query: jest.fn(),
  },
}))

const mockCreateCursor = createCursor as jest.MockedFunction<typeof createCursor>
const mockDecodeCursor = decodeCursor as jest.MockedFunction<typeof decodeCursor>

describe('ArticleService', () => {
  beforeEach(() => {
    jest.restoreAllMocks()
  })

  describe('setCachedRecommendations', () => {
    it('Successfully caches recommendations for a user', async () => {
      const userId = 1
      const mockCache = {
        articleIds: [1, 2, 3],
        lastUpdated: new Date(),
      }

      await articleService.setCachedRecommendations(userId, mockCache)

      expect(redisClient.setEx).toHaveBeenCalledWith(
        `recommendations:${userId}`,
        3600 * 6, // 6시간
        JSON.stringify(mockCache),
      )
    })

    it('Throws error when Redis returns an error', async () => {
      const userId = 1
      const mockCache = {
        articleIds: [1, 2, 3],
        lastUpdated: new Date(),
      }
      const error = new Error('Redis connection failed')

      ;(redisClient.setEx as jest.Mock).mockRejectedValue(error)

      await expect(articleService.setCachedRecommendations(userId, mockCache)).rejects.toThrow(
        'Redis connection failed',
      )
    })
  })

  describe('calculateSimilarityAndSort', () => {
    it('Successfully calculates similarity and returns sorted article IDs', async () => {
      const userId = 1
      const candidateArticleIds = [101, 102, 103]
      const mockQueryResult = [{ p_article_id: 102 }, { p_article_id: 103 }, { p_article_id: 101 }]

      ;(bigqueryClient.query as jest.Mock).mockResolvedValue([mockQueryResult])

      const result = await articleService.calculateSimilarityAndSort(userId, candidateArticleIds)

      expect(bigqueryClient.query).toHaveBeenCalledWith({
        query: expect.stringContaining('WITH user_embedding AS'),
        params: {
          userId: userId,
          articleIds: candidateArticleIds,
        },
      })
      expect(result).toEqual([102, 103, 101])
    })

    it('Returns empty array when no candidates provided', async () => {
      const userId = 1
      const candidateArticleIds: number[] = []
      const mockQueryResult: any[] = []

      ;(bigqueryClient.query as jest.Mock).mockResolvedValue([mockQueryResult])

      const result = await articleService.calculateSimilarityAndSort(userId, candidateArticleIds)

      expect(result).toEqual([])
    })

    it('Throws error when BigQuery returns an error', async () => {
      const userId = 1
      const candidateArticleIds = [101, 102, 103]
      const error = new Error('BigQuery connection failed')

      ;(bigqueryClient.query as jest.Mock).mockRejectedValue(error)

      await expect(articleService.calculateSimilarityAndSort(userId, candidateArticleIds)).rejects.toThrow(
        'BigQuery connection failed',
      )
    })
  })

  describe('getViewedArticleIdsByUser', () => {
    it('Successfully retrieves viewed article IDs for default period (30 days)', async () => {
      const userId = 1
      const mockViewEvents = [
        { p_article_id: 1 },
        { p_article_id: 2 },
        { p_article_id: 3 },
        { p_article_id: 2 }, // 중복
      ]

      ;(prismaMock.articleViewEvent.findMany as jest.Mock).mockResolvedValue(mockViewEvents)

      const result = await articleService.getViewedArticleIdsByUser(userId)

      expect(prismaMock.articleViewEvent.findMany).toHaveBeenCalledWith({
        where: {
          user_id: userId,
          event_at: { gte: expect.any(Date) },
        },
        select: { p_article_id: true },
      })
      expect(result).toEqual(new Set([1, 2, 3, 2]))
    })

    it('Successfully retrieves viewed article IDs for custom period', async () => {
      const userId = 1
      const days = 7
      const mockViewEvents = [{ p_article_id: 1 }, { p_article_id: 2 }]

      ;(prismaMock.articleViewEvent.findMany as jest.Mock).mockResolvedValue(mockViewEvents)

      const result = await articleService.getViewedArticleIdsByUser(userId, days)

      expect(prismaMock.articleViewEvent.findMany).toHaveBeenCalledWith({
        where: {
          user_id: userId,
          event_at: { gte: expect.any(Date) },
        },
        select: { p_article_id: true },
      })
      expect(result).toEqual(new Set([1, 2]))
    })

    it('Returns empty set when no viewed articles exist', async () => {
      const userId = 1

      ;(prismaMock.articleViewEvent.findMany as jest.Mock).mockResolvedValue([])

      const result = await articleService.getViewedArticleIdsByUser(userId)

      expect(result).toEqual(new Set())
    })

    it('Throws error when Prisma returns an error', async () => {
      const userId = 1
      const error = new Error('Database connection failed')

      ;(prismaMock.articleViewEvent.findMany as jest.Mock).mockRejectedValue(error)

      await expect(articleService.getViewedArticleIdsByUser(userId)).rejects.toThrow('Database connection failed')
    })
  })

  describe('regenerateUserCache', () => {
    it('Successfully regenerates user cache', async () => {
      const userId = 1
      const mockViewedArticleIds = new Set([1, 2])
      const mockCandidateArticles = [{ id: 3 }, { id: 4 }, { id: 5 }]
      const mockRecommendedIds = [4, 5, 3]

      ;(prismaMock.processedArticle.findMany as jest.Mock).mockResolvedValue(mockCandidateArticles)

      jest.spyOn(articleService, 'getViewedArticleIdsByUser').mockResolvedValue(mockViewedArticleIds)
      jest.spyOn(articleService, 'calculateSimilarityAndSort').mockResolvedValue(mockRecommendedIds)
      jest.spyOn(articleService, 'setCachedRecommendations').mockResolvedValue()

      const result = await articleService.regenerateUserCache(userId)

      expect(articleService.getViewedArticleIdsByUser).toHaveBeenCalledWith(userId)
      expect(prismaMock.processedArticle.findMany).toHaveBeenCalledWith({
        where: {
          created_at: { gte: expect.any(Date) },
          id: { notIn: Array.from(mockViewedArticleIds) },
        },
        select: { id: true },
      })
      expect(articleService.calculateSimilarityAndSort).toHaveBeenCalledWith(
        userId,
        mockCandidateArticles.map((a) => a.id),
      )
      expect(articleService.setCachedRecommendations).toHaveBeenCalledWith(userId, {
        articleIds: mockRecommendedIds,
        lastUpdated: expect.any(Date),
      })
      expect(result).toEqual({
        articleIds: mockRecommendedIds,
        lastUpdated: expect.any(Date),
      })
    })

    it('Handles case when no candidate articles exist', async () => {
      const userId = 1
      const mockViewedArticleIds = new Set([1, 2])
      const mockCandidateArticles: { id: number }[] = []
      const mockRecommendedIds: number[] = []

      ;(prismaMock.processedArticle.findMany as jest.Mock).mockResolvedValue(mockCandidateArticles)

      jest.spyOn(articleService, 'getViewedArticleIdsByUser').mockResolvedValue(mockViewedArticleIds)
      jest.spyOn(articleService, 'calculateSimilarityAndSort').mockResolvedValue(mockRecommendedIds)
      jest.spyOn(articleService, 'setCachedRecommendations').mockResolvedValue()

      const result = await articleService.regenerateUserCache(userId)

      expect(result.articleIds).toEqual([])
    })
  })

  describe('getArticlesByIds', () => {
    const mockArticle1: ProcessedArticle = {
      id: 1,
      title: 'Test Article 1',
      one_line_summary: 'Summary 1',
      full_summary: 'Full summary 1',
      thumbnail_url: 'http://thumbnail1.com',
      language: 'ko',
      region: 'KR',
      section_id: 1,
      created_at: new Date('2025-07-17T00:00:00Z'),
    }

    const mockArticle2: ProcessedArticle = {
      id: 2,
      title: 'Test Article 2',
      one_line_summary: 'Summary 2',
      full_summary: 'Full summary 2',
      thumbnail_url: 'http://thumbnail2.com',
      language: 'ko',
      region: 'KR',
      section_id: 2,
      created_at: new Date('2025-07-18T00:00:00Z'),
    }

    it('Successfully retrieves multiple articles by IDs', async () => {
      const articleIds = [1, 2]
      const mockArticles = [mockArticle1, mockArticle2]

      prismaMock.processedArticle.findMany.mockResolvedValue(mockArticles)

      const result = await articleService.getArticlesByIds(articleIds)

      expect(prismaMock.processedArticle.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: articleIds },
        },
      })
      expect(result).toEqual(mockArticles)
    })

    it('Returns empty array when no matching articles found', async () => {
      const articleIds = [999, 1000]

      prismaMock.processedArticle.findMany.mockResolvedValue([])

      const result = await articleService.getArticlesByIds(articleIds)

      expect(result).toEqual([])
    })

    it('Returns partial results when some articles exist', async () => {
      const articleIds = [1, 999]
      const mockArticles = [mockArticle1]

      prismaMock.processedArticle.findMany.mockResolvedValue(mockArticles)

      const result = await articleService.getArticlesByIds(articleIds)

      expect(result).toEqual(mockArticles)
      expect(result).toHaveLength(1)
    })

    it('Handles empty input array', async () => {
      const articleIds: number[] = []

      prismaMock.processedArticle.findMany.mockResolvedValue([])

      const result = await articleService.getArticlesByIds(articleIds)

      expect(prismaMock.processedArticle.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: [] },
        },
      })
      expect(result).toEqual([])
    })

    it('Throws error when Prisma returns an error', async () => {
      const articleIds = [1, 2]
      const error = new Error('Database connection failed')

      prismaMock.processedArticle.findMany.mockRejectedValue(error)

      await expect(articleService.getArticlesByIds(articleIds)).rejects.toThrow('Database connection failed')
    })
  })

  describe('getCachedRecommendations', () => {
    it('Successfully retrieves cached recommendations for a user', async () => {
      const userId = 1
      const mockCache = {
        articleIds: [1, 2, 3],
        lastUpdated: new Date(),
      }

      ;(redisClient.get as jest.Mock).mockResolvedValue(JSON.stringify(mockCache))

      const result = await articleService.getCachedRecommendations(userId)

      expect(redisClient.get).toHaveBeenCalledWith(`recommendations:${userId}`)
      expect(result).toEqual({
        articleIds: mockCache.articleIds,
        lastUpdated: mockCache.lastUpdated.toISOString(),
      })
    })

    it('Returns null when no cached recommendations exist', async () => {
      const userId = 1

      ;(redisClient.get as jest.Mock).mockResolvedValue(null)

      const result = await articleService.getCachedRecommendations(userId)

      expect(redisClient.get).toHaveBeenCalledWith(`recommendations:${userId}`)
      expect(result).toBeNull()
    })
  })

  describe('getRecommendedArticlesByCursor', () => {
    const mockArticle1: ProcessedArticle = {
      id: 1,
      title: 'Test Article 1',
      one_line_summary: 'Summary 1',
      full_summary: 'Full summary 1',
      thumbnail_url: 'http://thumbnail1.com',
      language: 'ko',
      region: 'KR',
      section_id: 1,
      created_at: new Date('2025-07-17T00:00:00Z'),
    }

    const mockArticle2: ProcessedArticle = {
      id: 2,
      title: 'Test Article 2',
      one_line_summary: 'Summary 2',
      full_summary: 'Full summary 2',
      thumbnail_url: 'http://thumbnail2.com',
      language: 'ko',
      region: 'KR',
      section_id: 2,
      created_at: new Date('2025-07-18T00:00:00Z'),
    }

    const mockArticle3: ProcessedArticle = {
      id: 3,
      title: 'Test Article 3',
      one_line_summary: 'Summary 3',
      full_summary: 'Full summary 3',
      thumbnail_url: 'http://thumbnail3.com',
      language: 'ko',
      region: 'KR',
      section_id: 3,
      created_at: new Date('2025-07-19T00:00:00Z'),
    }

    it('Successfully return articles when cache exists', async () => {
      const userId = 1
      const limit = 1
      const mockUserCache = {
        articleIds: [mockArticle1.id, mockArticle2.id, mockArticle3.id],
        lastUpdated: new Date(),
      }

      ;(createCursor as jest.Mock).mockReturnValue('next-cursor')
      jest.spyOn(articleService, 'getCachedRecommendations').mockResolvedValue(mockUserCache)
      jest.spyOn(articleService, 'getArticlesByIds').mockResolvedValue([mockArticle1])

      const result = await articleService.getRecommendedArticlesByCursor(userId, limit)

      expect(articleService.getCachedRecommendations).toHaveBeenCalledWith(userId)
      expect(articleService.getArticlesByIds).toHaveBeenCalledWith(mockUserCache.articleIds.slice(0, limit))
      expect(result).toEqual({
        data: [mockArticle1],
        hasNext: true,
        nextCursor: 'next-cursor',
      })
    })

    it('Successfully return articles when cache does not exist', async () => {
      const userId = 1
      const limit = 2
      const mockUserCache = {
        articleIds: [mockArticle1.id, mockArticle2.id, mockArticle3.id],
        lastUpdated: new Date(),
      }

      ;(createCursor as jest.Mock).mockReturnValue('next-cursor')
      jest.spyOn(articleService, 'getCachedRecommendations').mockResolvedValue(null)
      jest.spyOn(articleService, 'regenerateUserCache').mockResolvedValue(mockUserCache)
      jest.spyOn(articleService, 'getArticlesByIds').mockResolvedValue([mockArticle1, mockArticle2])

      const result = await articleService.getRecommendedArticlesByCursor(userId, limit)

      expect(articleService.getCachedRecommendations).toHaveBeenCalledWith(userId)
      expect(articleService.regenerateUserCache).toHaveBeenCalledWith(userId)
      expect(articleService.getArticlesByIds).toHaveBeenCalledWith(mockUserCache.articleIds.slice(0, limit))
      expect(result).toEqual({
        data: [mockArticle1, mockArticle2],
        hasNext: true,
        nextCursor: 'next-cursor',
      })
    })

    it('Successfully return articles when cursor is provided', async () => {
      const userId = 1
      const limit = 1
      const mockUserCache = {
        articleIds: [mockArticle1.id, mockArticle2.id, mockArticle3.id],
        lastUpdated: new Date(),
      }
      const cursor = 'test-cursor'
      const decodedCursor = { idx: 1 }

      mockDecodeCursor.mockReturnValue(decodedCursor)
      mockCreateCursor.mockReturnValue(cursor)

      jest.spyOn(articleService, 'getCachedRecommendations').mockResolvedValue(mockUserCache)
      jest.spyOn(articleService, 'getArticlesByIds').mockResolvedValue([mockArticle2])

      const result = await articleService.getRecommendedArticlesByCursor(userId, limit, cursor)

      expect(articleService.getCachedRecommendations).toHaveBeenCalledWith(userId)
      expect(mockDecodeCursor).toHaveBeenCalledWith(cursor)
      expect(articleService.getArticlesByIds).toHaveBeenCalledWith(
        mockUserCache.articleIds.slice(decodedCursor.idx, decodedCursor.idx + limit),
      )
      expect(result).toEqual({
        data: [mockArticle2],
        hasNext: true,
        nextCursor: cursor,
      })
    })

    it('Successfully return articles when cursor is not provided', async () => {
      const userId = 1
      const limit = 2
      const mockUserCache = {
        articleIds: [mockArticle1.id, mockArticle2.id, mockArticle3.id],
        lastUpdated: new Date(),
      }

      ;(createCursor as jest.Mock).mockReturnValue('next-cursor')
      jest.spyOn(articleService, 'getCachedRecommendations').mockResolvedValue(mockUserCache)
      jest.spyOn(articleService, 'getArticlesByIds').mockResolvedValue([mockArticle1, mockArticle2])

      const result = await articleService.getRecommendedArticlesByCursor(userId, limit)

      expect(articleService.getCachedRecommendations).toHaveBeenCalledWith(userId)
      expect(articleService.getArticlesByIds).toHaveBeenCalledWith(mockUserCache.articleIds.slice(0, limit))
      expect(result).toEqual({
        data: [mockArticle1, mockArticle2],
        hasNext: true,
        nextCursor: 'next-cursor',
      })
    })

    it('Should not generate cursor when no next page exists', async () => {
      const userId = 1
      const limit = 3
      const mockUserCache = {
        articleIds: [mockArticle1.id, mockArticle2.id],
        lastUpdated: new Date(),
      }

      jest.spyOn(articleService, 'getCachedRecommendations').mockResolvedValue(mockUserCache)
      jest.spyOn(articleService, 'getArticlesByIds').mockResolvedValue([mockArticle1, mockArticle2])

      const result = await articleService.getRecommendedArticlesByCursor(userId, limit)

      expect(articleService.getCachedRecommendations).toHaveBeenCalledWith(userId)
      expect(articleService.getArticlesByIds).toHaveBeenCalledWith(mockUserCache.articleIds.slice(0, limit))
      expect(result).toEqual({
        data: [mockArticle1, mockArticle2],
        hasNext: false,
        nextCursor: undefined,
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

  describe('scrapArticle', () => {
    it('Successfully scraps an article', async () => {
      const userId = 1
      const articleId = 2

      await articleService.scrapArticle(userId, articleId)

      expect(prismaMock.scrap.create).toHaveBeenCalledWith({
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
      prismaMock.scrap.create.mockRejectedValue(error)

      await expect(articleService.scrapArticle(userId, articleId)).rejects.toThrow('Database connection failed')
    })
  })

  describe('unscrapArticle', () => {
    it('Successfully removes a scrap from an article', async () => {
      const userId = 1
      const articleId = 2

      await articleService.unscrapArticle(userId, articleId)

      expect(prismaMock.scrap.deleteMany).toHaveBeenCalledWith({
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
      prismaMock.scrap.deleteMany.mockRejectedValue(error)

      await expect(articleService.unscrapArticle(userId, articleId)).rejects.toThrow('Database connection failed')
    })
  })
})
