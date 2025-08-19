import { ProcessedArticle, SectionType } from '@prisma/client'
import { prismaMock } from '../../../prisma/mock'
import { articleService, ArticleNotFoundError } from '../articleService'
import { createCursor, decodeCursor } from '../../utils/cursor'
import { redisClient } from '../../config/redis'
import { bigqueryClient } from '../../config/bigquery'
import { beforeEach } from 'node:test'
import { DetailedProcessedArticle } from '../../types/article'

jest.mock('../../utils/cursor', () => ({
  createCursor: jest.fn(),
  decodeCursor: jest.fn(),
}))

jest.mock('../../config/redis', () => ({
  redisClient: {
    get: jest.fn(),
    setEx: jest.fn(),
    del: jest.fn(),
  },
}))

jest.mock('../../config/bigquery', () => ({
  bigqueryClient: {
    query: jest.fn(),
  },
}))

const mockCreateCursor = createCursor as jest.MockedFunction<typeof createCursor>
const mockDecodeCursor = decodeCursor as jest.MockedFunction<typeof decodeCursor>

const mockRawDetailedArticle = {
  id: 1,
  section: {
    id: 1,
    name: SectionType.politics,
    friendly_name: '정치',
  },
  articles: [
    {
      provider: {
        id: 101,
        name: 'Provider 1',
        friendly_name: '뉴스사 1',
        logo_url: 'https://example.com/logos/1.png',
      },
      news_url: 'https://news1.com/article/1',
    },
    {
      provider: {
        id: 102,
        name: 'Provider 2',
        friendly_name: '뉴스사 2',
        logo_url: 'https://example.com/logos/2.png',
      },
      news_url: 'https://news2.com/article/1',
    },
  ],
  keywords: [
    {
      keyword: {
        id: 201,
        keyword: '키워드 1',
      },
    },
    {
      keyword: {
        id: 202,
        keyword: '키워드 2',
      },
    },
  ],
  likes: [{ user_id: 1 }],
  scraps: [],
  _count: {
    likes: 12,
    scraps: 3,
  },
  title: 'Test Summary',
  one_line_summary: 'Test Summary',
  full_summary: 'Test Full Summary',
  language: 'ko',
  region: 'KR',
  thumbnail_url: 'https://example.com/thumbnails/article1.jpg',
  created_at: new Date('2025-08-12T09:00:00Z'),
}

const mockDetailedArticle: DetailedProcessedArticle = {
  id: 1,
  section: { id: 1, name: SectionType.politics, friendlyName: '정치' },
  providers: [
    {
      id: 1,
      name: 'Test Provider',
      friendlyName: '테스트 뉴스사',
      newsUrl: 'http://news1.com',
      logoUrl: 'http://logo1.com',
    },
  ],
  keywords: [{ id: 1, keyword: 'test' }],
  title: 'Test Article 1',
  oneLineSummary: 'Summary 1',
  fullSummary: 'Full summary 1',
  language: 'ko',
  region: 'KR',
  thumbnailUrl: 'http://thumbnail1.com',
  createdAt: new Date('2025-07-17T00:00:00Z'),
  like: { isLiked: false, count: 0 },
  scrap: { isScraped: false, count: 0 },
}

