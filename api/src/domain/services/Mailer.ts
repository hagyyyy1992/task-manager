// メール送信ポート (issue #66)。
// 本 PR では LogMailer のみ実装し、SES 等の本番実装は follow-up で差し替える前提。
// Mailer は domain サービスとして定義し、interactor は具体実装に依存しない。
export interface Mailer {
  // パスワードリセット用のリンクをユーザーに送信する。
  // link は完全な URL (例: "https://app.example.com/reset-password?token=xxx")。
  // 失敗時は例外を投げてよい (interactor が catch して email 列挙対策の 200 を維持する)。
  sendPasswordReset(email: string, link: string): Promise<void>
}
