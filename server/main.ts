import dotenv from 'dotenv'
dotenv.config()

import Express from 'express'
import swaggerUi from 'swagger-ui-express'
import path from 'path'
import YAML from 'yamljs'

import { redisClient } from './src/config/redis'

import articleRouter from './src/routes/article'
import authRouter from './src/routes/auth'
import userRouter from './src/routes/user'
import sectionRouter from './src/routes/section'
import { registerCronJobs } from './src/utils/cron'

const swaggerYamlPath = path.join(__dirname, './build/swagger.yaml')
const swaggerDocument = YAML.load(swaggerYamlPath)

redisClient.connect()

const app = Express()
app.use(Express.json())
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument))
app.use('/api/articles', articleRouter)
app.use('/api/auth', authRouter)
app.use('/api/users', userRouter)
app.use('/api/sections', sectionRouter)

// Cron Jobs 등록
registerCronJobs()

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
})