describe('ArticleService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
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

  describe('clearCachedRecommendations', () => {
    it('Successfully clears cached recommendations for a user', async () => {
      const userId = 1

      await articleService.clearCachedRecommendations(userId)

      expect(redisClient.del).toHaveBeenCalledWith(`recommendations:${userId}`)
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

    it('Return cadndiateArticles when no query result', async () => {
      const userId = 1
      const candidateArticleIds = [101, 102, 103]
      const mockQueryResult: any[] = []

      ;(bigqueryClient.query as jest.Mock).mockResolvedValue([mockQueryResult])

      const result = await articleService.calculateSimilarityAndSort(userId, candidateArticleIds)

      expect(result).toEqual(candidateArticleIds)
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

      expect(articleService.setCachedRecommendations).not.toHaveBeenCalled()
      expect(result.articleIds).toEqual([])
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

  describe('getDetailedArticlesByIds', () => {
    it('Should correctly map raw Prisma result to DetailedProcessedArticle', async () => {
      const userId = 1
      const articleIds = [1]

      ;(prismaMock.processedArticle.findMany as jest.Mock).mockResolvedValue([mockRawDetailedArticle])

      const result = await articleService.getDetailedArticlesByIds(articleIds, userId)

      expect(result).toEqual([
        {
          id: mockRawDetailedArticle.id,
          section: {
            id: mockRawDetailedArticle.section.id,
            name: mockRawDetailedArticle.section.name,
            friendlyName: mockRawDetailedArticle.section.friendly_name,
          },
          providers: mockRawDetailedArticle.articles.map((a) => ({
            id: a.provider.id,
            name: a.provider.name,
            friendlyName: a.provider.friendly_name,
            newsUrl: a.news_url,
            logoUrl: a.provider.logo_url,
          })),
          keywords: mockRawDetailedArticle.keywords.map((k) => ({
            id: k.keyword.id,
            keyword: k.keyword.keyword,
          })),
          title: mockRawDetailedArticle.title,
          oneLineSummary: mockRawDetailedArticle.one_line_summary,
          fullSummary: mockRawDetailedArticle.full_summary,
          language: mockRawDetailedArticle.language,
          region: mockRawDetailedArticle.region,
          thumbnailUrl: mockRawDetailedArticle.thumbnail_url,
          createdAt: mockRawDetailedArticle.created_at,
          like: {
            isLiked: mockRawDetailedArticle.likes.length > 0,
            count: mockRawDetailedArticle._count.likes,
          },
          scrap: {
            isScraped: mockRawDetailedArticle.scraps.length > 0,
            count: mockRawDetailedArticle._count.scraps,
          },
        },
      ])
    })

    it('Should handle undefined region', async () => {
      const userId = 1
      const articleIds = [1]

      const rawArticleWithUndefinedRegion = {
        ...mockRawDetailedArticle,
        region: undefined,
      }

      ;(prismaMock.processedArticle.findMany as jest.Mock).mockResolvedValue([rawArticleWithUndefinedRegion])

      const result = await articleService.getDetailedArticlesByIds(articleIds, userId)

      expect(result[0].region).toBe(undefined)
    })

    it('Should return articles in the same order as the input IDs', async () => {
      // Arrange
      const userId = 1 // 1. 의도적으로 순서를 섞어서 ID 배열을 정의합니다.
      const requestedIds = [3, 1, 2] // 2. 각 ID에 해당하는 mock 데이터를 생성합니다.

      const mockArticle1 = { ...mockRawDetailedArticle, id: 1 }
      const mockArticle2 = { ...mockRawDetailedArticle, id: 2 }
      const mockArticle3 = { ...mockRawDetailedArticle, id: 3 } // 3. DB가 ID 순서대로(즉, 요청 순서와 다르게) 결과를 반환하는 상황을 시뮬레이션합니다.

      ;(prismaMock.processedArticle.findMany as jest.Mock).mockResolvedValue([mockArticle1, mockArticle2, mockArticle3]) // Act

      const result = await articleService.getDetailedArticlesByIds(requestedIds, userId) // Assert
      // 4. 최종 결과에서 ID만 추출하여 원래 요청했던 ID 배열 순서와 일치하는지 확인합니다.

      const resultIds = result.map((article) => article.id)
      expect(resultIds).toEqual(requestedIds) // [3, 1, 2] 순서여야 합니다.
      expect(result.length).toBe(3)
    })
  })

  describe('getDetailedArticleById', () => {
    it('returns first detailed article', async () => {
      const userId = 1
      const articleId = 1
      jest.spyOn(articleService, 'getDetailedArticlesByIds').mockResolvedValue([mockDetailedArticle])
      const result = await articleService.getDetailedArticleById(articleId, userId)
      expect(result).toEqual(mockDetailedArticle)
    })

    it('throws when empty array', async () => {
      const userId = 1
      const articleId = 1
      jest.spyOn(articleService, 'getDetailedArticlesByIds').mockResolvedValue([])
      await expect(articleService.getDetailedArticleById(articleId, userId)).rejects.toThrow(ArticleNotFoundError)
    })
  })

  describe('getArticlesByCursor', () => {
    it('should return articles with correct parameters', async () => {
      const articleIds = [1, 2, 3]
      const userId = 1
      const limit = 2
      const cursor = 'test-cursor'
      const decodedCursor = { idx: 0 }

      const mockArticles = [
        { id: 1, title: 'Article 1' },
        { id: 2, title: 'Article 2' },
        { id: 3, title: 'Article 3' },
      ]

      mockDecodeCursor.mockReturnValue(decodedCursor)
      jest.spyOn(articleService, 'getDetailedArticlesByIds').mockResolvedValue(mockArticles)

      const result = await articleService.getArticlesByCursor(articleIds, userId, limit, cursor)

      expect(mockDecodeCursor).toHaveBeenCalledWith(cursor)
      expect(articleService.getDetailedArticlesByIds).toHaveBeenCalledWith(articleIds, userId)
      expect(mockCreateCursor).toHaveBeenCalledWith(decodedCursor.idx + limit)
      expect(result).toEqual({
        data: mockArticles.slice(decodedCursor.idx, decodedCursor.idx + limit),
        hasNext: articleIds.length > decodedCursor.idx + limit,
        nextCursor: mockCreateCursor(decodedCursor.idx + limit),
      })
    })

    it('should return articles with no cursor', async () => {
      const articleIds = [1, 2, 3]
      const userId = 1
      const limit = 10

      const mockArticles = [
        { id: 1, title: 'Article 1' },
        { id: 2, title: 'Article 2' },
        { id: 3, title: 'Article 3' },
      ]

      jest.spyOn(articleService, 'getDetailedArticlesByIds').mockResolvedValue(mockArticles)

      const result = await articleService.getArticlesByCursor(articleIds, userId, limit)

      expect(articleService.getDetailedArticlesByIds).toHaveBeenCalledWith(articleIds, userId)
      expect(result).toEqual({
        data: mockArticles.slice(0, limit),
        hasNext: articleIds.length > limit,
        nextCursor: mockCreateCursor(limit),
      })
    })

    it('should throw ArticleNotFoundError when no articles found', async () => {
      const articleIds = [1, 2, 3]
      const userId = 1
      const limit = 2
      const cursor = 'test-cursor'
      const decodedCursor = { idx: 0 }

      mockDecodeCursor.mockReturnValue(decodedCursor)
      jest.spyOn(articleService, 'getDetailedArticlesByIds').mockResolvedValue([])

      await expect(articleService.getArticlesByCursor(articleIds, userId, limit, cursor)).rejects.toThrow(
        ArticleNotFoundError,
      )
    })
  })

  describe('fetchRecommendedArticleIds', () => {
    it('should return recommended article IDs from cache if exists', async () => {
      const userId = 1
      const mockCache = {
        articleIds: [1, 2, 3],
        lastUpdated: new Date(),
      }

      jest.spyOn(articleService, 'getCachedRecommendations').mockResolvedValue(mockCache)

      const result = await articleService.fetchRecommendedArticleIds(userId)

      expect(articleService.getCachedRecommendations).toHaveBeenCalledWith(userId)
      expect(result).toEqual(mockCache.articleIds)
    })

    it('should regenerate cache if no cached recommendations exists', async () => {
      const userId = 1
      const mockCache = {
        articleIds: [1, 2, 3],
        lastUpdated: new Date(),
      }

      jest.spyOn(articleService, 'getCachedRecommendations').mockResolvedValue(null)
      jest.spyOn(articleService, 'regenerateUserCache').mockResolvedValue(mockCache)

      const result = await articleService.fetchRecommendedArticleIds(userId)

      expect(articleService.getCachedRecommendations).toHaveBeenCalledWith(userId)
      expect(articleService.regenerateUserCache).toHaveBeenCalledWith(userId)
      expect(result).toEqual(mockCache.articleIds)
    })
  })

  describe('fetchScrapedArticleIds', () => {
    it('should return scraped article IDs for a user', async () => {
      const userId = 1
      const mockScrapedArticles = [{ id: 1 }, { id: 2 }, { id: 3 }]

      ;(prismaMock.processedArticle.findMany as jest.Mock).mockResolvedValue(mockScrapedArticles)

      const result = await articleService.fetchScrapedArticleIds(userId)

      expect(prismaMock.processedArticle.findMany).toHaveBeenCalledWith({
        where: {
          scraps: { some: { user_id: userId } },
        },
        select: { id: true },
      })
      expect(result).toEqual([1, 2, 3])
    })
  })

  describe('fetchLikedArticleIds', () => {
    it('should return liked article IDs for a user', async () => {
      const userId = 1
      const mockLikedArticles = [{ id: 1 }, { id: 2 }, { id: 3 }]

      ;(prismaMock.processedArticle.findMany as jest.Mock).mockResolvedValue(mockLikedArticles)

      const result = await articleService.fetchLikedArticleIds(userId)

      expect(prismaMock.processedArticle.findMany).toHaveBeenCalledWith({
        where: {
          likes: { some: { user_id: userId } },
        },
        select: { id: true },
      })
      expect(result).toEqual([1, 2, 3])
    })
  })

  describe('fetchHighlightedArticleIds', () => {
    const mockHighlightArticleCache = {
      articleIds: [1, 2, 3],
      lastUpdated: new Date(),
    }

    it('should return highlighed article IDs', async () => {
      ;(redisClient.get as jest.Mock).mockResolvedValue(JSON.stringify(mockHighlightArticleCache))

      const result = await articleService.fetchHighlightedArticleIds()

      expect(result).toEqual([1, 2, 3])
    })

    it('should update cache when no cache', async () => {
      ;(redisClient.get as jest.Mock).mockResolvedValue(undefined)
      jest.spyOn(articleService, 'updateHighlightArticles').mockResolvedValue(mockHighlightArticleCache)

      const result = await articleService.fetchHighlightedArticleIds()

      expect(result).toEqual([1, 2, 3])
    })
  })

  describe('getRecommendedArticleByCursor', () => {
    it('should return getArticlesByCursor with correct parameters', async () => {
      const userId = 1
      const limit = 10
      const cursor = 'test-cursor'
      const mockArticleIds = [1, 2, 3]

      jest.spyOn(articleService, 'fetchRecommendedArticleIds').mockResolvedValue(mockArticleIds)
      jest.spyOn(articleService, 'getArticlesByCursor').mockResolvedValue({
        data: [],
        hasNext: false,
        nextCursor: 'next-cursor',
      })

      const result = await articleService.getRecommendedArticlesByCursor(userId, limit, cursor)

      expect(articleService.fetchRecommendedArticleIds).toHaveBeenCalledWith(userId)
      expect(articleService.getArticlesByCursor).toHaveBeenCalledWith(mockArticleIds, userId, limit, cursor)
    })
  })

  describe('getScrapedArticlesByCursor', () => {
    it('should return getArticlesByCursor with correct parameters', async () => {
      const userId = 1
      const limit = 10
      const cursor = 'test-cursor'
      const mockArticleIds = [1, 2, 3]

      jest.spyOn(articleService, 'fetchScrapedArticleIds').mockResolvedValue(mockArticleIds)
      jest.spyOn(articleService, 'getArticlesByCursor').mockResolvedValue({
        data: [],
        hasNext: false,
        nextCursor: 'next-cursor',
      })

      const result = await articleService.getScrapedArticlesByCursor(userId, limit, cursor)

      expect(articleService.fetchScrapedArticleIds).toHaveBeenCalledWith(userId)
      expect(articleService.getArticlesByCursor).toHaveBeenCalledWith(mockArticleIds, userId, limit, cursor)
    })
  })

  describe('getLikedArticlesByCursor', () => {
    it('should return getArticlesByCursor with correct parameters', async () => {
      const userId = 1
      const limit = 10
      const cursor = 'test-cursor'
      const mockArticleIds = [1, 2, 3]

      jest.spyOn(articleService, 'fetchLikedArticleIds').mockResolvedValue(mockArticleIds)
      jest.spyOn(articleService, 'getArticlesByCursor').mockResolvedValue({
        data: [],
        hasNext: false,
        nextCursor: 'next-cursor',
      })

      const result = await articleService.getLikedArticlesByCursor(userId, limit, cursor)

      expect(articleService.fetchLikedArticleIds).toHaveBeenCalledWith(userId)
      expect(articleService.getArticlesByCursor).toHaveBeenCalledWith(mockArticleIds, userId, limit, cursor)
    })
  })

  describe('getHighlightArticlesByCursor', () => {
    it('should return getArticlesByCursor with correct parameters', async () => {
      const userId = 1
      const limit = 10
      const cursor = 'test-cursor'
      const mockArticleIds = [1, 2, 3]

      jest.spyOn(articleService, 'fetchHighlightedArticleIds').mockResolvedValue(mockArticleIds)
      jest.spyOn(articleService, 'getArticlesByCursor').mockResolvedValue({
        data: [],
        hasNext: false,
        nextCursor: 'next-cursor',
      })

      const result = await articleService.getHighlightArticlesByCursor(userId, limit, cursor)

      expect(articleService.fetchHighlightedArticleIds).toHaveBeenCalled()
      expect(articleService.getArticlesByCursor).toHaveBeenCalledWith(mockArticleIds, userId, limit, cursor)
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
      section_id: 1,
      thumbnail_url: 'http://example.com/thumbnail.jpg',
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

  describe('updateHighlightArticles', () => {
    const fixedDate = new Date('2025-08-14T00:00:00.000Z')

    beforeAll(() => {
      jest.useFakeTimers()
      jest.setSystemTime(fixedDate)
    })

    afterAll(() => {
      jest.useRealTimers()
    })

    const articles = [
      {
        id: 1,
        title: 'Highlight Article 1',
        likes: [{ user_id: 1 }],
        scraps: [{ user_id: 1 }],
        ArticleViewEvent: [{ user_id: 1 }],
        articles: [{ provider: { id: 1 } }],
      },
      {
        id: 2,
        title: 'Highlight Article 2',
        likes: [{ user_id: 1 }, { user_id: 2 }],
        scraps: [{ user_id: 1 }, { user_id: 2 }],
        ArticleViewEvent: [{ user_id: 1 }, { user_id: 2 }],
        articles: [{ provider: { id: 1 } }, { provider: { id: 2 } }],
      },
      {
        id: 3,
        title: 'Highlight Article 3',
        likes: [],
        scraps: [],
        ArticleViewEvent: [],
        articles: [{ provider: { id: 1 } }],
      },
    ]

    it('Successfully updates highlight articles for a given date', async () => {
      const fromDate = new Date('2025-08-14T00:00:00Z')
      const numArticles = 2
      ;(prismaMock.processedArticle.findMany as jest.Mock).mockResolvedValue(articles)
      ;(redisClient.setEx as jest.Mock).mockResolvedValue('OK')

      const result = await articleService.updateHighlightArticles(fromDate, numArticles)

      expect(prismaMock.processedArticle.findMany).toHaveBeenCalledWith({
        include: {
          likes: true,
          scraps: true,
          ArticleViewEvent: true,
          articles: { select: { provider: true } },
        },
        where: { created_at: { gte: fromDate.toISOString() } },
      })

      expect(result.articleIds).toEqual([2, 1])
      expect(result.lastUpdated).toEqual(fixedDate)

      expect(redisClient.setEx).toHaveBeenCalledWith(
        'highlight-articles',
        3600 * 24, // 24시간
        JSON.stringify({
          articleIds: [2, 1], // 기사 2(20점), 기사 1(12점) 순
          lastUpdated: fixedDate.toISOString(),
        }),
      )
    })

    it('Should use default number of articles if not provided', async () => {
      const fromDate = new Date('2025-08-13T00:00:00Z')
      ;(prismaMock.processedArticle.findMany as jest.Mock).mockResolvedValue(articles)
      ;(redisClient.setEx as jest.Mock).mockResolvedValue('OK')

      const result = await articleService.updateHighlightArticles(fromDate)

      expect(prismaMock.processedArticle.findMany).toHaveBeenCalledWith({
        include: {
          likes: true,
          scraps: true,
          ArticleViewEvent: true,
          articles: { select: { provider: true } },
        },
        where: { created_at: { gte: fromDate.toISOString() } },
      })

      expect(result.articleIds).toEqual([2, 1, 3])
      expect(result.lastUpdated).toEqual(fixedDate)

      expect(redisClient.setEx).toHaveBeenCalledWith(
        'highlight-articles',
        3600 * 24,
        JSON.stringify({
          articleIds: [2, 1, 3], // 점수순: 기사2(20점), 기사1(12점), 기사3(2점)
          lastUpdated: fixedDate.toISOString(),
        }),
      )
    })

    it('Should not cache if no articles found', async () => {
      const fromDate = new Date('2025-08-13T00:00:00Z')
      ;(prismaMock.processedArticle.findMany as jest.Mock).mockResolvedValue([])
      ;(redisClient.setEx as jest.Mock).mockResolvedValue('OK')

      const result = await articleService.updateHighlightArticles(fromDate)

      expect(prismaMock.processedArticle.findMany).toHaveBeenCalledWith({
        include: {
          likes: true,
          scraps: true,
          ArticleViewEvent: true,
          articles: { select: { provider: true } },
        },
        where: { created_at: { gte: fromDate.toISOString() } },
      })

      expect(result.articleIds).toEqual([])
      expect(result.lastUpdated).toEqual(fixedDate)
      expect(redisClient.setEx).not.toHaveBeenCalled()
    })
  })
})
