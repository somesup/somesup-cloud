/**
 * 사용자 정보를 업데이트하는 요청 형태입니다.
 */
export type UpdateUserRequest = {
  nickname?: string
}

/**
 * 사용자 섹션 선호도를 업데이트하는 요청 형태입니다.
 */
export type UpdateUserSectionPreferenceRequest = {
  sectionId: number
  preference: number
}
