import jwt from 'jsonwebtoken'

jest.mock('jsonwebtoken')

import {
  JWT_SECRET,
  JWT_REFRESH_SECRET,
  JWT_EXPIRES_IN,
  JWT_REFRESH_EXPIRES_IN,
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  verifyRefreshToken,
} from '../jwt'

describe('jwtUtil', () => {
  const mockSign = jwt.sign as jest.Mock
  const mockVerify = jwt.verify as jest.Mock

  it('should export JWT constants', () => {
    // Test environment variables are defined in .env.test
    // Verify that the constants are set correctly
    expect(JWT_SECRET).toBe('test_jwt_secret')
    expect(JWT_REFRESH_SECRET).toBe('test_jwt_refresh_secret')
    expect(JWT_EXPIRES_IN).toBe('1h')
    expect(JWT_REFRESH_EXPIRES_IN).toBe('30d')
  })

  it('should generate access token', () => {
    mockSign.mockReturnValueOnce('access-token')
    const token = generateAccessToken(123)
    expect(jwt.sign).toHaveBeenCalledWith({ userId: 123 }, 'test_jwt_secret', { expiresIn: '1h' })
    expect(token).toBe('access-token')
  })

  it('should generate refresh token', () => {
    mockSign.mockReturnValueOnce('refresh-token')
    const token = generateRefreshToken(456)
    expect(jwt.sign).toHaveBeenCalledWith({ userId: 456 }, 'test_jwt_refresh_secret', { expiresIn: '30d' })
    expect(token).toBe('refresh-token')
  })

  it('should verify access token', () => {
    mockVerify.mockReturnValueOnce({ userId: 789 })
    const payload = verifyToken('access-token')
    expect(jwt.verify).toHaveBeenCalledWith('access-token', 'test_jwt_secret')
    expect(payload).toEqual({ userId: 789 })
  })

  it('should verify refresh token', () => {
    mockVerify.mockReturnValueOnce({ userId: 101 })
    const payload = verifyRefreshToken('refresh-token')
    expect(jwt.verify).toHaveBeenCalledWith('refresh-token', 'test_jwt_refresh_secret')
    expect(payload).toEqual({ userId: 101 })
  })
})
