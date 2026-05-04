import type { Mailer } from '../../domain/services/Mailer.js'

// 開発・テスト用の Mailer 実装 (issue #66)。
// console.info にリンクを出力するだけで実送信しない。
// 本番環境では SesMailer (follow-up issue) に差し替える。
//
// セキュリティ注意:
// - email は構造化ログに残るため、本番ログ収集対象に含める場合は PII 取り扱いに注意。
//   本実装は dev/staging のみで使う前提。SES_ENABLED=true で本番は SesMailer を使う設計。
export class LogMailer implements Mailer {
  async sendPasswordReset(email: string, link: string): Promise<void> {
    console.info('mail.password_reset.dev', { email, link })
  }
}
