import { Response } from 'express'

/**
 * 페이지네이션 정보를 담는 인터페이스입니다.
 * @property page 현재 페이지 번호
 * @property limit 한 페이지당 데이터 개수
 * @property total 전체 데이터 개수
 * @property totalPages 전체 페이지 수
 * @property hasNextPage 다음 페이지 존재 여부
 * @property hasPreviousPage 이전 페이지 존재 여부
 */
export interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

/**
 * API 응답의 기본 구조를 정의하는 제네릭 인터페이스입니다.
 * @template T 응답 데이터의 타입
 * @property success 요청 성공 여부
 * @property data 응답 데이터
 * @property [pagination] 페이지네이션 정보(Optional)
 */
export interface ApiResponse<T> {
  success: boolean
  data: T
  pagination?: Pagination
}

/**
 * 성공적인 API 응답을 전송하는 함수입니다.
 *
 * @template T 응답 데이터의 타입
 * @param res Express Response 객체
 * @param data 응답으로 보낼 데이터
 * @param [pagination] 페이지네이션 정보(선택적, page/limit/total만 입력)
 * @returns API 응답이 담긴 Express Response 객체
 *
 * @example
 * sendSuccess(res, users, { page: 1, limit: 10, total: 100 });
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  pagination?: { page: number; limit: number; total: number },
): Response<ApiResponse<T>> {
  return res.status(200).json({
    success: true,
    data,
    pagination: pagination
      ? {
          page: pagination.page,
          limit: pagination.limit,
          total: pagination.total,
          totalPages: Math.ceil(pagination.total / pagination.limit),
          hasNextPage: pagination.page * pagination.limit < pagination.total,
          hasPreviousPage: pagination.page > 1,
        }
      : undefined,
  })
}

/**
 * 에러 응답을 전송하는 함수입니다.
 *
 * @param res Express Response 객체
 * @param message 에러 메시지
 * @param [statusCode=200] HTTP 상태 코드(기본값: 200)
 * @returns API 에러 응답이 담긴 Express Response 객체
 *
 * @example
 * sendError(res, '잘못된 요청입니다.', 400);
 */
export function sendError(res: Response, message: string, statusCode: number = 200): Response<ApiResponse<null>> {
  return res.status(statusCode).json({
    success: false,
    data: message,
  })
}
