/**
 * 사용자의 섹션 선호도를 나타내는 타입입니다.
 */
export type UserSectionPreference = {
  userId: number
  sectionId: number
  sectionName: string
  preference: number
}

/**
 * 섹션의 행동 점수를 나타내는 타입입니다.
 * 사용자의 섹션 선호도와 행동 점수를 포함합니다.
 */
export type UserSectionStat = {
  sectionId: number
  sectionName: string
  preference: number
  behaviorScore: number
}
