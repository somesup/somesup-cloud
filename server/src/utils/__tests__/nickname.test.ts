import { generateGuestPhoneNumber, generateRandomNickname } from '../generate'
import { redisClient } from '../../config/redis'

jest.mock('../../config/redis', () => ({
  redisClient: {
    incr: jest.fn(),
  },
}))

describe('generateRandomNickname', () => {
  it('Returns a random nickname', async () => {
    // Redis의 incr 메서드가 1을 반환하도록 mock
    ;(redisClient.incr as jest.Mock).mockResolvedValue(1)

    // 랜덤 함수 0을 반환하도록 mock
    jest.spyOn(Math, 'random').mockReturnValue(0)

    const nickname = await generateRandomNickname()

    // 닉네임 형식: "형용사 동물 #1"
    expect(nickname).toBe('귀여운 고양이 #1')
    expect(redisClient.incr).toHaveBeenCalledTimes(1)
  })
})

describe('generateGuestPhoneNumber', () => {
  it('Returns a guest phone number with unique index', async () => {
    // Redis의 incr 메서드가 1을 반환하도록 mock
    ;(redisClient.incr as jest.Mock).mockResolvedValue(1)

    const phoneNumber = await generateGuestPhoneNumber()

    // 전화번호 형식: "GUEST-1"
    expect(phoneNumber).toBe('GUEST-1')
    expect(redisClient.incr).toHaveBeenCalledWith('guest_index')
  })
})
