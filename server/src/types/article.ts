/**
 * 사용자별 추천 기사를 캐싱하는 인터페이스입니다.
 */
export interface UserArticleCache {
  articleIds: number[]
  lastUpdated: Date
}

export interface ArticleSimilarityRow {
  p_article_id: number
}
