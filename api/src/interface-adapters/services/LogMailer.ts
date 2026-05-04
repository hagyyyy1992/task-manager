import type { Mailer } from '../../domain/services/Mailer.js'

// 開発・テスト用の Mailer 実装 (issue #66)。
// console.info にリンクを出力するだけで実送信しない。
// 本番環境では SesMailer (follow-up issue) に差し替える。
//
// セキュリティ注意:
// - reset token を構造化ログ (JSON) に含めない。ログ集約基盤に token が混入するのを防ぐ。
//   開発者確認用のリンクは平文行として別途出力し、JSON ログ収集対象外とする前提。
export class LogMailer implements Mailer {
  async sendPasswordReset(email: string, link: string): Promise<void> {
    // 構造化ログには email のみ。token は含めない
    console.info('mail.password_reset.dev', { email })
    // 開発者向けリンク (JSON ログ集約の対象外)
    console.info(`[LogMailer] password reset link → ${link}`)
  }
}
