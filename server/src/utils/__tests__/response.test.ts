import { success, successWithOffset, successWithCursor, error, errors } from '../response'

const mockRes = () => {
  const res: any = {}
  res.status = jest.fn(() => res)
  res.send = jest.fn(() => res)
  res.json = jest.fn(() => res)
  return res
}
const getJson = (res: any) => res.json.mock.calls[0][0]
const getStatus = (res: any) => (res.status.mock.calls.length > 0 ? res.status.mock.calls[0][0] : 200)

it('success: only data', () => {
  const res = mockRes()
  const data = { id: 1 }
  success(res, data)
  expect(getJson(res)).toEqual({ success: true, data })
})

it('success: with message', () => {
  const res = mockRes()
  const data = { id: 2 }
  const message = 'Good!'
  success(res, data, { message })
  expect(getJson(res)).toEqual({ success: true, data, message })
})

it('success: with pagination', () => {
  const res = mockRes()
  const data = [1, 2, 3]
  const pagination = {
    type: 'offset',
    page: 1,
    limit: 10,
    total: 20,
    totalPages: 2,
    hasNext: true,
    hasPrev: false,
  } as const
  success(res, data, { pagination })
  expect(getJson(res)).toEqual({ success: true, data, pagination })
})

it('success: with message and pagination', () => {
  const res = mockRes()
  const data = [1]
  const pagination = {
    type: 'cursor',
    hasNext: false,
    hasPrev: true,
    nextCursor: 'abc',
    prevCursor: 'xyz',
  } as const
  const message = 'msg'
  success(res, data, { message, pagination })
  expect(getJson(res)).toEqual({ success: true, data, message, pagination })
})

it('successWithOffset: first page (has next, no prev)', () => {
  const res = mockRes()
  const data = ['a', 'b']
  const options = { page: 1, limit: 2, total: 5, message: 'fetch' }
  successWithOffset(res, data, options)
  expect(getJson(res)).toEqual({
    success: true,
    data,
    message: options.message,
    pagination: {
      type: 'offset',
      page: 1,
      limit: 2,
      total: 5,
      totalPages: 3,
      hasNext: true,
      hasPrev: false,
    },
  })
})

it('successWithOffset: last page, hasPrev true, hasNext false', () => {
  const res = mockRes()
  const data = 'bar'
  const options = { page: 3, limit: 2, total: 6 }
  successWithOffset(res, data, options)
  expect(getJson(res)).toEqual({
    success: true,
    data,
    message: undefined,
    pagination: {
      type: 'offset',
      page: 3,
      limit: 2,
      total: 6,
      totalPages: 3,
      hasNext: false,
      hasPrev: true,
    },
  })
})

it('successWithOffset: zero total', () => {
  const res = mockRes()
  const data = 'baz'
  const options = { page: 1, limit: 10, total: 0 }
  successWithOffset(res, data, options)
  expect(getJson(res)).toEqual({
    success: true,
    data,
    message: undefined,
    pagination: {
      type: 'offset',
      page: 1,
      limit: 10,
      total: 0,
      totalPages: 0,
      hasNext: false,
      hasPrev: false,
    },
  })
})

it('successWithCursor: all options', () => {
  const res = mockRes()
  const data = [1, 2]
  const options = {
    hasNext: true,
    hasPrev: false,
    nextCursor: 'abc123',
    prevCursor: undefined,
    message: 'done',
  }
  successWithCursor(res, data, options)
  expect(getJson(res)).toEqual({
    success: true,
    data,
    message: options.message,
    pagination: {
      type: 'cursor',
      hasNext: true,
      hasPrev: false,
      nextCursor: 'abc123',
      prevCursor: undefined,
    },
  })
})

it('successWithCursor: missing optional options', () => {
  const res = mockRes()
  const data = [42]
  const options = { hasNext: false }
  successWithCursor(res, data, options)
  expect(getJson(res)).toEqual({
    success: true,
    data,
    message: undefined,
    pagination: {
      type: 'cursor',
      hasNext: false,
      hasPrev: undefined,
      nextCursor: undefined,
      prevCursor: undefined,
    },
  })
})

