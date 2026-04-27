import { randomUUID } from 'crypto'
import type { TokenService } from '../../../domain/services/TokenService.js'
import type { TokenRepository } from '../../../domain/repositories/TokenRepository.js'
import type { IssueMcpTokenInput, IssueMcpTokenOutput, IssueMcpTokenUseCase } from './input-port.js'

const MAX_LABEL_LENGTH = 100

// label は MAX_LABEL_LENGTH を超える場合 invalid_input。空文字 / 未指定は許容。
function normalizeLabel(label: string | undefined): string | null {
  const trimmed = (label ?? '').trim()
  if (trimmed.length > MAX_LABEL_LENGTH) return null
  return trimmed
}

export class IssueMcpTokenInteractor implements IssueMcpTokenUseCase {
  constructor(
    private readonly tokens: TokenService,
    private readonly tokenRepo: TokenRepository,
  ) {}

  async execute(input: IssueMcpTokenInput): Promise<IssueMcpTokenOutput> {
    const label = normalizeLabel(input.label)
    if (label === null) {
      return {
        ok: false,
        reason: 'invalid_input',
        message: `label は ${MAX_LABEL_LENGTH} 文字以内で指定してください`,
      }
    }
    // jti / id は推測困難な乱数 (UUIDv4)。jti が JWT claim と DB の照合キーになる。
    // jti は内部識別子のため output には含めない (codex review #50 対応)。
    const id = randomUUID()
    const jti = randomUUID()
    const token = await this.tokens.issueLongLived(input.userId, jti)
    await this.tokenRepo.create({ id, userId: input.userId, scope: 'mcp', jti, label })
    return { ok: true, token, tokenId: id }
  }
}
