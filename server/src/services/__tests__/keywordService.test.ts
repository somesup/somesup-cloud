import { prismaMock } from '../../../prisma/mock'
import { keywordService } from '../keywordService'

describe('KeywordService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getKeywordStats', () => {
    it('should return keyword stats', async () => {
      const mockUserId = 1
      const mockArticles = [
        {
          keywords: [{ keyword: { keyword: 'test' } }],
        },
        {
          keywords: [{ keyword: { keyword: 'test' } }, { keyword: { keyword: 'example' } }],
        },
      ]

      ;(prismaMock.processedArticle.findMany as jest.Mock).mockResolvedValue(mockArticles)

      const result = await keywordService.getKeywordstats(mockUserId)

      expect(result).toEqual([
        { keyword: 'test', count: 2 },
        { keyword: 'example', count: 1 },
      ])
    })

    it('should return empty array when no articles found', async () => {
      const mockUserId = 1

      ;(prismaMock.processedArticle.findMany as jest.Mock).mockResolvedValue([])

      const result = await keywordService.getKeywordstats(mockUserId)

      expect(result).toEqual([])
    })
  })
})
