import { Link } from 'react-router-dom'

export function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link to="/register" className="text-blue-500 hover:underline text-sm">← 新規登録に戻る</Link>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-4 mb-6">利用規約</h1>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 text-sm text-gray-700 dark:text-gray-300 space-y-4 leading-relaxed">
          <p>本利用規約（以下「本規約」）は、Task Manager（以下「本サービス」）の利用条件を定めるものです。</p>

          <h2 className="font-semibold text-gray-900 dark:text-gray-100">1. サービスの提供</h2>
          <p>本サービスは個人が運営するタスク管理ツールです。サービスの継続性、可用性、データの保全について一切の保証はありません。</p>

          <h2 className="font-semibold text-gray-900 dark:text-gray-100">2. アカウント</h2>
          <p>ユーザーは正確な情報を登録し、パスワードを適切に管理する責任を負います。アカウントの不正利用について運営者は責任を負いません。</p>

          <h2 className="font-semibold text-gray-900 dark:text-gray-100">3. 禁止事項</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>サービスへの不正アクセスや攻撃行為</li>
            <li>他のユーザーへの迷惑行為</li>
            <li>違法な目的での使用</li>
          </ul>

          <h2 className="font-semibold text-gray-900 dark:text-gray-100">4. 免責事項</h2>
          <p>本サービスは現状有姿で提供されます。データの消失、サービスの停止・終了により生じた損害について、運営者は一切の責任を負いません。予告なくサービスを変更・終了する場合があります。</p>

          <h2 className="font-semibold text-gray-900 dark:text-gray-100">5. データの削除</h2>
          <p>運営者は、不適切と判断したアカウントやデータを予告なく削除する場合があります。</p>

          <h2 className="font-semibold text-gray-900 dark:text-gray-100">6. 規約の変更</h2>
          <p>本規約は予告なく変更する場合があります。変更後もサービスを利用した場合、変更後の規約に同意したものとみなします。</p>

          <p className="text-gray-500 dark:text-gray-400 text-xs mt-6">最終更新日: 2026年4月16日</p>
        </div>
      </div>
    </div>
  )
}
