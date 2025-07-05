import Express from 'express'
import dotenv from 'dotenv'

import articleRouter from './src/routes/article'

dotenv.config()

const app = Express()
app.use(Express.json())

app.use('/api/articles', articleRouter)

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
})
