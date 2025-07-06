import { SolapiMessageService } from 'solapi'

export const COOLSMS_API_KEY = process.env.COOLESMS_API_KEY || ''
export const COOLSMS_API_SECRET = process.env.COOLESMS_API_SECRET || ''
export const COOLSMS_FROM_PHONE_NUMBER = process.env.COOLESMS_FROM_PHONE_NUMBER || ''

export const solapiService = new SolapiMessageService(COOLSMS_API_KEY, COOLSMS_API_SECRET)
