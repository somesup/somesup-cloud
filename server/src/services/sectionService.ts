import { ArticleSection, UserArticleSectionPreference } from '@prisma/client'
import { prisma } from '../../prisma/prisma'

/**
 * 특정 섹션을 찾지 못했을 때 발생하는 오류 클래스입니다.
 * 이 오류는 섹션이 존재하지 않을 때 사용됩니다.
 */
export class SectionNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SectionNotFoundError'
  }
}

/**
 * 섹션 관련 데이터베이스 작업을 처리하는 서비스 객체입니다.
 */
export const sectionService = {
  /**
   * 모든 섹션을 조회합니다.
   * @returns {Promise<ArticleSection[]>} - 데이터베이스에 저장된 모든 섹션의 배열
   * @throws {SectionNotFoundError} - 섹션이 존재하지 않을 경우 발생
   */
  getSections: async (): Promise<ArticleSection[]> => {
    const sections = await prisma.articleSection.findMany()

    if (sections.length === 0) {
      throw new SectionNotFoundError('Sections not found')
    }

    return sections
  },

  /**
   * 특정 ID의 섹션을 조회합니다.
   * @param {number} id - 조회할 섹션의 ID
   * @returns {Promise<ArticleSection>} - 해당 ID의 섹션 객체
   * @throws {SectionNotFoundError} - 섹션이 존재하지 않을 경우 발생
   */
  getSectionById: async (id: number): Promise<ArticleSection> => {
    const section = await prisma.articleSection.findUnique({
      where: { id },
    })

    if (!section) {
      throw new SectionNotFoundError('Section not found')
    }

    return section
  },

  /**
   * 사용자의 섹션 선호도를 업데이트합니다.
   * @param {number} userId - 사용자의 ID
   * @returns {Promise<void>} - 업데이트된 섹션 선호도
   */
  createDefaultSectionPreferences: async (userId: number): Promise<void> => {
    const sections = await prisma.articleSection.findMany()
    const defaultSectionPrefs = sections.map((section) => ({
      section_id: section.id,
    }))

    await prisma.userArticleSectionPreference.createMany({
      data: defaultSectionPrefs.map((pref) => ({
        user_id: userId,
        section_id: pref.section_id,
        preference: 1, // 기본 선호도는 1로 설정
      })),
    })
  },

  /**
   * 사용자의 섹션 선호도를 업데이트합니다.
   * @param {number} userId - 사용자의 ID
   * @returns {Promise<UserArticleSectionPreference[]>} - 업데이트된 사용자 섹션 선호도 배열
   */
  getSectionPreferencesByUserId: async (userId: number): Promise<UserArticleSectionPreference[]> => {
    const preferences = await prisma.userArticleSectionPreference.findMany({
      where: { user_id: userId },
      include: {
        section: true,
      },
    })

    return preferences.map((pref) => {
      const { section, ...rest } = pref
      return {
        ...rest,
        section_name: section.name,
      }
    })
  },
}
