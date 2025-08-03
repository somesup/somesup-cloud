import { prisma } from '../../prisma/prisma'
import { User, UserArticleSectionPreference } from '@prisma/client'
import { UpdateUserRequest, UserSectionPreference } from '../types/user'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'

export class UserNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UserNotFoundError'
  }
}

/**
 * 사용자 관련 데이터베이스 작업을 처리하는 서비스 객체입니다.
 * 사용자 조회, 생성, 닉네임 중복 확인, 닉네임 변경 기능을 제공합니다.
 */
export const userService = {
  /**
   * 휴대폰 번호로 사용자를 조회합니다.
   *
   * @async
   * @param {string} phoneNumber - 조회할 사용자의 휴대폰 번호
   * @returns {Promise<User | null>} 해당 번호의 사용자 객체 또는 null
   */
  findUserByPhone: async (phoneNumber: string): Promise<User | null> => {
    const user = await prisma.user.findUnique({
      where: { phone: phoneNumber },
    })
    return user
  },

  /**
   * 사용자 ID로 사용자를 조회합니다.
   *
   * @async
   * @param {number} userId - 조회할 사용자의 ID
   * @returns {Promise<User | null>} 해당 ID의 사용자 객체 또는 null
   */
  findUserById: async (userId: number): Promise<User | null> => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    })
    return user
  },

  /**
   * 새로운 사용자를 생성합니다.
   * 기본적으로 현재 존재하는 Section들에 대한 선호도를 Default 선호도로 설정합니다.
   *
   * @async
   * @param {string} phoneNumber - 생성할 사용자의 휴대폰 번호
   * @param {string} nickname - 생성할 사용자의 닉네임
   * @param {boolean} isAuthenticated - 인증 여부
   * @returns {Promise<User>} 생성된 사용자 객체
   */
  createUser: async (phoneNumber: string, nickname: string, isAuthenticated: boolean): Promise<User> => {
    const user = await prisma.user.create({
      data: {
        phone: phoneNumber,
        nickname,
        is_authenticated: isAuthenticated,
      },
    })

    return user
  },

  /**
   * 닉네임이 이미 존재하는지 확인합니다.
   *
   * @async
   * @param {string} nickname - 중복 확인할 닉네임
   * @returns {Promise<boolean>} 닉네임 존재 여부 (true: 존재함, false: 존재하지 않음)
   */
  checkNicknameExists: async (nickname: string): Promise<boolean> => {
    const user = await prisma.user.findUnique({
      where: { nickname },
    })
    return !!user
  },

  /**
   * 사용자의 닉네임을 변경합니다.
   *
   * @async
   * @param {number} userId - 닉네임을 변경할 사용자의 ID
   * @param {string} nickname - 변경할 닉네임
   * @returns {Promise<User>} 닉네임이 변경된 사용자 객체
   */
  updateUserNickname: async (userId: number, nickname: string): Promise<User> => {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { nickname },
    })
    return user
  },

  /**
   * 사용자의 정보를 업데이트합니다.
   *
   * @async
   * @param {number} userId - 정보를 업데이트할 사용자의 ID
   * @param {UpdateUserRequest} updateInfo - 업데이트할 사용자 정보
   * @returns {Promise<User>} 업데이트된 사용자 객체
   */
  updateUserInfo: async (userId: number, updateInfo: UpdateUserRequest): Promise<User> => {
    try {
      const user = await prisma.user.update({
        where: { id: userId },
        data: updateInfo,
      })
      return user
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new UserNotFoundError(`User with ID ${userId} not found`)
      }
      throw new Error('Failed to update user information')
    }
  },

  /**
   * 사용자의 섹션 선호도를 업데이트합니다.
   * 중복된 sectionId를 제거하고 유효한 sectionId만 필터링하여 업데이트합니다.
   * 이 작업은 병렬로 실행되어 성능을 최적화합니다.
   * @param {number} userId - 섹션 선호도를 업데이트할 사용자의 ID
   * @param {UserSectionPreference[]} preferences - 업데이트할 섹션 선호도 배열
   * @returns {Promise<UserArticleSectionPreference[]>} 업데이트된 사용자 섹션 선호도 배열
   * @throws {Error} - 섹션 선호도 업데이트 실패 시 오류 발생
   */
  updateUserSectionPreferences: async (
    userId: number,
    preferences: UserSectionPreference[],
  ): Promise<UserArticleSectionPreference[]> => {
    try {
      // 중복된 sectionId를 제거하고 유효한 sectionId만 필터링합니다.
      const sectionIds = [...new Set(preferences.map((pref) => pref.sectionId))]
      const validSectionIds = await prisma.articleSection
        .findMany({
          where: {
            id: { in: sectionIds },
          },
          select: { id: true },
        })
        .then((sections) => sections.map((section) => section.id))

      const upsertPromises = preferences
        .filter((p) => validSectionIds.includes(p.sectionId))
        .map((pref) => {
          return prisma.userArticleSectionPreference.upsert({
            where: {
              user_id_section_id: {
                user_id: userId,
                section_id: pref.sectionId,
              },
            },
            update: { preference: pref.preference },
            create: {
              user_id: userId,
              section_id: pref.sectionId,
              preference: pref.preference,
            },
          })
        })

      // 모든 upsert 작업을 병렬로 실행합니다.
      await Promise.all(upsertPromises)

      // 업데이트된 사용자 섹션 선호도를 반환합니다.
      return prisma.userArticleSectionPreference.findMany({
        where: { user_id: userId },
      })
    } catch (error) {
      throw new Error('Failed to update user section preferences')
    }
  },
}
