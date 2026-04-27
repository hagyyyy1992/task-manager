import { handle } from 'hono/aws-lambda'
import { buildApp } from './src/framework/app.js'

export const handler = handle(buildApp())
