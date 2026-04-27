import { Link } from 'react-router-dom'

export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link to="/register" className="text-blue-500 hover:underline text-sm">
          ← 新規登録に戻る
        </Link>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-4 mb-6">
          プライバシーポリシー
        </h1>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 text-sm text-gray-700 dark:text-gray-300 space-y-4 leading-relaxed">
          <p>
            本プライバシーポリシーは、Task
            Manager（以下「本サービス」）における個人情報の取り扱いについて定めます。
          </p>

          <h2 className="font-semibold text-gray-900 dark:text-gray-100">1. 収集する情報</h2>
          <p>本サービスでは、アカウント登録時に以下の情報を収集します。</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>名前</li>
            <li>メールアドレス</li>
            <li>パスワード（ハッシュ化して保存）</li>
          </ul>

          <h2 className="font-semibold text-gray-900 dark:text-gray-100">2. 情報の利用目的</h2>
          <p>収集した情報は、以下の目的でのみ使用します。</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>ユーザー認証およびアカウント管理</li>
            <li>サービスの提供・維持</li>
          </ul>

          <h2 className="font-semibold text-gray-900 dark:text-gray-100">3. 第三者への提供</h2>
          <p>
            収集した個人情報を第三者に提供・販売することはありません。ただし、法令に基づく場合を除きます。
          </p>

          <h2 className="font-semibold text-gray-900 dark:text-gray-100">4. データの保管</h2>
          <p>
            データはNeon
            PostgreSQL（クラウドデータベース）に保管されます。パスワードはハッシュ化して保存しており、平文では保存しません。
          </p>

          <h2 className="font-semibold text-gray-900 dark:text-gray-100">5. データの削除</h2>
          <p>
            ユーザーはアカウント設定画面からいつでもアカウントを削除できます。アカウント削除時に、ユーザーに紐付くすべてのデータが完全に削除されます。
          </p>

          <h2 className="font-semibold text-gray-900 dark:text-gray-100">6. Cookie</h2>
          <p>
            本サービスではCookieは使用しません。認証情報はブラウザのローカルストレージに保存されます。
          </p>

          <h2 className="font-semibold text-gray-900 dark:text-gray-100">7. ポリシーの変更</h2>
          <p>本ポリシーは予告なく変更する場合があります。</p>

          <p className="text-gray-500 dark:text-gray-400 text-xs mt-6">最終更新日: 2026年4月16日</p>
        </div>
      </div>
    </div>
  )
}
