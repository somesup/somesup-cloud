import { GoogleAuth } from 'google-auth-library'

export const getGcpAuthHeader = async (targetAudience: string): Promise<string> => {
  const auth = new GoogleAuth()
  const client = await auth.getIdTokenClient(targetAudience)
  const headers = await client.getRequestHeaders()
  const authHeader = headers.get('authorization')
  if (!authHeader) {
    throw new Error('Failed to retrieve ID token')
  }
  return authHeader
}
