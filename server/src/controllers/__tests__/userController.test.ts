import { getUserSectionPreferences, updateNickname, updateUser, updateUserSectionPreferences } from '../userController'
import { errors, success } from '../../utils/response'
import { UserNotFoundError, userService } from '../../services/userService'
import { AuthenticatedRequest } from '../../middlewares/authenticateJWT'
import { Response } from 'express'
import { sectionService } from '../../services/sectionService'

jest.mock('../../utils/response')
jest.mock('../../services/userService')
jest.mock('../../services/sectionService')

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

    expect(errors.badRequest).toHaveBeenCalledWith(res, 'Invalid request body, possibly due to unsupported fields')
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

  it('should return not found if user does not exist', async () => {
    const req = {
      userId: 999, // Non-existent user
      body: { nickname: '새로운 닉네임' },
    } as unknown as AuthenticatedRequest

    const res = mockRes()

    ;(userService.updateUserInfo as jest.Mock).mockRejectedValue(new UserNotFoundError('User not found'))

    await updateUser(req, res)

    expect(errors.notFound).toHaveBeenCalledWith(res, 'User not found')
  })

  it('should return internal error on unexpected error', async () => {
    const req = {
      userId: 1,
      body: { nickname: '새로운 닉네임' },
    } as unknown as AuthenticatedRequest

    const res = mockRes()

    ;(userService.updateUserInfo as jest.Mock).mockRejectedValue(new Error('Unexpected error'))

    await updateUser(req, res)

    expect(errors.internal).toHaveBeenCalledWith(res)
  })
})

describe('updateUserSectionPreferences', () => {
  it('should return unauthorized if userId is missing', async () => {
    const req = {
      userId: undefined,
      body: { preferences: [] },
    } as unknown as AuthenticatedRequest

    const res = mockRes()

    await updateUserSectionPreferences(req, res)

    expect(errors.unauthorized).toHaveBeenCalledWith(res, 'User ID is required')
  })

  it('should return bad request if preferences are invalid', async () => {
    const req = {
      userId: 1,
      body: { preferences: 'invalid' }, // Invalid type
    } as unknown as AuthenticatedRequest

    const res = mockRes()

    await updateUserSectionPreferences(req, res)

    expect(errors.badRequest).toHaveBeenCalledWith(res, 'Invalid request body, please check body format')
  })

  it('should update user section preferences', async () => {
    const preferences = [{ sectionId: 1, preference: 1 }]
    const updatedPrefs = [{ sectionId: 1, preference: 1 }]

    ;(userService.updateUserSectionPreferences as jest.Mock).mockResolvedValue(updatedPrefs)

    const req = {
      userId: 1,
      body: preferences,
    } as AuthenticatedRequest

    const res = mockRes()

    await updateUserSectionPreferences(req, res)

    expect(userService.updateUserSectionPreferences).toHaveBeenCalledWith(1, preferences)
    expect(success).toHaveBeenCalledWith(res, updatedPrefs, {
      message: 'User section preferences updated successfully',
    })
  })

  it('should return internal error on unexpected error', async () => {
    const req = {
      userId: 1,
      body: [{ sectionId: 1, preference: 1 }],
    } as unknown as AuthenticatedRequest

    const res = mockRes()

    ;(userService.updateUserSectionPreferences as jest.Mock).mockRejectedValue(new Error('Unexpected error'))

    await updateUserSectionPreferences(req, res)

    expect(errors.internal).toHaveBeenCalledWith(res)
  })
})

describe('getUserSectionPreferences', () => {
  it('should return unauthorized if userId is missing', async () => {
    const req = {
      userId: undefined,
    } as unknown as AuthenticatedRequest

    const res = mockRes()

    await getUserSectionPreferences(req, res)

    expect(errors.unauthorized).toHaveBeenCalledWith(res, 'User ID is required')
  })

  it('should return user section preferences', async () => {
    const req = {
      userId: 1,
    } as AuthenticatedRequest

    const preferences = [{ user_id: 1, section_id: 1, preference: 1, section_name: 'politics' }]

    ;(sectionService.getSectionPreferencesByUserId as jest.Mock).mockResolvedValue(preferences)

    const res = mockRes()

    await getUserSectionPreferences(req, res)

    expect(sectionService.getSectionPreferencesByUserId).toHaveBeenCalledWith(1)
    expect(success).toHaveBeenCalledWith(res, preferences, {
      message: 'User section preferences retrieved successfully',
    })
  })

  it('should return internal error on unexpected error', async () => {
    const req = {
      userId: 1,
    } as unknown as AuthenticatedRequest

    const res = mockRes()

    ;(sectionService.getSectionPreferencesByUserId as jest.Mock).mockRejectedValue(new Error('Unexpected error'))

    await getUserSectionPreferences(req, res)

    expect(errors.internal).toHaveBeenCalledWith(res)
  })
})
