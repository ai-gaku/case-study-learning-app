# 事例検討型Web教材：初期試作版

## できること
- 2事例の切替（`cases.js`を書き換えれば事例を増やせる）
- 最初の回答→学習支援の選択→最終回答→別事例→振り返り
- 支援の利用記録・回答保存（デモ用ブラウザ内仮保存、またはSupabase）
- PC/スマートフォン対応の簡素なUI

## 注意：まだ実証研究・授業本番用ではありません
これは動作確認用の初期試作です。学生の実データを使う前に、研究倫理・同意・情報セキュリティ・アクセス制御・データ保持期間・アクセシビリティ・性能の検証が必要です。架空の事例と架空の回答のみで動作確認してください。

## 最短の動作確認
1. ファイル一式を同じフォルダに配置し、`index.html`をブラウザで開く。
2. 事例を選び、各設問に架空の文章を入力して最後まで進む。
3. `config.js` が空なら**デモモード**。ブラウザのlocalStorageだけに記録。**研究用の永続保存ではない**。

## GitHubとVercelで公開する
1. GitHubで新しいリポジトリを作る（初回はprivate推奨）。
2. このフォルダの **中にある** `index.html`, `style.css`, `app.js`, `cases.js`, `config.js`, `supabase.sql`, `README.md` をリポジトリのルートにアップロードする。
3. VercelでGitHubと連携し、`Add New... > Project`からリポジトリをImport。
4. Framework Presetは`Other`を選ぶ。ビルドコマンドは不要。Root Directoryはリポジトリのルートのまま。Deployする。
5. 発行されたURLを自分で開き、架空データで動作確認。

※デモモードのまま公開した場合は、各自の端末内にしかデータは残らず、教員は回収できません。

## Supabaseで回答を保存する（別の設定が必要）
1. Supabaseで新規プロジェクト作成。DBパスワードは安全に保管。
2. `SQL Editor > New query`で `supabase.sql` の内容を貼り付け、Run。
3. `Authentication > Providers`（UIによって表示名が異なる）から**Anonymous Sign-ins**を有効にする。これはSupabase Authでの匿名ユーザー認証であり、公開anon keyとは別の設定。
4. `Project Settings / Connect` 等にある Project URL と **publishable key**（既存プロジェクトでは anon key）を確認。
5. `config.js` の `SUPABASE_URL` と `SUPABASE_PUBLISHABLE_KEY` に設定する。**secret/service_roleキーは絶対に入力しない**。
6. GitHubへ `config.js` をアップロードし、Vercel側の再公開を確認。
7. 画面上部の表示が「データベース接続」になり、架空の回答を最後まで入力してSupabaseの `Table Editor > learning_events` に行が追加されることを確認。
8. Table EditorでCSVエクスポートできる。表形式への変換は `event_type` と `session_id` で行う。

**セキュリティ注意**：公開publishable/anonキーはブラウザで参照される前提のキーです。安全性はRLS等のアクセス制御に依存します。設定ミス、権限漏れ、不正大量投稿を考慮し、学内の担当者と確認してください。匿名ログインでは、端末やブラウザを変えた学生が同じ本人として記録されません。正規運用時には学内認証または教員管理の参加コード等の設計が必要です。

## 研究データの設計
`learning_events` に `user_id`（匿名認証ID）、`session_id`、`case_id`、`case_version`、`event_type`、`payload`、`created_at` を記録。
- draft: 初回回答
- hint_open: ヒントID
- extra_open: 追加観察情報へのアクセス
- final: 最終回答
- transfer: 別事例の回答
- reflection: 振り返り

ヒントを開いたことは理解や困難を証明しない。別事例は初回課題と難易度が一致しているとは限らないため、このまま因果効果や学習転移を断定できない。**この試作版には自動採点、教員専用画面、本人確認、真正なオフライン利用機能はまだありません。**

## 将来の改善優先順位
1. ログイン／本人識別と教員ロール、参加同意・研究不参加の扱い
2. 入力途中の自動保存と通信断・再送・重複防止
3. 共通ルーブリック評価と教員用管理画面
4. 学生が困った理由の選択、支援選択理由の取得
5. 複数事例の難易度調整と比較研究用の条件割付
6. アクセシビリティ試験、個人情報保護、保持・削除手順の確立