it('error: default status', () => {
  const res = mockRes()
  error(res, 'fail!')
  expect(getStatus(res)).toBe(400)
  expect(getJson(res)).toEqual({
    success: false,
    message: 'fail!',
  })
})

it('error: custom status', () => {
  const res = mockRes()
  error(res, 'unauth', 401)
  expect(getStatus(res)).toBe(401)
  expect(getJson(res)).toEqual({
    success: false,
    message: 'unauth',
  })
})

it('error: with details', () => {
  const res = mockRes()
  error(res, 'something', 422, { details: { foo: 'bar' } })
  expect(getStatus(res)).toBe(422)
  expect(getJson(res)).toEqual({
    success: false,
    message: 'something',
    details: { foo: 'bar' },
  })
})

it('errors.badRequest: default', () => {
  let res = mockRes()
  errors.badRequest(res)
  expect(getStatus(res)).toBe(400)
  expect(getJson(res)).toEqual({ success: false, message: 'Bad Request' })

  res = mockRes()
  errors.badRequest(res, 'Invalid input')
  expect(getStatus(res)).toBe(400)
  expect(getJson(res)).toEqual({ success: false, message: 'Invalid input' })
})

it('errors.unauthorized', () => {
  let res = mockRes()
  errors.unauthorized(res)
  expect(getStatus(res)).toBe(401)
  expect(getJson(res)).toEqual({ success: false, message: 'Unauthorized' })

  res = mockRes()
  errors.unauthorized(res, 'No token provided')
  expect(getStatus(res)).toBe(401)
  expect(getJson(res)).toEqual({ success: false, message: 'No token provided' })
})

it('errors.forbidden with custom message', () => {
  let res = mockRes()
  errors.forbidden(res)
  expect(getStatus(res)).toBe(403)
  expect(getJson(res)).toEqual({ success: false, message: 'Forbidden' })

  res = mockRes()
  errors.forbidden(res, 'no access')
  expect(getStatus(res)).toBe(403)
  expect(getJson(res)).toEqual({ success: false, message: 'no access' })
})

it('errors.forbidden', () => {
  let res = mockRes()
  errors.forbidden(res)
  expect(getStatus(res)).toBe(403)
  expect(getJson(res)).toEqual({ success: false, message: 'Forbidden' })

  res = mockRes()
  errors.forbidden(res, 'no access')
  expect(getStatus(res)).toBe(403)
  expect(getJson(res)).toEqual({ success: false, message: 'no access' })
})

it('errors.notFound', () => {
  let res = mockRes()
  errors.notFound(res)
  expect(getStatus(res)).toBe(404)
  expect(getJson(res)).toEqual({ success: false, message: 'Not Found' })

  res = mockRes()
  errors.notFound(res, 'item not found')
  expect(getStatus(res)).toBe(404)
  expect(getJson(res)).toEqual({ success: false, message: 'item not found' })
})

it('errors.conflict', () => {
  let res = mockRes()
  errors.conflict(res)
  expect(getStatus(res)).toBe(409)
  expect(getJson(res)).toEqual({ success: false, message: 'Conflict' })

  res = mockRes()
  errors.conflict(res, 'duplicated')
  expect(getStatus(res)).toBe(409)
  expect(getJson(res)).toEqual({ success: false, message: 'duplicated' })
})

it('errors.internal', () => {
  let res = mockRes()
  errors.internal(res)
  expect(getStatus(res)).toBe(500)
  expect(getJson(res)).toEqual({ success: false, message: 'Internal Server Error' })

  res = mockRes()
  errors.internal(res, 'unexpected error')
  expect(getStatus(res)).toBe(500)
  expect(getJson(res)).toEqual({ success: false, message: 'unexpected error' })
})
