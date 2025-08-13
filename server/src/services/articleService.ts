import { ArticleViewEventType, ProcessedArticle } from '@prisma/client'
import { prisma } from '../../prisma/prisma'
import { ArticleSimilarityRow, DetailedProcessedArticle, UserArticleCache } from '../types/article'
import { redisClient } from '../config/redis'
import { createCursor, decodeCursor } from '../utils/cursor'
import dayjs from 'dayjs'
import { bigqueryClient } from '../config/bigquery'

const RECOMMENDATION_CACHE_EXPIRATION = 3600 * 6 // 6시간

/**
 * 커서 페이지네이션을 사용하여 기사를 조회하는 결과 형식입니다.
 */
export interface ArticleCursorPaginationResult {
  data: DetailedProcessedArticle[]
  hasNext: boolean
  nextCursor?: string
}

/**
 * 특정 ID의 기사를 찾지 못했을 때 발생하는 오류 클래스입니다.
 * 이 오류는 기사가 존재하지 않을 때 사용됩니다.
 */
export class ArticleNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ArticleNotFoundError'
  }
}

export const articleService = {
  /**
   * 사용자 ID에 해당하는 추천 기사를 Redis에서 조회합니다.
   * 이 함수는 캐시된 추천 기사 정보를 반환합니다.
   * @param userId - 추천 기사를 조회할 사용자의 ID
   * @return Promise<UserArticleCache | null> - 캐시된 추천 기사 정보 또는 null
   * @example
   * // 사용자 1에 대한 추천 기사를 조회
   *  getCachedRecommendations(1)
   */
  getCachedRecommendations: async (userId: number): Promise<UserArticleCache | null> => {
    const cacheKey = `recommendations:${userId}`
    const cached = await redisClient.get(cacheKey)

    if (cached) {
      const data = JSON.parse(cached) as UserArticleCache
      return data
    }
    return null
  },

  /**
   * 사용자 ID에 해당하는 추천 기사를 캐싱합니다.
   * 이 함수는 추천 기사 정보를 Redis에 저장합니다.
   * @param userId - 추천 기사를 캐싱할 사용자의 ID
   * @param cache - 캐싱할 추천 기사 정보
   * @return Promise<void> - 캐싱이 완료되면 반환되는 프로미스
   * @example
   * // 사용자 1에 대한 추천 기사를 캐싱
   *  setCachedRecommendations(1, { articleIds: [101, 102, 103], lastUpdated: new Date() })
   */
  setCachedRecommendations: async (userId: number, cache: UserArticleCache): Promise<void> => {
    const cacheKey = `recommendations:${userId}`

    await redisClient.setEx(cacheKey, RECOMMENDATION_CACHE_EXPIRATION, JSON.stringify(cache))
  },

  /**
   * 사용자 임베딩과 후보 기사 임베딩을 비교하여 유사도를 계산하고, 유사도에 따라 기사를 정렬합니다.
   * 이 함수는 BigQuery에 쿼리를 실행하여 유사도를 계산합니다.
   * @param userId - 추천을 받을 사용자의 ID
   * @param candidateArticleIds - 후보 기사 ID 배열
   * @return Promise<number[]> - 유사도에 따라 정렬된 기사 ID 배열
   * @example
   * // 사용자 1에 대한 추천 기사 ID를 계산
   *  calculateSimilarityAndSort(1, [101, 102, 103])
   */
  calculateSimilarityAndSort: async (userId: number, candidateArticleIds: number[]): Promise<number[]> => {
    const query = `
      WITH user_embedding AS (
        SELECT embedding_vector
        FROM recommendation.user_embeddings
        WHERE user_id = @userId
      ),
      article_similarities AS (
        SELECT
          p.p_article_id,
          (
            SELECT
              SUM(u.embedding_vector[OFFSET(i)] * p.embedding_vector[OFFSET(i)])
            FROM UNNEST(GENERATE_ARRAY(0, ARRAY_LENGTH(u.embedding_vector) - 1)) AS i
          ) / (
            SQRT((SELECT SUM(POW(x, 2)) FROM UNNEST(u.embedding_vector) AS x)) *
            SQRT((SELECT SUM(POW(x, 2)) FROM UNNEST(p.embedding_vector) AS x))
          ) AS cosine_similarity
        FROM recommendation.p_article_embeddings p
        CROSS JOIN user_embedding u
        WHERE p.p_article_id IN UNNEST(@articleIds)
      )
      SELECT p_article_id
      FROM article_similarities
      ORDER BY cosine_similarity DESC
    `

    const options = {
      query: query,
      params: {
        userId: userId,
        articleIds: candidateArticleIds,
      },
    }

    const [rows] = await bigqueryClient.query(options)
    const sortedArticleIds = (rows as ArticleSimilarityRow[]).map((row) => row.p_article_id)
    return sortedArticleIds
  },

  /**
   * 특정 사용자에 대한 추천 기사 정보를 캐싱합니다.
   * @param userId - 추천 기사를 캐싱할 사용자의 ID
   * @return Promise<UserArticleCache> - 캐싱된 추천 기사 정보
   * @example
   * // 사용자 1에 대한 추천 기사를 캐싱
   * regenerateUserCache(1)
   */
  regenerateUserCache: async (userId: number): Promise<UserArticleCache> => {
    const viewedArticleIds = await articleService.getViewedArticleIdsByUser(userId)

    // 최근 1일 이내에 조회한 기사 중에서 이미 본 기사를 제외한 후보 기사들을 조회합니다.
    const candidateArticles = await prisma.processedArticle.findMany({
      where: {
        created_at: { gte: dayjs().subtract(1, 'day').toDate() },
        id: { notIn: Array.from(viewedArticleIds) },
      },
      select: { id: true },
    })

    const recommendedIds = await articleService.calculateSimilarityAndSort(
      userId,
      candidateArticles.map((a) => a.id),
    )

    const newCache: UserArticleCache = {
      articleIds: recommendedIds,
      lastUpdated: new Date(),
    }

    await articleService.setCachedRecommendations(userId, newCache)
    return newCache
  },

  /**
   * 특정 사용자가 최근 n일 동안 조회한 기사 ID를 반환합니다.
   * @param userId - 조회한 사용자의 ID
   * @param days - 조회 기간 (기본값: 30일)
   * @return Set<number> - 조회한 기사 ID의 집합
   * @example
   * // 사용자 1이 최근 30일 동안 조회한 기사 ID를 가져옴
   * getViewedArticleByUserId(1)
   */
  getViewedArticleIdsByUser: async (userId: number, days: number = 30): Promise<Set<number>> => {
    const viewEvents = await prisma.articleViewEvent.findMany({
      where: {
        user_id: userId,
        event_at: { gte: dayjs().subtract(days, 'day').toDate() },
      },
      select: { p_article_id: true },
    })

    return new Set(viewEvents.map((e) => e.p_article_id))
  },

  /**
   * 사용자별 추천 기사를 커서 페이지네이션 방식으로 조회합니다.
   * @param userId - 추천 기사를 조회할 사용자의 ID
   * @param limit - 한 번에 조회할 기사 수
   * @param cursor - 다음 페이지를 위한 커서 (기본값: undefined)
   * @return ArticleCursorPaginationResult - 조회된 기사와 페이지네이션 정보
   * @example
   * // 사용자 1의 추천 기사 10개를 조회
   * getRecommendedArticlesByCursor(1, 10)
   */
  getRecommendedArticlesByCursor: async (
    userId: number,
    limit: number,
    cursor?: string,
  ): Promise<ArticleCursorPaginationResult> => {
    let cursorIdx = 0
    if (cursor) {
      const decodedCursor = decodeCursor(cursor)
      cursorIdx = decodedCursor.idx
    }

    let userCache = await articleService.getCachedRecommendations(userId)

    if (!userCache) {
      userCache = await articleService.regenerateUserCache(userId)
    }

    const articleIds = userCache.articleIds.slice(cursorIdx, cursorIdx + limit)
    const articles = await articleService.getDetailedArticlesByIds(articleIds, userId)

    const nextIdx = cursorIdx + limit
    const hasNext = nextIdx < userCache.articleIds.length
    const nextCursor = hasNext ? createCursor(nextIdx) : undefined

    return {
      data: articles,
      hasNext,
      nextCursor,
    }
  },

  /**
   * 특정 ID의 기사를 조회합니다.
   * 기사가 존재하지 않을 경우 ArticleNotFoundError를 발생시킵니다.
   * @param id - 조회할 기사의 ID
   * @return ProcessedArticle - 조회된 기사 객체
   * @throws {ArticleNotFoundError} - 기사가 존재하지 않을 경우
   * @example
   * // 특정 ID의 기사를 조회
   * getArticleById(1)
   * // 반환값: ProcessedArticle 객체
   */
  getArticleById: async (id: number): Promise<ProcessedArticle> => {
    const article = await prisma.processedArticle.findUnique({
      where: { id },
    })

    if (!article) {
      throw new ArticleNotFoundError(`Article with ID ${id} not found`)
    }

    return article
  },

  /**
   * 특정 ID의 기사들을 상세하게 조회합니다.
   * 이 함수는 기사 ID 배열을 받아 해당 기사들의 상세 정보를 반환합니다.
   * @param ids - 조회할 기사 ID 배열
   * @param userId - 사용자의 ID (좋아요/스크랩 여부 확인용)
   * @return Promise<DetailedProcessedArticle[]> - 상세 기사 정보 배열
   * @example
   * // 특정 ID의 기사들을 상세하게 조회
   * getDetailedArticlesByIds([1, 2, 3], 1)
   */
  getDetailedArticlesByIds: async (ids: number[], userId: number) => {
    const articles = await prisma.processedArticle.findMany({
      where: { id: { in: ids } },
      include: {
        section: {
          // Section 정보
          select: {
            id: true,
            name: true,
            friendly_name: true,
          },
        },
        articles: {
          // providers 정보 (원문 기사)
          select: {
            provider: {
              select: {
                id: true,
                name: true,
                friendly_name: true,
                logo_url: true,
              },
            },
            news_url: true,
          },
        },
        keywords: {
          // Keywords
          select: {
            keyword: {
              select: {
                id: true,
                keyword: true,
              },
            },
          },
        },
        likes: {
          // 내가 좋아요 했는지 확인
          where: { user_id: userId },
          select: { user_id: true },
        },
        scraps: {
          // 내가 스크랩 했는지 확인
          where: { user_id: userId },
          select: { user_id: true },
        },
        _count: {
          // 좋아요/스크랩 수
          select: {
            likes: true,
            scraps: true,
          },
        },
      },
    })

    return articles.map((a) => ({
      id: a.id,
      section: {
        id: a.section.id,
        name: a.section.name,
        friendlyName: a.section.friendly_name,
      },
      providers: a.articles.map((art) => ({
        id: art.provider.id,
        name: art.provider.name,
        friendlyName: art.provider.friendly_name,
        newsUrl: art.news_url,
        logoUrl: art.provider.logo_url,
      })),
      keywords: a.keywords.map((k) => ({
        id: k.keyword.id,
        keyword: k.keyword.keyword,
      })),
      title: a.title,
      oneLineSummary: a.one_line_summary,
      fullSummary: a.full_summary,
      language: a.language,
      region: a.region ?? undefined,
      thumbnailUrl: a.thumbnail_url,
      createdAt: a.created_at,
      like: {
        isLiked: a.likes.length > 0,
        count: a._count.likes,
      },
      scrap: {
        isScraped: a.scraps.length > 0,
        count: a._count.scraps,
      },
    }))
  },

  getDetailedArticleById: async (id: number, userId: number): Promise<DetailedProcessedArticle> => {
    const article = await articleService.getDetailedArticlesByIds([id], userId)
    if (article.length === 0) {
      throw new ArticleNotFoundError(`Article with ID ${id} not found`)
    }
    return article[0]
  },

  /**
   * 특정 기사에 대한 사용자 이벤트를 저장합니다.
   * 이 함수는 사용자가 특정 기사에 대해 어떤 이벤트를 발생시켰는지 기록합니다.
   * @param userId - 이벤트를 발생시킨 사용자의 ID
   * @param articleId - 이벤트가 발생한 기사의 ID
   * @param eventType - 발생한 이벤트의 유형 (예: 'VIEW', 'DETAIL_VIEW' 등)
   * @return Promise<void> - 이벤트 저장이 완료되면 반환되는 프로미스
   * @example
   * // 사용자 1이 기사 2에 대해 조회 이벤트를 저장
   * storeArticleViewEvent(1, 2, 'VIEW')
   */
  storeArticleViewEvent: async (userId: number, articleId: number, eventType: ArticleViewEventType): Promise<void> => {
    await prisma.articleViewEvent.create({
      data: {
        user_id: userId,
        p_article_id: articleId,
        event_type: eventType,
      },
    })
  },

  /**
   * 특정 기사에 사용자가 좋아요를 추가합니다.
   * @param userId - 좋아요를 추가할 사용자의 ID
   * @param articleId - 좋아요를 추가할 기사의 ID
   * @return Promise<void> - 좋아요 추가가 완료되면 반환되는 프로미스
   * @example
   * // 사용자 1이 기사 2에 좋아요를 추가
   * addLikeToArticle(1, 2)
   */
  addLikeToArticle: async (userId: number, articleId: number): Promise<void> => {
    await prisma.like.create({
      data: {
        user_id: userId,
        p_article_id: articleId,
      },
    })
  },

  /**
   * 특정 기사에 사용자가 좋아요를 제거합니다.
   * @param userId - 좋아요를 제거할 사용자의 ID
   * @param articleId - 좋아요를 제거할 기사의 ID
   * @return Promise<void> - 좋아요 제거가 완료되면 반환되는 프로미스
   * @example
   * // 사용자 1이 기사 2에 좋아요를 제거
   * removeLikeFromArticle(1, 2)
   */
  removeLikeFromArticle: async (userId: number, articleId: number): Promise<void> => {
    await prisma.like.deleteMany({
      where: {
        user_id: userId,
        p_article_id: articleId,
      },
    })
  },

  /**
   * 특정 기사에 사용자가 스크랩을 추가합니다.
   * @param userId - 스크랩을 추가할 사용자의 ID
   * @param articleId - 스크랩을 추가할 기사의 ID
   * @return Promise<void> - 스크랩 추가가 완료되면 반환되는 프로미스
   * @example
   * // 사용자 1이 기사 2를 스크랩
   * scrapArticle(1, 2)
   */
  scrapArticle: async (userId: number, articleId: number): Promise<void> => {
    await prisma.scrap.create({
      data: {
        user_id: userId,
        p_article_id: articleId,
      },
    })
  },

  /**
   * 특정 기사에 대한 사용자의 스크랩을 제거합니다.
   * @param userId - 스크랩을 제거할 사용자의 ID
   * @param articleId - 스크랩을 제거할 기사의 ID
   * @return Promise<void> - 스크랩 제거가 완료되면 반환되는 프로미스
   * @example
   * // 사용자 1이 기사 2의 스크랩을 제거
   * unscrapArticle(1, 2)
   */
  unscrapArticle: async (userId: number, articleId: number): Promise<void> => {
    await prisma.scrap.deleteMany({
      where: {
        user_id: userId,
        p_article_id: articleId,
      },
    })
  },
}
