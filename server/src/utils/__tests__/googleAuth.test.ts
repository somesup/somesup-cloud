import { getGcpAuthHeader } from '../googleAuth'
import { GoogleAuth } from 'google-auth-library'

jest.mock('google-auth-library', () => {
  return {
    GoogleAuth: jest.fn().mockImplementation(() => ({
      getIdTokenClient: jest.fn(),
    })),
  }
})

describe('getGcpAuthHeader', () => {
  const mockGetIdTokenClient = jest.fn()
  const mockGetRequestHeaders = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    ;(GoogleAuth as jest.Mock).mockImplementation(() => ({
      getIdTokenClient: mockGetIdTokenClient,
    }))
    mockGetIdTokenClient.mockResolvedValue({
      getRequestHeaders: mockGetRequestHeaders,
    })
  })

  it('should return the authorization header when present', async () => {
    mockGetRequestHeaders.mockResolvedValue(new Map([['authorization', 'Bearer test-token']]))

    const result = await getGcpAuthHeader('https://test.com')
    expect(GoogleAuth).toHaveBeenCalledTimes(1)
    expect(mockGetIdTokenClient).toHaveBeenCalledWith('https://test.com')
    expect(mockGetRequestHeaders).toHaveBeenCalled()
    expect(result).toBe('Bearer test-token')
  })

  it('should throw an error if authorization header is missing', async () => {
    mockGetRequestHeaders.mockResolvedValue(new Map())

    await expect(getGcpAuthHeader('https://test.com')).rejects.toThrow('Failed to retrieve ID token')
    expect(GoogleAuth).toHaveBeenCalledTimes(1)
    expect(mockGetIdTokenClient).toHaveBeenCalledWith('https://test.com')
    expect(mockGetRequestHeaders).toHaveBeenCalled()
  })
})
