import { Response } from 'express'

/**
 * Offset을 사용한 페이지네이션 인터페이스입니다.
 */
export interface OffsetPagination {
  type: 'offset'
  page: number
  limit: number
  total: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
}

/**
 * Cursor를 사용한 페이지네이션 인터페이스입니다.
 */
export interface CursorPagination {
  type: 'cursor'
  hasNext: boolean
  hasPrev?: boolean
  nextCursor?: string
  prevCursor?: string
}

/**
 * 성공적인 응답 형식입니다.
 */
export interface SuccessResponse<T> {
  success: true
  data: T
  message?: string
  pagination?: OffsetPagination | CursorPagination
}

/**
 * 오류 응답 형식입니다.
 */
export interface ErrorResponse {
  success: false
  message: string
  code?: string
  details?: any
}

/**
 * 성공적인 응답을 반환하는 함수입니다.
 * @param res - Express 응답 객체
 * @param data - 응답 데이터
 * @param options - 선택적 메시지와 페이지네이션 정보
 * @returns Express 응답 객체
 * @example
 * // 데이터만 반환하는 경우
 * success(res, { id: 1, name: 'Junwoo Park' })
 *
 * // 데이터와 메시지를 반환하는 경우
 * success(res, { id: 1, name: 'Junwoo Park' }, { message: 'User created successfully' })
 *
 * // 데이터와 페이지네이션 정보를 반환하는 경우
 * `successWithOffset()` 이나 `successWithCursor()` 함수를 사용하세요.
 */
export function success<T>(
  res: Response,
  data: T,
  options?: {
    message?: string
    pagination?: OffsetPagination | CursorPagination
  },
): Response<SuccessResponse<T>> {
  return res.json({
    success: true,
    data,
    ...options,
  })
}

/**
 * Offset 페이지네이션을 사용하여 성공적인 응답을 반환하는 함수입니다.
 * @param res - Express 응답 객체
 * @param data - 응답 데이터
 * @param options - 페이지, 한 페이지당 항목 수, 총 항목 수, 선택적 메시지
 * @return Express 응답 객체
 * @example
 * // 페이지네이션된 데이터와 함께 응답
 * successWithOffset(res, articles, {
 *   page: 1,
 *   limit: 10,
 *   total: 100,
 *   message: 'Articles retrieved successfully',
 *   })
 */
export function successWithOffset<T>(
  res: Response,
  data: T,
  options: {
    page: number
    limit: number
    total: number
    message?: string
  },
) {
  const pagination: OffsetPagination = {
    type: 'offset',
    page: options.page,
    limit: options.limit,
    total: options.total,
    totalPages: Math.ceil(options.total / options.limit),
    hasNext: options.page * options.limit < options.total,
    hasPrev: options.page > 1,
  }

  return success(res, data, {
    message: options.message,
    pagination,
  })
}

/**
 * Cursor 페이지네이션을 사용하여 성공적인 응답을 반환하는 함수입니다.
 * @param res - Express 응답 객체
 * @param data - 응답 데이터
 * @param options - 다음 페이지 여부, 이전 페이지 여부, 다음 커서, 이전 커서, 선택적 메시지
 * @return Express 응답 객체
 * @example
 * // 커서 페이지네이션된 데이터와 함께 응답
 * successWithCursor(res, articles, {
 *  hasNext: true,
 *  hasPrev: false,
 *  nextCursor: 'eyJjcmVhdGVkQXQiOiIyMDIzLTA5LTIxVDEyOjAwOjAwLjAwMFoiLCJpZCI6MX0=',
 *  prevCursor: undefined,
 *  message: 'Articles retrieved successfully',
 *  })
 */
export function successWithCursor<T>(
  res: Response,
  data: T,
  options: {
    hasNext: boolean
    hasPrev?: boolean
    nextCursor?: string
    prevCursor?: string
    message?: string
  },
) {
  const pagination: CursorPagination = {
    type: 'cursor',
    hasNext: options.hasNext,
    hasPrev: options.hasPrev,
    nextCursor: options.nextCursor,
    prevCursor: options.prevCursor,
  }

  return success(res, data, {
    message: options.message,
    pagination,
  })
}

/**
 * 오류 응답을 반환하는 함수입니다.
 * @param res - Express 응답 객체
 * @param message - 오류 메시지
 * @param statusCode - HTTP 상태 코드 (기본값: 400)
 * @param options - 선택적 오류 세부 정보
 * @return Express 응답 객체
 * @example
 * // 오류 메시지와 상태 코드를 반환하는 경우
 * error(res, 'Invalid request', 400)
 */
export function error(
  res: Response,
  message: string,
  statusCode: number = 400,
  options?: {
    details?: any
  },
): Response<ErrorResponse> {
  return res.status(statusCode).json({
    success: false,
    message,
    ...options,
  })
}

/**
 * 오류 응답을 반환하는 유틸리티 객체입니다.
 * 각 HTTP 상태 코드에 대한 오류 응답을 간편하게 반환할 수 있는 메서드를 제공합니다.
 */
export const errors = {
  badRequest: (res: Response, message: string = 'Bad Request') => error(res, message, 400),
  unauthorized: (res: Response, message: string = 'Unauthorized') => error(res, message, 401),
  forbidden: (res: Response, message: string = 'Forbidden') => error(res, message, 403),
  notFound: (res: Response, message: string = 'Not Found') => error(res, message, 404),
  conflict: (res: Response, message: string = 'Conflict') => error(res, message, 409),
  internal: (res: Response, message: string = 'Internal Server Error') => error(res, message, 500),
}
