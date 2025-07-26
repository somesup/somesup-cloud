import { z } from 'zod'
import { Response } from 'express'
import { errors, success } from '../utils/response'
import { AuthenticatedRequest } from '../middlewares/authenticateJWT'
import { UserNotFoundError, userService } from '../services/userService'

/**
 * 사용자의 닉네임을 업데이트하는 컨트롤러입니다.
 * 사용자가 인증된 상태에서 자신의 닉네임을 변경할 수 있습니다.
 * @param {AuthenticatedRequest} req - 인증된 사용자 요청 객체. userId와 body에 nickname이 포함되어야 합니다.
 * @param {Response} res - Express 응답 객체.
 * @example
 * // 요청 예시
 * PUT /api/user/nickname
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
    return errors.internal(res)
  }
}

/**
 * 사용자 정보를 업데이트하는 요청 형태입니다.
 */
export type UpdateUserRequest = {
  nickname?: string
}

/**
 * 사용자 정보를 업데이트하는 컨트롤러입니다.
 * 사용자가 인증된 상태에서 자신의 정보를 변경할 수 있습니다.
 * @param {AuthenticatedRequest} req - 인증된 사용자 요청 객체. userId와 body에 nickname이 포함되어야 합니다.
 * @param {Response} res - Express 응답 객체.
 * @example
 * // 요청 예시
 * PATCH /api/user
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
    if (error instanceof UserNotFoundError) {
      return errors.notFound(res, 'User not found')
    }
    return errors.internal(res)
  }
}
