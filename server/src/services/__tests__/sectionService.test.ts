import { prismaMock } from '../../../prisma/mock'
import { sectionService, SectionNotFoundError } from '../sectionService'

describe('SectionService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getSections', () => {
    it('should return all sections', async () => {
      const mockSections = [
        { id: 1, name: 'politics' },
        { id: 2, name: 'economy' },
      ]

      ;(prismaMock.articleSection.findMany as jest.Mock).mockResolvedValue(mockSections)

      const sections = await sectionService.getSections()

      expect(prismaMock.articleSection.findMany).toHaveBeenCalled()
      expect(sections).toEqual(mockSections)
    })

    it('should throw SectionNotFoundError if no sections found', async () => {
      ;(prismaMock.articleSection.findMany as jest.Mock).mockResolvedValue([])
      await expect(sectionService.getSections()).rejects.toThrow(SectionNotFoundError)
    })
  })

  describe('getSectionById', () => {
    it('should return section by id', async () => {
      const mockSection = { id: 1, name: 'politics' }

      ;(prismaMock.articleSection.findUnique as jest.Mock).mockResolvedValue(mockSection)

      const section = await sectionService.getSectionById(1)

      expect(prismaMock.articleSection.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
      })
      expect(section).toEqual(mockSection)
    })

    it('should throw SectionNotFoundError if section not found', async () => {
      ;(prismaMock.articleSection.findUnique as jest.Mock).mockResolvedValue(null)
      await expect(sectionService.getSectionById(999)).rejects.toThrow(SectionNotFoundError)
    })
  })

  describe('createDefaultSectionPreferences', () => {
    it('should create default section preferences for user', async () => {
      const mockSections = [
        { id: 1, name: 'politics' },
        { id: 2, name: 'economy' },
      ]

      ;(prismaMock.articleSection.findMany as jest.Mock).mockResolvedValue(mockSections)

      await sectionService.createDefaultSectionPreferences(1)

      expect(prismaMock.userArticleSectionPreference.createMany).toHaveBeenCalledWith({
        data: [
          { user_id: 1, section_id: 1, preference: 1 },
          { user_id: 1, section_id: 2, preference: 1 },
        ],
      })
    })
  })

  describe('getSectionPreferencesByUserId', () => {
    it('should return section preferences for user', async () => {
      const preferences = [
        {
          user_id: 1,
          section_id: 1,
          preference: 1,
          section: { id: 1, name: 'politics' },
        },
        {
          user_id: 1,
          section_id: 2,
          preference: 1,
          section: { id: 2, name: 'economy' },
        },
      ]

      ;(prismaMock.userArticleSectionPreference.findMany as jest.Mock).mockResolvedValue(preferences)

      const result = await sectionService.getSectionPreferencesByUserId(1)
      expect(prismaMock.userArticleSectionPreference.findMany).toHaveBeenCalledWith({
        where: { user_id: 1 },
        include: { section: true },
      })
      expect(result).toEqual([
        { userId: 1, sectionId: 1, sectionName: 'politics', preference: 1 },
        { userId: 1, sectionId: 2, sectionName: 'economy', preference: 1 },
      ])
    })
  })

  describe('getUserSectionStats', () => {
    it('should return user section stats with calculated behavior scores', async () => {
      const mockData = [
        {
          id: 1,
          name: 'politics',
          user_article_section_preference: [{ preference: 3 }],
          p_articles: [
            {
              likes: [{ id: 1, user_id: 1 }],
              scraps: [
                { id: 1, user_id: 1 },
                { id: 2, user_id: 1 },
              ],
              ArticleViewEvent: [{ id: 1 }, { id: 2 }, { id: 3 }],
            },
            {
              likes: [],
              scraps: [],
              ArticleViewEvent: [],
            },
          ],
        },
        {
          id: 2,
          name: 'economy',
          user_article_section_preference: [], // 기본 선호도 1
          p_articles: [
            {
              likes: [{ id: 3, user_id: 1 }],
              scraps: [],
              ArticleViewEvent: [{ id: 4 }],
            },
          ],
        },
      ]

      // prismaMock.articleSection.findMany 모킹
      ;(prismaMock.articleSection.findMany as jest.Mock).mockResolvedValue(mockData)

      const result = await sectionService.getUserSectionStats(1)

      expect(prismaMock.articleSection.findMany).toHaveBeenCalledWith({
        include: {
          user_article_section_preference: {
            where: { user_id: 1 },
            select: { preference: true },
          },
          p_articles: {
            include: {
              likes: { where: { user_id: 1 } },
              scraps: { where: { user_id: 1 } },
              ArticleViewEvent: {
                where: { user_id: 1, event_type: 'DETAIL_VIEW' },
              },
            },
          },
        },
      })

      expect(result).toEqual([
        {
          sectionId: 1,
          sectionName: 'politics',
          preference: 3,
          // scrapCount = 2 → 2*5 = 10
          // likeCount = 1 → 1*3 = 3
          // detailViewCount = 3 → 3*2 = 6
          // 합계 = 10 + 3 + 6 = 19
          behaviorScore: 19,
        },
        {
          sectionId: 2,
          sectionName: 'economy',
          preference: 1, // 기본값
          // scrapCount = 0
          // likeCount = 1 → 3
          // detailViewCount = 1 → 2
          // 합계 = 0 + 3 + 2 = 5
          behaviorScore: 5,
        },
      ])
    })

    it('should handle empty sections and return empty array', async () => {
      ;(prismaMock.articleSection.findMany as jest.Mock).mockResolvedValue([])

      const result = await sectionService.getUserSectionStats(1)
      expect(result).toEqual([])
    })
  })
})
