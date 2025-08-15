import { ArticleSection } from '@prisma/client'
import { prisma } from '../../prisma/prisma'
import { UserSectionPreference, UserSectionStat } from '../types/section'

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
   * 사용자의 섹션 선호도를 조회합니다.
   * @param {number} userId - 사용자의 ID
   * @returns {Promise<UserSectionPreference[]>} - 사용자의 섹션 선호도 배열
   */
  getSectionPreferencesByUserId: async (userId: number): Promise<UserSectionPreference[]> => {
    const preferences = await prisma.userArticleSectionPreference.findMany({
      where: { user_id: userId },
      include: {
        section: true,
      },
    })

    return preferences.map((pref) => ({
      userId: pref.user_id,
      sectionId: pref.section_id,
      sectionName: pref.section.name,
      preference: pref.preference,
    }))
  },

  /**
   * 사용자의 섹션 통계 정보를 조회합니다.
   * 각 섹션에 대한 선호도와 행동 점수를 포함합니다.
   * @param {number} userId - 사용자의 ID
   * @returns {Promise<UserSectionStat[]>} - 사용자의 섹션 통계 정보 배열
   */
  getUserSectionStats: async (userId: number): Promise<UserSectionStat[]> => {
    const sectionStats = await prisma.articleSection.findMany({
      include: {
        user_article_section_preference: {
          where: { user_id: userId },
          select: { preference: true },
        },
        p_articles: {
          include: {
            likes: { where: { user_id: userId } },
            scraps: { where: { user_id: userId } },
            ArticleViewEvent: { where: { user_id: userId, event_type: 'DETAIL_VIEW' } },
          },
        },
      },
    })

    const sectionScores = sectionStats.map((section) => {
      const likeCount = section.p_articles.reduce((sum, a) => sum + a.likes.length, 0)
      const scrapCount = section.p_articles.reduce((sum, a) => sum + a.scraps.length, 0)
      const detailViewCount = section.p_articles.reduce((sum, a) => sum + a.ArticleViewEvent.length, 0)

      const behaviorScore = scrapCount * 5 + likeCount * 3 + detailViewCount * 2

      return {
        sectionId: section.id,
        sectionName: section.name,
        preference: section.user_article_section_preference[0]?.preference || 1, // 기본 선호도는 1
        behaviorScore: behaviorScore,
      }
    })

    const rawBehaviorScores = sectionScores.map((s) => s.behaviorScore)
    const minBehaviorScores = Math.min(...rawBehaviorScores)
    const maxBehaviorScores = Math.max(...rawBehaviorScores)

    // 행동 점수를 1에서 3 사이로 정규화
    const normalizedScores = sectionScores.map((s) => {
      let normalized = 1
      if (maxBehaviorScores !== minBehaviorScores) {
        normalized = 1 + ((s.behaviorScore - minBehaviorScores) / (maxBehaviorScores - minBehaviorScores)) * (3 - 1)
      }
      return {
        ...s,
        behaviorScore: parseFloat(normalized.toFixed(2)),
      }
    })

    return normalizedScores.map((score) => ({
      sectionId: score.sectionId,
      sectionName: score.sectionName,
      preference: score.preference,
      behaviorScore: score.behaviorScore,
    }))
  },
}
