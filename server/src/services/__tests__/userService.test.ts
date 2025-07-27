import { UserNotFoundError, userService } from '../userService'
import { prismaMock } from '../../../prisma/mock'
import { User, ArticleSection } from '@prisma/client'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { UserSectionPreference } from '../../types/user'

describe('userService', () => {
  const mockUser: User = {
    id: 1,
    phone: '01012345678',
    nickname: '테스터',
    is_authenticated: true,
    created_at: new Date(),
    updated_at: new Date(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('findUserByPhone', () => {
    it('should return user if found', async () => {
      ;(prismaMock.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
      const result = await userService.findUserByPhone('01012345678')

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { phone: '01012345678' },
      })
      expect(result).toEqual(mockUser)
    })

    it('should return null if user not found', async () => {
      ;(prismaMock.user.findUnique as jest.Mock).mockResolvedValue(null)
      const result = await userService.findUserByPhone('01000000000')

      expect(result).toBeNull()
    })
  })

  describe('findUserById', () => {
    it('should return user if found by id', async () => {
      ;(prismaMock.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
      const result = await userService.findUserById(1)

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
      })
      expect(result).toEqual(mockUser)
    })

    it('should return null if user with id not found', async () => {
      ;(prismaMock.user.findUnique as jest.Mock).mockResolvedValue(null)
      const result = await userService.findUserById(999)

      expect(result).toBeNull()
    })
  })

  describe('createUser', () => {
    it('should create and return new user', async () => {
      const createdUser = { ...mockUser, id: 2 }
      ;(prismaMock.user.create as jest.Mock).mockResolvedValue(createdUser)
      ;(prismaMock.articleSection.findMany as jest.Mock).mockResolvedValue([])

      const result = await userService.createUser('01087654321', '새유저', true)

      expect(prismaMock.user.create).toHaveBeenCalledWith({
        data: {
          phone: '01087654321',
          nickname: '새유저',
          is_authenticated: true,
          user_article_section_preference: {
            create: [],
          },
        },
        include: {
          user_article_section_preference: true,
        },
      })
      expect(result).toEqual(createdUser)
    })

    it('should create default section preferences for new user', async () => {
      const sections = [
        { id: 1, name: 'politics' },
        { id: 2, name: 'economy' },
      ]
      ;(prismaMock.articleSection.findMany as jest.Mock).mockResolvedValue(sections)

      const createdUser = { ...mockUser, id: 2 }
      ;(prismaMock.user.create as jest.Mock).mockResolvedValue(createdUser)

      await userService.createUser('01087654321', '새유저', true)

      expect(prismaMock.user.create).toHaveBeenCalledWith({
        data: {
          phone: '01087654321',
          nickname: '새유저',
          is_authenticated: true,
          user_article_section_preference: {
            create: sections.map((section) => ({ section_id: section.id })),
          },
        },
        include: {
          user_article_section_preference: true,
        },
      })
    })
  })

  describe('checkNicknameExists', () => {
    it('should return true if nickname exists', async () => {
      ;(prismaMock.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
      const result = await userService.checkNicknameExists('테스터')
      expect(result).toBe(true)
    })

    it('should return false if nickname does not exist', async () => {
      ;(prismaMock.user.findUnique as jest.Mock).mockResolvedValue(null)
      const result = await userService.checkNicknameExists('없는닉네임')
      expect(result).toBe(false)
    })
  })

  describe('updateUserNickname', () => {
    it('should update nickname and return updated user', async () => {
      const updatedUser = { ...mockUser, nickname: '변경된 닉네임' }
      ;(prismaMock.user.update as jest.Mock).mockResolvedValue(updatedUser)

      const result = await userService.updateUserNickname(1, '변경된 닉네임')

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { nickname: '변경된 닉네임' },
      })
      expect(result).toEqual(updatedUser)
    })
  })

  describe('updateUserInfo', () => {
    it('should update user info and return updated user', async () => {
      const updateData = { nickname: '새로운 닉네임' }
      const updatedUser = { ...mockUser, nickname: '새로운 닉네임' }

      ;(prismaMock.user.update as jest.Mock).mockResolvedValue(updatedUser)

      const result = await userService.updateUserInfo(1, updateData)

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: updateData,
      })
      expect(result).toEqual(updatedUser)
    })
  })

  it('should throw UserNotFoundError if user not found', async () => {
    const error = new PrismaClientKnownRequestError('Not Found', {
      code: 'P2025',
      clientVersion: '4.0.0',
      meta: { target: ['id'] },
    })
    ;(prismaMock.user.update as jest.Mock).mockRejectedValue(error)

    await expect(userService.updateUserInfo(999, { nickname: '새닉네임' })).rejects.toThrow(UserNotFoundError)
  })

  it('should throw generic error on other Prisma errors', async () => {
    const error = new Error('Database error')
    ;(prismaMock.user.update as jest.Mock).mockRejectedValue(error)

    await expect(userService.updateUserInfo(1, { nickname: '새닉네임' })).rejects.toThrow(
      'Failed to update user information',
    )
  })

  describe('updateUserSectionPreferences', () => {
    it('should return immediately if preferences are empty', async () => {
      const preferences: UserSectionPreference[] = []

      await expect(userService.updateUserSectionPreferences(1, preferences)).resolves.toBeUndefined()
      expect(prismaMock.articleSection.findMany).not.toHaveBeenCalled()
      expect(prismaMock.userArticleSectionPreference.upsert).not.toHaveBeenCalled()
    })

    it('should upsert user section preferences', async () => {
      const preferences: UserSectionPreference[] = [
        { sectionId: 1, preference: 1 },
        { sectionId: 2, preference: 2 },
      ]
      const sections: ArticleSection[] = [
        { id: 1, name: 'politics' },
        { id: 2, name: 'economy' },
      ]

      ;(prismaMock.articleSection.findMany as jest.Mock).mockResolvedValue(sections)
      ;(prismaMock.userArticleSectionPreference.upsert as jest.Mock).mockResolvedValue(undefined)

      await userService.updateUserSectionPreferences(1, preferences)
      expect(prismaMock.articleSection.findMany).toHaveBeenCalledWith({
        where: { id: { in: [1, 2] } },
        select: { id: true },
      })
      expect(prismaMock.userArticleSectionPreference.upsert).toHaveBeenCalledTimes(2)
      expect(prismaMock.userArticleSectionPreference.upsert).toHaveBeenCalledWith({
        where: {
          user_id_section_id: {
            user_id: 1,
            section_id: 1,
          },
        },
        update: { preference: 1 },
        create: {
          user_id: 1,
          section_id: 1,
          preference: 1,
        },
      })
      expect(prismaMock.userArticleSectionPreference.upsert).toHaveBeenCalledWith({
        where: {
          user_id_section_id: {
            user_id: 1,
            section_id: 2,
          },
        },
        update: { preference: 2 },
        create: {
          user_id: 1,
          section_id: 2,
          preference: 2,
        },
      })
    })

    it('should handle errors during upsert', async () => {
      const preferences: UserSectionPreference[] = [{ sectionId: 1, preference: 1 }]
      const sections: ArticleSection[] = [{ id: 1, name: 'politics' }]

      ;(prismaMock.articleSection.findMany as jest.Mock).mockResolvedValue(sections)
      ;(prismaMock.userArticleSectionPreference.upsert as jest.Mock).mockRejectedValue(new Error('Upsert failed'))

      await expect(userService.updateUserSectionPreferences(1, preferences)).rejects.toThrow(
        'Failed to update user section preferences',
      )
    })
  })
})
