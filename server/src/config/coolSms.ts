import { SolapiMessageService } from 'solapi'
import { getEnv } from '../utils/env'

export const COOLSMS_API_KEY = getEnv('COOLSMS_API_KEY')
export const COOLSMS_API_SECRET = getEnv('COOLSMS_API_SECRET')
export const COOLSMS_FROM_PHONE_NUMBER = getEnv('COOLSMS_FROM_PHONE_NUMBER')

export const solapiService = new SolapiMessageService(COOLSMS_API_KEY, COOLSMS_API_SECRET)
