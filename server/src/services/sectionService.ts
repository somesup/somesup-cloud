import { ArticleSection } from '@prisma/client'
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
}
