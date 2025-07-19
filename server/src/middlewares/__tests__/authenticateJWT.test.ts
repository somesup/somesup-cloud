import { authenticateJWT, AuthenticatedRequest } from '../authenticateJWT'
import { errors } from '../../utils/response'
import jwt from 'jsonwebtoken'

jest.mock('../../utils/response')
jest.mock('jsonwebtoken')

const mockNext = jest.fn()
const mockRes = () => {
  const res: any = {}
  res.status = jest.fn(() => res)
  res.send = jest.fn(() => res)
  res.json = jest.fn(() => res)
  return res
}

describe('authenticateJWT middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return 401 if Authorization header is missing', () => {
    const req = { headers: {} } as AuthenticatedRequest
    const res = mockRes()

    authenticateJWT(req, res, mockNext)

    expect(errors.unauthorized).toHaveBeenCalledWith(res, 'Access token is required')
    expect(mockNext).not.toHaveBeenCalled()
  })

  it('should return 401 if token part is missing from Authorization header', () => {
    const req = {
      headers: { authorization: 'Bearer' },
    } as AuthenticatedRequest
    const res = mockRes()

    authenticateJWT(req, res, mockNext)

    expect(errors.unauthorized).toHaveBeenCalledWith(res, 'Access token is required')
    expect(mockNext).not.toHaveBeenCalled()
  })

  it('should call jwt.verify with correct token and set req.userId', () => {
    const token = 'valid.token.here'
    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as AuthenticatedRequest

    const res = mockRes()
    const mockPayload = { userId: 42 }

    ;(jwt.verify as jest.Mock).mockReturnValue(mockPayload)

    authenticateJWT(req, res, mockNext)

    expect(jwt.verify).toHaveBeenCalledWith(token, process.env.JWT_SECRET)
    expect(req.userId).toBe(42)
    expect(mockNext).toHaveBeenCalled()
  })

  it('should call sendError if jwt.verify throws error', () => {
    const token = 'invalid.token'
    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as AuthenticatedRequest

    const res = mockRes()

    ;(jwt.verify as jest.Mock).mockImplementation(() => {
      throw new Error('JWT decoding error')
    })

    authenticateJWT(req, res, mockNext)

    expect(errors.unauthorized).toHaveBeenCalledWith(res, 'Invalid or expired access token')
    expect(mockNext).not.toHaveBeenCalled()
  })
})
