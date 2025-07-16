import { redisClient } from '../config/redis'

const adjectives = [
  '귀여운',
  '멋진',
  '용감한',
  '영리한',
  '재치있는',
  '활기찬',
  '우아한',
  '신나는',
  '행복한',
  '아름다운',
]

const animals = ['고양이', '강아지', '토끼', '곰', '호랑이', '펭귄', '돌고래', '거북이', '올빼미', '판다']

export const generateRandomNickname = async (): Promise<string> => {
  const adjectiveIdx = Math.floor(Math.random() * adjectives.length)
  const animalIdx = Math.floor(Math.random() * animals.length)

  const nickname = `${adjectives[adjectiveIdx]} ${animals[animalIdx]}`

  // Redis에서 닉네임 인덱스를 증가시키고, 해당 닉네임에 번호를 붙여 반환
  const idx = await redisClient.incr(`nickname_index:${nickname}`)

  return `${nickname} #${idx}`
}
