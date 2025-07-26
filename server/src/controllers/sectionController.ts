import { Request, Response } from 'express'
import { SectionNotFoundError, sectionService } from '../services/sectionService'
import { errors, success } from '../utils/response'

/**
 * 모든 섹션을 조회하는 컨트롤러입니다.
 * 사용자가 요청하면 데이터베이스에서 모든 섹션을 조회하여 반환합니다.
 * @param {Request} req - Express 요청 객체.
 * @param {Response} res - Express 응답 객체.
 * @example
 * // 요청 예시
 * GET /api/sections
 * // 응답 예시
 * {
 *  "data": [
 *  {
 *  "id": 1,
 *  "name": "Technology",
 *  }
 *  ]
 * }
 */
export const getSections = async (req: Request, res: Response): Promise<Response> => {
  try {
    const sections = await sectionService.getSections()
    return success(res, sections, {
      message: 'Sections retrieved successfully',
    })
  } catch (error) {
    if (error instanceof SectionNotFoundError) {
      return errors.notFound(res, 'Sections not found')
    }
    return errors.internal(res)
  }
}

/**
 * 특정 ID의 섹션을 조회하는 컨트롤러입니다.
 * 사용자가 요청한 ID에 해당하는 섹션을 데이터베이스에서 조회합니다.
 * @param {Request} req - Express 요청 객체. URL 파라미터로 id가 포함되어야 합니다.
 * @param {Response} res - Express 응답 객체.
 * @example
 * // 요청 예시
 * GET /api/sections/:id
 * // 응답 예시
 * {
 * "data": {
 * "id": 1,
 * "name": "Technology",
 * }
 * }
 */
export const getSectionById = async (req: Request, res: Response): Promise<Response> => {
  const id = parseInt(req.params.id, 10)

  try {
    const section = await sectionService.getSectionById(id)
    return success(res, section, {
      message: 'Section retrieved successfully',
    })
  } catch (error) {
    if (error instanceof SectionNotFoundError) {
      return errors.notFound(res, 'Section not found')
    }
    return errors.internal(res)
  }
}
