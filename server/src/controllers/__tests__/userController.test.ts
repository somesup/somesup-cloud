import { updateNickname, updateUser } from '../userController'
import { errors, success } from '../../utils/response'
import { userService } from '../../services/userService'
import { AuthenticatedRequest } from '../../middlewares/authenticateJWT'
import { Response } from 'express'

jest.mock('../../utils/response')
jest.mock('../..//services/userService')

const mockRes = () => {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  }
  return res as Response
}

describe('updateNickname', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return 401 if userId is missing', async () => {
    const req = {
      userId: undefined,
      body: { nickname: 'tester' },
    } as unknown as AuthenticatedRequest
    const res = mockRes()

    await updateNickname(req, res)

    expect(errors.unauthorized).toHaveBeenCalledWith(res, 'User ID is required')
  })

  it('should return 400 if nickname is missing', async () => {
    const req = {
      userId: 1,
      body: {},
    } as unknown as AuthenticatedRequest
    const res = mockRes()

    await updateNickname(req, res)

    expect(errors.badRequest).toHaveBeenCalledWith(res, 'Nickname is required')
  })

  it('should return 400 if nickname already exists', async () => {
    ;(userService.checkNicknameExists as jest.Mock).mockResolvedValue(true)

    const req = {
      userId: 1,
      body: { nickname: 'existingNick' },
    } as AuthenticatedRequest
    const res = mockRes()

    await updateNickname(req, res)

    expect(userService.checkNicknameExists).toHaveBeenCalledWith('existingNick')
    expect(errors.conflict).toHaveBeenCalledWith(res, 'Nickname already exists')
  })

  it('should update nickname and return updated user', async () => {
    const updatedUser = {
      id: 1,
      nickname: 'newNick',
      phone: '01012345678',
      is_authenticated: true,
      created_at: new Date(),
      updated_at: new Date(),
    }

    ;(userService.checkNicknameExists as jest.Mock).mockResolvedValue(false)
    ;(userService.updateUserNickname as jest.Mock).mockResolvedValue(updatedUser)

    const req = {
      userId: 1,
      body: { nickname: 'newNick' },
    } as AuthenticatedRequest

    const res = mockRes()

    await updateNickname(req, res)

    expect(userService.checkNicknameExists).toHaveBeenCalledWith('newNick')
    expect(userService.updateUserNickname).toHaveBeenCalledWith(1, 'newNick')
    expect(success).toHaveBeenCalledWith(res, updatedUser, {
      message: 'Nickname updated successfully',
    })
  })

  it('should return 500 on unexpected error', async () => {
    ;(userService.checkNicknameExists as jest.Mock).mockImplementation(() => {
      throw new Error('Unexpected')
    })

    const req = {
      userId: 1,
      body: { nickname: 'nick' },
    } as AuthenticatedRequest
    const res = mockRes()

    await updateNickname(req, res)

    expect(errors.internal).toHaveBeenCalledWith(res)
  })
})

describe('updateUser', () => {
  it('should return 401 if userId is missing', async () => {
    const req = {
      userId: undefined,
      body: { nickname: '새로운 닉네임' },
    } as unknown as AuthenticatedRequest

    const res = mockRes()

    await updateUser(req, res)

    expect(errors.unauthorized).toHaveBeenCalledWith(res, 'User ID is required')
  })

  it('sould return 400 if request body is invalid', async () => {
    const req = {
      userId: 1,
      body: { is_authenticated: true }, // Invalid field
    } as unknown as AuthenticatedRequest

    const res = mockRes()

    await updateUser(req, res)

    expect(errors.badRequest).toHaveBeenCalledWith(res, 'Invalid request body, possibly wrong field names')
  })

  it('should update user info and return updated user', async () => {
    const updateData = { nickname: '새로운 닉네임' }
    const updatedUser = {
      id: 1,
      ...updateData,
      phone: '01012345678',
      is_authenticated: true,
      created_at: new Date(),
      updated_at: new Date(),
    }

    ;(userService.updateUserInfo as jest.Mock).mockResolvedValue(updatedUser)

    const req = {
      userId: 1,
      body: updateData,
    } as AuthenticatedRequest

    const res = mockRes()

    await updateUser(req, res)

    expect(userService.updateUserInfo).toHaveBeenCalledWith(1, updateData)
    expect(success).toHaveBeenCalledWith(res, updatedUser, {
      message: 'User information updated successfully',
    })
  })
})
