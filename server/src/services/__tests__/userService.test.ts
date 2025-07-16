import { userService } from '../userService'
import { prismaMock } from '../../../prisma/mock'
import { User } from '@prisma/client'

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
})
