import Express from 'express'
import dotenv from 'dotenv'

dotenv.config()

const app = Express()

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
})
