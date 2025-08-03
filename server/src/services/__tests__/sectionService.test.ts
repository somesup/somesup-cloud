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
      { user_id: 1, section_id: 1, preference: 1, section_name: 'politics' },
      { user_id: 1, section_id: 2, preference: 1, section_name: 'economy' },
    ])
  })
})
