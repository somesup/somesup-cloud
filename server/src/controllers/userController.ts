import { z } from 'zod'
import { Response } from 'express'
import { errors, success } from '../utils/response'
import { AuthenticatedRequest } from '../middlewares/authenticateJWT'
import { UserNotFoundError, userService } from '../services/userService'
import { sectionService } from '../services/sectionService'
import { keywordService } from '../services/keywordService'
import { articleService } from '../services/articleService'

/**
 * 사용자의 닉네임을 업데이트하는 컨트롤러입니다.
 * 사용자가 인증된 상태에서 자신의 닉네임을 변경할 수 있습니다.
 * @param {AuthenticatedRequest} req - 인증된 사용자 요청 객체. userId와 body에 nickname이 포함되어야 합니다.
 * @param {Response} res - Express 응답 객체.
 * @example
 * // 요청 예시
 * PUT /api/users/nickname
 * {
 *  "nickname": "newNickname"
 *  }
 *  * @returns {Promise<Response>} 업데이트된 사용자 정보를 포함한 응답 객체
 */
export const updateNickname = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  const userId = req.userId
  if (!userId) {
    return errors.unauthorized(res, 'User ID is required')
  }

  const { nickname } = req.body
  if (!nickname) {
    return errors.badRequest(res, 'Nickname is required')
  }

  try {
    const isDuplicated = await userService.checkNicknameExists(nickname)
    if (isDuplicated) {
      return errors.conflict(res, 'Nickname already exists')
    }

    const updatedUser = await userService.updateUserNickname(userId, nickname)
    return success(res, updatedUser, {
      message: 'Nickname updated successfully',
    })
  } catch (error) {
    console.error('Error updating nickname:', error)
    return errors.internal(res)
  }
}

/**
 * 사용자 정보를 업데이트하는 컨트롤러입니다.
 * 사용자가 인증된 상태에서 자신의 정보를 변경할 수 있습니다.
 * @param {AuthenticatedRequest} req - 인증된 사용자 요청 객체. userId와 body에 nickname이 포함되어야 합니다.
 * @param {Response} res - Express 응답 객체.
 * @example
 * // 요청 예시
 * PATCH /api/users
 * {
 * "nickname": "newNickname"
 * }
 * @returns {Promise<Response>} 업데이트된 사용자 정보를 포함한 응답 객체
 */
export const updateUser = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.userId
    if (!userId) {
      return errors.unauthorized(res, 'User ID is required')
    }

    // NOTE: 악의적으로 인증 여부 등을 수정하는 것을 막기 위해 체크
    const updateUserSchema = z
      .object({
        nickname: z.string().optional(),
      })
      .strict()

    const parsed = updateUserSchema.safeParse(req.body)
    if (!parsed.success) {
      return errors.badRequest(res, 'Invalid request body, possibly due to unsupported fields')
    }

    const user = await userService.updateUserInfo(userId, parsed.data)

    return success(res, user, {
      message: 'User information updated successfully',
    })
  } catch (error) {
    console.error('Error updating user:', error)
    if (error instanceof UserNotFoundError) {
      return errors.notFound(res, 'User not found')
    }
    return errors.internal(res)
  }
}

/**
 * 사용자의 섹션 선호도를 업데이트하는 컨트롤러입니다.
 * 사용자가 인증된 상태에서 자신의 섹션 선호도를 변경할 수 있습니다.
 * @param {AuthenticatedRequest} req - 인증된 사용자 요청 객체. userId와 body에 섹션 선호도가 포함되어야 합니다.
 * @param {Response} res - Express 응답 객체.
 * @example
 * // 요청 예시
 * PATCH /api/users/section-preferences
 * [
 *  {
 *  "sectionId": 1,
 *  "preference": 1
 *  }
 * ]
 * @returns {Promise<Response>} 업데이트된 섹션 선호도를 포함한 응답 객체
 */
export const updateUserSectionPreferences = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.userId
    if (!userId) {
      return errors.unauthorized(res, 'User ID is required')
    }

    const userSectionPrefSchema = z
      .object({
        sectionId: z.number(),
        preference: z.number(),
      })
      .strict()

    const updateUserSectionPrefsSchema = z.array(userSectionPrefSchema)

    const parsed = updateUserSectionPrefsSchema.safeParse(req.body)
    if (!parsed.success || parsed.data.length === 0) {
      return errors.badRequest(res, 'Invalid request body, please check body format')
    }

    await userService.updateUserSectionPreferences(userId, parsed.data)

    const updatedPrefs = await sectionService.getSectionPreferencesByUserId(userId)

    // 사용자 임베딩 벡터 업데이트 요청
    await userService.requestUpdateUserEmbedding(userId)

    // 추천 캐시 초기화
    await articleService.clearCachedRecommendations(userId)

    return success(res, updatedPrefs, {
      message: 'User section preferences updated successfully',
    })
  } catch (error) {
    console.error('Error updating user section preferences:', error)
    return errors.internal(res)
  }
}

/**
 * 사용자의 섹션 선호도를 조회하는 컨트롤러입니다.
 * 사용자가 인증된 상태에서 자신의 섹션 선호도를 조회할 수 있습니다.
 * @param {AuthenticatedRequest} req - 인증된 사용자 요청 객체. userId가 포함되어야 합니다.
 * @param {Response} res - Express 응답 객체.
 * @example
 * // 요청 예시
 * GET /api/users/section-preferences
 * @returns {Promise<Response>} 사용자의 섹션 선호도를 포함한 응답 객체
 */
export const getUserSectionPreferences = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const userId = req.userId
    if (!userId) {
      return errors.unauthorized(res, 'User ID is required')
    }

    const preferences = await sectionService.getSectionPreferencesByUserId(userId)

    return success(res, preferences, {
      message: 'User section preferences retrieved successfully',
    })
  } catch (error) {
    console.error('Error retrieving user section preferences:', error)
    return errors.internal(res)
  }
}

/**
 * 사용자의 통계 정보를 조회하는 컨트롤러입니다.
 * 사용자가 인증된 상태에서 자신의 통계 정보를 조회할 수 있습니다.
 * @param {AuthenticatedRequest} req - 인증된 사용자 요청 객체. userId가 포함되어야 합니다.
 * @param {Response} res - Express 응답 객체.
 * @example
 * // 요청 예시
 * GET /api/users/stats
 * @returns {Promise<Response>} 사용자의 통계 정보를 포함한 응답 객체
 */
export const getMyPageStats = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  const userId = req.userId
  if (!userId) {
    return errors.unauthorized(res, 'User ID is required')
  }

  try {
    const user = await userService.findUserById(userId)
    const sectionStats = await sectionService.getUserSectionStats(userId)
    const keywordStats = await keywordService.getUserKeywordStats(userId)

    return success(
      res,
      { user, sectionStats, keywordStats },
      {
        message: 'User stats retrieved successfully',
      },
    )
  } catch (error) {
    console.error('Error retrieving user stats:', error)
    return errors.internal(res)
  }
}
