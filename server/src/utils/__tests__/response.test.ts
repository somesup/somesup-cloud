import { sendSuccess, sendError } from '../response'
import { createResponse } from 'node-mocks-http'

describe('sendSuccess', () => {
  it('should return 200 and correct response without pagination', () => {
    const res = createResponse()
    const data = { foo: 'bar' }

    sendSuccess(res, data)

    expect(res.statusCode).toBe(200)
    const json = res._getJSONData()
    expect(json).toEqual({
      success: true,
      data,
      pagination: undefined,
    })
  })

  it('should return 200 and correct response with pagination', () => {
    const res = createResponse()
    const data = [{ id: 1 }, { id: 2 }]
    const pagination = { page: 2, limit: 2, total: 10 }

    sendSuccess(res, data, pagination)

    expect(res.statusCode).toBe(200)
    const json = res._getJSONData()
    expect(json).toEqual({
      success: true,
      data,
      pagination: {
        page: 2,
        limit: 2,
        total: 10,
        totalPages: 5,
        hasNextPage: true,
        hasPreviousPage: true,
      },
    })
  })
})

describe('sendError', () => {
  it('should return 400 and error message', () => {
    const res = createResponse()
    const message = '잘못된 요청입니다.'

    sendError(res, message, 400)

    expect(res.statusCode).toBe(400)
    const json = res._getJSONData()
    expect(json).toEqual({
      success: false,
      data: message,
    })
  })

  it('should return default status code 200 if not provided', () => {
    const res = createResponse()
    const message = '에러 발생'

    sendError(res, message)

    expect(res.statusCode).toBe(200)
    const json = res._getJSONData()
    expect(json).toEqual({
      success: false,
      data: message,
    })
  })
})
