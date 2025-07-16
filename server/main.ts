import Express from 'express'
import dotenv from 'dotenv'

import { redisClient } from './src/config/redis'

import articleRouter from './src/routes/article'
import authRouter from './src/routes/auth'
import userRouter from './src/routes/user'

dotenv.config()

redisClient.connect()

const app = Express()
app.use(Express.json())

app.use('/api/articles', articleRouter)
app.use('/api/auth', authRouter)
app.use('/api/users', userRouter)

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
})
