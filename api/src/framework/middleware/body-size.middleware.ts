import type { MiddlewareHandler } from 'hono'

// HTTP request body の早期サイズ拒否ミドルウェア (issue #63)。
//
// 目的:
//   API Gateway HTTP API の payload 上限 (10 MB) は緩く、アプリ層 (zod) で
//   弾く前に Lambda 側で受信・パースが走ることでコスト/実行時間が膨らむ。
//   Content-Length が閾値を超えるリクエストは即座に 413 で打ち切る。
//
// 多層防御:
//   - WAF 層: terraform/waf.tf の size_constraint_statement で edge で block。
//   - アプリ層 (本ファイル): WAF を bypass された場合や、開発時の同等保護。
//
// 仕様:
//   - Content-Length ヘッダーがあり、閾値を超える → 413 Payload Too Large。
//   - Content-Length が無い (chunked transfer 等) → 素通し。
//     API Gateway は HTTP API でも request body を 10 MB に制限しており、
//     chunked 経由で無制限に流れ込むことはない。さらに本アプリで chunked を
//     正規利用するエンドポイントは存在しない。
//   - 0 / 不正値の Content-Length → 素通し (json-body middleware 側で扱う)。
//
// 注: 本実装は Content-Length ヘッダーを信頼するが、ヘッダーが嘘でも
//     実 body は API GW / Lambda / WAF が 10MB で頭打ちにするため致命的にならない。
//     真に厳密なサイズ計測 (stream 読みながらカウント) は Hono の bodyLimit
//     middleware が提供するが、Lambda + Hono の構成では request 全体が
//     先に受信されるため早期 reject の効果が薄く、ここではヘッダーチェックに留める。

export const DEFAULT_BODY_SIZE_LIMIT_BYTES = 64 * 1024

export interface BodySizeMiddlewareOptions {
  /** 上限 byte 数。既定 64 KB。 */
  limitBytes?: number
}

export function createBodySizeMiddleware(
  options: BodySizeMiddlewareOptions = {},
): MiddlewareHandler {
  const limit = options.limitBytes ?? DEFAULT_BODY_SIZE_LIMIT_BYTES
  return async (c, next) => {
    const raw = c.req.header('content-length')
    if (raw === undefined) return next()
    // 0/負/NaN は不正ヘッダーとして無視して素通り (json-body middleware に判断を委ねる)。
    const len = Number(raw)
    if (!Number.isFinite(len) || len <= 0) return next()
    if (len > limit) {
      return c.json({ error: 'payload too large' }, 413)
    }
    return next()
  }
}
