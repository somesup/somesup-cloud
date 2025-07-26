import { UserNotFoundError, userService } from '../userService'
import { prismaMock } from '../../../prisma/mock'
import { User } from '@prisma/client'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'

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

      const result = await userService.createUser('01087654321', '새유저', true)

      expect(prismaMock.user.create).toHaveBeenCalledWith({
        data: {
          phone: '01087654321',
          nickname: '새유저',
          is_authenticated: true,
        },
      })
      expect(result).toEqual(createdUser)
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
})
