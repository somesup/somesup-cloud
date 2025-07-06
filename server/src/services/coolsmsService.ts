import { COOLSMS_FROM_PHONE_NUMBER, solapiService } from '../config/coolSms'

/**
 * SMS 인증번호를 지정한 휴대폰 번호로 발송합니다.
 * 메시지는 인증번호를 포함한 텍스트로 고정되어 있습니다.
 * @param {string} phoneNumber - 수신자 휴대폰 번호
 * @param {number} code - 발송할 인증번호
 * @returns {Promise<void>}
 * @throws {Error} 필수 파라미터가 없거나, 발송 실패 시 에러 발생
 */
export const sendSMSVerificationCode = async (phoneNumber: string, code: number): Promise<void> => {
  if (!phoneNumber || !code) {
    throw new Error('Phone number and code are required')
  }

  const message = {
    to: phoneNumber,
    from: COOLSMS_FROM_PHONE_NUMBER,
    text: `[썸즈업] 본인 확인 인증번호는 (${code}) 입니다.`,
  }

  try {
    await solapiService.sendOne(message)
  } catch (error) {
    console.error('Error sending SMS:', error)
    throw new Error('Failed to send SMS')
  }
}
