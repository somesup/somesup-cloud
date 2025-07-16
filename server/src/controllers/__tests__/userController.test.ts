import { updateNickname } from '../userController'
import { sendError, sendSuccess } from '../../utils/response'
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

    expect(sendError).toHaveBeenCalledWith(res, 'User ID is required', 401)
  })

  it('should return 400 if nickname is missing', async () => {
    const req = {
      userId: 1,
      body: {},
    } as unknown as AuthenticatedRequest
    const res = mockRes()

    await updateNickname(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'Nickname is required' })
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
    expect(sendError).toHaveBeenCalledWith(res, 'Nickname already exists', 400)
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
    expect(sendSuccess).toHaveBeenCalledWith(res, updatedUser)
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

    expect(sendError).toHaveBeenCalledWith(res, 'Internal server error', 500)
  })
})
