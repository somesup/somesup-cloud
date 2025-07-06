import { sendSMSVerificationCode } from '../coolsmsService'
import { COOLSMS_FROM_PHONE_NUMBER, solapiService } from '../../config/coolSms'

// Mock the config module
jest.mock('../../config/coolSms', () => ({
  COOLSMS_FROM_PHONE_NUMBER: '01012345678',
  solapiService: {
    sendOne: jest.fn(),
  },
}))

describe('sendSMSVerificationCode', () => {
  const mockSolapiService = solapiService as jest.Mocked<typeof solapiService>

  beforeEach(() => {
    jest.clearAllMocks()
    // Clear console.error mock
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should send SMS verification code successfully', async () => {
    const phoneNumber = '01087654321'
    const code = 123456

    const mockResponse = {
      statusCode: '2000',
      statusMessage: 'Success',
      messageId: 'mock-message-id',
    }

    mockSolapiService.sendOne.mockResolvedValue(mockResponse as any)

    await sendSMSVerificationCode(phoneNumber, code)

    expect(mockSolapiService.sendOne).toHaveBeenCalledWith({
      to: phoneNumber,
      from: COOLSMS_FROM_PHONE_NUMBER,
      text: '[썸즈업] 본인 확인 인증번호는 (123456) 입니다.',
    })
  })

  it('should throw error when phone number is missing', async () => {
    await expect(sendSMSVerificationCode('', 123456)).rejects.toThrow('Phone number and code are required')
  })

  it('should throw error when code is missing', async () => {
    await expect(sendSMSVerificationCode('01087654321', 0)).rejects.toThrow('Phone number and code are required')
  })

  it('should throw error when solapiService.sendOne fails', async () => {
    const phoneNumber = '01087654321'
    const code = 123456
    const mockError = new Error('API Error')

    mockSolapiService.sendOne.mockRejectedValue(mockError)

    await expect(sendSMSVerificationCode(phoneNumber, code)).rejects.toThrow('Failed to send SMS')

    expect(console.error).toHaveBeenCalledWith('Error sending SMS:', mockError)
  })
})
