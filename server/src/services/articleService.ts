import { ArticleViewEventType, ProcessedArticle } from '@prisma/client'
import { prisma } from '../../prisma/prisma'
import { createCursor, decodeCursor } from '../utils/cursor'
import dayjs from 'dayjs'

/**
 * 커서 페이지네이션을 사용하여 기사를 조회하는 결과 형식입니다.
 */
export interface ArticleCursorPaginationResult {
  data: ProcessedArticle[]
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
   * Cursor 페이지네이션을 사용하여 기사를 조회합니다.
   * 이 함수는 주어진 limit와 cursor를 사용하여 기사를 조회하고, 다음 커서를 반환합니다.
   * 만약 cursor가 주어지지 않으면, 기본적으로 24시간 이전의 기사를 조회합니다.
   * @param limit - 조회할 기사 수의 제한
   * @param cursor - 다음 페이지를 위한 커서 (선택적)
   * @return ArticleCursorPaginationResult - 조회된 기사와 다음 커서 정보
   * @example
   * // 커서 페이지네이션을 사용하여 기사를 조회
   * getArticlesByCursor(10, 'eyJjcmVhdGVkQXQiOiIyMDIzLTA5LTIxVDEyOjAwOjAwLjAwMFoiLCJpZCI6MX0=')
   * // 반환값: { data: [...], hasNext: true, nextCursor: 'eyJj...' }
   */
  getArticlesByCursor: async (limit: number, cursor?: string): Promise<ArticleCursorPaginationResult> => {
    let createdAt: Date
    let id: number

    if (cursor) {
      const decodedCursor = decodeCursor(cursor)
      createdAt = decodedCursor.createdAt
      id = decodedCursor.id
    } else {
      // cursor가 존재하지 않는 경우 24시간 이전으로 설정
      createdAt = dayjs().subtract(24, 'hour').toDate()
      id = Number.MIN_SAFE_INTEGER
    }

    const articles = await prisma.processedArticle.findMany({
      where: {
        OR: [{ created_at: { gt: createdAt } }, { created_at: createdAt, id: { gt: id } }],
      },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    })

    const hasNext = articles.length > limit
    const data = hasNext ? articles.slice(0, -1) : articles

    let nextCursor: string | undefined
    if (hasNext && data.length > 0) {
      const lastArticle = data[data.length - 1]
      nextCursor = createCursor(lastArticle.created_at, lastArticle.id)
    }

    return {
      data,
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
