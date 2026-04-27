import { handle } from 'hono/aws-lambda'
import { buildApp } from './index.js'

export const handler = handle(buildApp())
