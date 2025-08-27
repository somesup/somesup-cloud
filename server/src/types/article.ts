import { SectionType } from '@prisma/client'

/**
 * 사용자별 추천 기사를 캐싱하는 인터페이스입니다.
 */
export interface UserArticleCache {
  articleIds: number[]
  lastUpdated: Date
}

/**
 * 하이라이트 기사 캐싱을 위한 인터페이스입니다.
 */
export interface HighlightArticleCache {
  articleIds: number[]
  lastUpdated: Date
}

/**
 * BigQuery에서 반환되는 기사 유사도 결과 인터페이스입니다.
 */
export interface ArticleSimilarityRow {
  p_article_id: number
}

/**
 * 기사 섹션 정보를 나타내는 인터페이스입니다.
 */
export interface ArticleSection {
  id: number
  name: SectionType
  friendlyName: string
}

/**
 * 기사 제공자(뉴스사) 정보를 나타내는 인터페이스입니다.
 */
export interface ArticleProvider {
  id: number
  name: string
  title: string
  friendlyName: string
  newsUrl: string
  logoUrl: string
}

/**
 * 기사 키워드 정보를 나타내는 인터페이스입니다.
 */
export interface ArticleKeyword {
  id: number
  keyword: string
}

/**
 * 기사의 좋아요 정보를 나타내는 인터페이스입니다.
 */
export interface ArticleLikeInfo {
  isLiked: boolean
  count: number
}

/**
 * 기사의 스크랩 정보를 나타내는 인터페이스입니다.
 */
export interface ArticleScrapInfo {
  isScraped: boolean
  count: number
}

/**
 * 메인 화면에서 보여지는 뉴스 데이터를 나타내는 인터페이스입니다.
 * ProcessedArticle의 기본 정보와 관련 엔티티들을 포함합니다.
 */
export interface DetailedProcessedArticle {
  id: number
  section: ArticleSection
  providers: ArticleProvider[]
  keywords: ArticleKeyword[]
  title: string
  oneLineSummary: string
  fullSummary: string
  language: string
  region?: string
  thumbnailUrl: string
  createdAt: Date
  like: ArticleLikeInfo
  scrap: ArticleScrapInfo
}
