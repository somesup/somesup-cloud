import { prisma } from '../../prisma/prisma'
import { User } from '@prisma/client'
import { UpdateUserRequest } from '../controllers/userController'

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
        nickname: nickname,
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
    const user = await prisma.user.update({
      where: { id: userId },
      data: updateInfo,
    })
    return user
  },
}
