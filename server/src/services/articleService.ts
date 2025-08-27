import { ArticleViewEventType, ProcessedArticle } from '@prisma/client'
import { prisma } from '../../prisma/prisma'
import {
  ArticleSimilarityRow,
  DetailedProcessedArticle,
  HighlightArticleCache,
  UserArticleCache,
} from '../types/article'
import { redisClient } from '../config/redis'
import { createCursor, decodeCursor } from '../utils/cursor'
import dayjs from 'dayjs'
import { bigqueryClient } from '../config/bigquery'

const RECOMMENDATION_CACHE_EXPIRATION = 3600 * 6 // 6시간
const HIGHLIGHT_CACHE_KEY = 'highlight-articles' // Redis에서 하이라이트 기사를 저장할 키
const HIGHLIGHT_CACHE_EXPIRATION = 3600 * 24 // 24 시간

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
   * 사용자 ID에 해당하는 추천 기사를 캐시에서 삭제합니다.
   * 이 함수는 Redis에서 추천 기사 정보를 제거합니다.
   * @param userId - 추천 기사를 캐시에서 삭제할 사용자의 ID
   * @return Promise<void> - 캐시 삭제가 완료되면 반환되는 프로미스
   * @example
   * // 사용자 1에 대한 추천 기사를 캐시에서 삭제
   *  clearCachedRecommendations(1)
   */
  clearCachedRecommendations: async (userId: number): Promise<void> => {
    const cacheKey = `recommendations:${userId}`
    await redisClient.del(cacheKey)
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
    if (candidateArticleIds.length === 0) {
      return []
    }

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
    if (rows.length === 0) {
      return candidateArticleIds // 결과 값이 없는 경우 Fallback으로 후보 기사 IDs를 반환합니다.
    }
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

    if (newCache.articleIds.length > 0) {
      await articleService.setCachedRecommendations(userId, newCache)
    }

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
   * 사용자의 추천 기사 ID를 조회합니다.
   * 이 함수는 캐시된 추천 기사를 조회하고, 없으면 사용자 캐시를 재생성합니다.
   * @param userId - 추천 기사를 조회할 사용자의 ID
   * @return Promise<number[]> - 추천 기사 ID 배열
   * @example
   * // 사용자 1의 추천 기사 ID를 조회
   * fetchRecommendedArticleIds(1)
   */
  fetchRecommendedArticleIds: async (userId: number): Promise<number[]> => {
    const cached = await articleService.getCachedRecommendations(userId)

    if (cached) {
      return cached.articleIds
    }

    // 캐시가 없으면 사용자 캐시를 재생성합니다.
    const newCache = await articleService.regenerateUserCache(userId)
    return newCache.articleIds
  },

  /**
   * 사용자가 스크랩한 기사 ID를 조회합니다.
   * @param userId - 스크랩한 기사를 조회할 사용자의 ID
   * @return Promise<number[]> - 스크랩한 기사 ID 배열
   * @example
   * // 사용자 1이 스크랩한 기사 ID를 조회
   * fetchScrapedArticleIds(1)
   */
  fetchScrapedArticleIds: async (userId: number): Promise<number[]> => {
    const scraped = await prisma.processedArticle.findMany({
      where: {
        scraps: { some: { user_id: userId } },
      },
      select: { id: true },
    })
    return scraped.map((a) => a.id)
  },

  /**
   * 사용자가 좋아요한 기사 ID를 조회합니다.
   * @param userId - 좋아요한 기사를 조회할 사용자의 ID
   * @return Promise<number[]> - 좋아요한 기사 ID 배열
   * @example
   * // 사용자 1이 좋아요한 기사 ID를 조회
   * fetchLikedArticleIds(1)
   */
  fetchLikedArticleIds: async (userId: number): Promise<number[]> => {
    const liked = await prisma.processedArticle.findMany({
      where: {
        likes: { some: { user_id: userId } },
      },
      select: { id: true },
    })
    return liked.map((a) => a.id)
  },

  /**
   * 하이라이트 기사 ID를 조회합니다.
   * Redis에 캐싱 데이터가 있는지 먼저 확인하고, 없는 경우 캐시를 업데이트합니다.
   * @return Promise<number[]> - 하이라이트 기사 ID 배열
   */
  fetchHighlightedArticleIds: async (): Promise<number[]> => {
    const cached = await redisClient.get(HIGHLIGHT_CACHE_KEY)

    if (cached) {
      const data = JSON.parse(cached) as HighlightArticleCache
      return data.articleIds
    }

    // 캐시가 없으면 하이라이트 기사를 업데이트합니다.
    const yesterday = dayjs().subtract(1, 'day').startOf('day').toDate()
    const highlightArticles: HighlightArticleCache = await articleService.updateHighlightArticles(yesterday)
    return highlightArticles.articleIds
  },

  /**
   * 추천된 기사들을 커서 페이지네이션으로 조회합니다.
   * 이 함수는 사용자의 추천 기사 ID를 가져와 커서와 한계에 따라 결과를 반환합니다.
   * @param userId - 추천 기사를 조회할 사용자의 ID
   * @param limit - 한 번에 조회할 기사 수
   * @param cursor - 다음 페이지를 조회하기 위한 커서 (Optional)
   * @return Promise<ArticleCursorPaginationResult> - 커서 페이지네이션 결과
   * @example
   * // 사용자 1의 추천 기사를 커서 10개씩 조회
   *  getRecommendedArticlesByCursor(1, 10, 'cursorString')
   */
  getRecommendedArticlesByCursor: async (
    userId: number,
    limit: number,
    cursor?: string,
  ): Promise<ArticleCursorPaginationResult> => {
    const articleIds = await articleService.fetchRecommendedArticleIds(userId)
    return articleService.getArticlesByCursor(articleIds, userId, limit, cursor)
  },

  /**
   * 사용자가 스크랩한 기사들을 커서 페이지네이션으로 조회합니다.
   * 이 함수는 사용자의 스크랩한 기사 ID를 가져와 커서와 한계에 따라 결과를 반환합니다.
   * @param userId - 스크랩한 기사를 조회할 사용자의 ID
   * @param limit - 한 번에 조회할 기사 수
   * @param cursor - 다음 페이지를 조회하기 위한 커서 (Optional)
   * @return Promise<ArticleCursorPaginationResult> - 커서 페이지네이션 결과
   * @example
   * // 사용자 1의 스크랩한 기사를 커서 10개씩 조회
   *  getScrapedArticlesByCursor(1, 10, 'cursorString')
   */
  getScrapedArticlesByCursor: async (
    userId: number,
    limit: number,
    cursor?: string,
  ): Promise<ArticleCursorPaginationResult> => {
    const articleIds = await articleService.fetchScrapedArticleIds(userId)
    return articleService.getArticlesByCursor(articleIds, userId, limit, cursor)
  },

  /**
   * 사용자가 좋아요한 기사들을 커서 페이지네이션으로 조회합니다.
   * 이 함수는 사용자의 좋아요한 기사 ID를 가져와 커서와 한계에 따라 결과를 반환합니다.
   * @param userId - 좋아요한 기사를 조회할 사용자의 ID
   * @param limit - 한 번에 조회할 기사 수
   * @param cursor - 다음 페이지를 조회하기 위한 커서 (Optional)
   * @return Promise<ArticleCursorPaginationResult> - 커서 페이지네이션 결과
   * @example
   * // 사용자 1의 좋아요한 기사를 커서 10개씩 조회
   *  getLikedArticlesByCursor(1, 10, 'cursorString')
   */
  getLikedArticlesByCursor: async (
    userId: number,
    limit: number,
    cursor?: string,
  ): Promise<ArticleCursorPaginationResult> => {
    const articleIds = await articleService.fetchLikedArticleIds(userId)
    return articleService.getArticlesByCursor(articleIds, userId, limit, cursor)
  },

  /**
   * 하이라이트 기사들을 커서 페이지네이션으로 조회합니다.
   * 이 함수는 하이라이트 기사 ID를 가져와 커서와 한계에 따라 결과를 반환합니다.
   * @param userId - 요청 사용자 ID
   * @param limit - 한 번에 조회할 기사 수
   * @param cursor - 다음 페이지를 조회하기 위한 커서 (Optional)
   * @return Promise<ArticleCursorPaginationResult> - 커서 페이지네이션 결과
   */
  getHighlightArticlesByCursor: async (
    userId: number,
    limit: number,
    cursor?: string,
  ): Promise<ArticleCursorPaginationResult> => {
    const articleIds = await articleService.fetchHighlightedArticleIds()
    return articleService.getArticlesByCursor(articleIds, userId, limit, cursor)
  },

  /**
   * 커서 페이지네이션을 사용하여 기사를 조회합니다.
   * 이 함수는 주어진 ID 배열에서 기사를 가져오고, 커서와 한계에 따라 결과를 반환합니다.
   * @param fetchIdsFn - ID를 가져오는 함수
   * @param userId - 사용자의 ID (좋아요/스크랩 여부 확인용)
   * @param limit - 한 번에 조회할 기사 수
   * @param cursor - 다음 페이지를 조회하기 위한 커서 (Optional)
   * @return Promise<ArticleCursorPaginationResult> - 커서 페이지네이션 결과
   * @example
   * // 특정 ID의 기사를 커서 10개씩 조회
   * getArticlesByCursor(() => Promise.resolve([1, 2, 3]), 1, 10, 'cursorString')
   */
  getArticlesByCursor: async (
    articleIds: number[],
    userId: number,
    limit: number,
    cursor?: string,
  ): Promise<ArticleCursorPaginationResult> => {
    let cursorIdx = 0
    if (cursor) {
      const decodedCursor = decodeCursor(cursor)
      cursorIdx = decodedCursor.idx
    }

    const allArticles = await articleService.getDetailedArticlesByIds(articleIds, userId)

    const articles = allArticles.slice(cursorIdx, cursorIdx + limit)

    if (articles.length === 0) {
      throw new ArticleNotFoundError('No articles found for the given cursor and limit')
    }

    const nextIdx = cursorIdx + limit
    const hasNext = nextIdx < allArticles.length
    const nextCursor = hasNext ? createCursor(nextIdx) : undefined

    return {
      data: articles,
      hasNext: hasNext,
      nextCursor: nextCursor,
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
   * 특정 ID의 기사들을 상세하게 조회합니다. (순서 보장)
   * 이 함수는 기사 ID 배열을 받아 해당 기사들의 상세 정보를 `ids`와 동일한 순서로 반환합니다.
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
            title: true,
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

    // 원본 `ids` 배열의 순서를 기준으로 정렬합니다.
    // DB에 해당 ID의 기사가 없는 경우 undefined일 수 있으므로 필터링합니다.
    const articleMap = new Map(articles.map((a) => [a.id, a]))
    const sortedArticles = ids.map((id) => articleMap.get(id)).filter((a) => a !== undefined)

    return sortedArticles.map((a) => ({
      id: a.id,
      section: {
        id: a.section.id,
        name: a.section.name,
        friendlyName: a.section.friendly_name,
      },
      providers: a.articles.map((art) => ({
        id: art.provider.id,
        title: art.title,
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

  /**
   * 하이라이트 기사를 업데이트합니다.
   * 이 함수는 최근 생성된 기사들을 분석하여 하이라이트 기사를 결정하고 Redis에 캐싱합니다.
   * @param fromDate - 하이라이트 뉴스가 될 후보 뉴스의 시작 날짜
   * @param numArticles - 업데이트할 하이라이트 기사 수 (기본값: 15)
   * @return Promise<void> - 하이라이트 기사 업데이트가 완료되면 반환되는 프로미스
   * @example
   * // 최근 7일 이내의 기사를 기준으로 하이라이트 기사 업데이트
   * updateHighlightArticles(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
   */
  updateHighlightArticles: async (fromDate: Date, numArticles: number = 15): Promise<HighlightArticleCache> => {
    const articles = await prisma.processedArticle.findMany({
      include: {
        likes: true,
        scraps: true,
        ArticleViewEvent: true,
        articles: { select: { provider: true } },
      },
      where: { created_at: { gte: fromDate.toISOString() } },
    })

    // 기사의 점수를 계산합니다.
    // 스크랩 수 * 5 + 좋아요 수 * 3 + 상세 조회 수 * 2 + 제공자 수 * 2
    const articleScores = articles.map((article) => {
      const scrapScore = article.scraps.length * 5
      const likeScore = article.likes.length * 3
      const detailViewScore = article.ArticleViewEvent.length * 2

      const providerCount = new Set(article.articles.map((a) => a.provider.id)).size
      const providerCountScore = providerCount * 2

      return {
        ...article,
        score: scrapScore + likeScore + detailViewScore + providerCountScore,
      }
    })

    const topArticles = articleScores.sort((a, b) => b.score - a.score).slice(0, numArticles)
    const highlightArticleCache: HighlightArticleCache = {
      articleIds: topArticles.map((a) => a.id),
      lastUpdated: dayjs().toDate(),
    }

    if (highlightArticleCache.articleIds.length > 0) {
      redisClient.setEx(HIGHLIGHT_CACHE_KEY, HIGHLIGHT_CACHE_EXPIRATION, JSON.stringify(highlightArticleCache))
    }

    return highlightArticleCache
  },
}
