import { prisma } from '../../prisma/prisma'
import { KeywordCount } from '../types/keyword'

export const keywordService = {
  /**
   * 사용자가 상호작용한 기사에서 키워드 통계를 가져옵니다.
   * @param {number} userId - 사용자의 ID
   * @returns {Promise<KeywordCount[]>} - 키워드 통계 배열
   */
  getKeywordstats: async (userId: number): Promise<KeywordCount[]> => {
    const interactedArticles = await prisma.processedArticle.findMany({
      where: {
        OR: [
          { likes: { some: { user_id: userId } } },
          { scraps: { some: { user_id: userId } } },
          { ArticleViewEvent: { some: { user_id: userId } } },
        ],
      },
      include: {
        keywords: { select: { keyword: true } },
      },
    })

    const keywordCountMap = new Map<string, number>()

    interactedArticles.forEach((article) => {
      article.keywords.forEach((km) => {
        const key = km.keyword.keyword
        keywordCountMap.set(key, (keywordCountMap.get(key) || 0) + 1)
      })
    })

    const keywordStats: KeywordCount[] = Array.from(keywordCountMap.entries()).map(([keyword, count]) => ({
      keyword,
      count,
    }))

    return keywordStats.sort((a, b) => b.count - a.count)
  },
}
