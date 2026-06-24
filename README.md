# medication-log

ローカル確認用の静的サイトです。`index.html` と `manage.html` をローカルサーバー経由で開いて確認できます。

## 起動方法

```bash
./start-local.sh
```

デフォルトでは `http://127.0.0.1:4173` で起動します。

ポートを変更する場合:

```bash
PORT=8080 ./start-local.sh
```

## 補足

- Supabase の接続先は [config.js](/home/ysk2tzk/medication-log/config.js:1) に定義されています。
- Google カレンダーの完全自動登録は Supabase Edge Function `google-calendar-log` で行います。フロント側では [config.js](/home/ysk2tzk/medication-log/config.js:1) の `MEDICATION_LOG_GOOGLE_FUNCTION_NAME` を使って関数名を指定できます。
- 関数側では `GOOGLE_CALENDAR_ID`、`GOOGLE_SERVICE_ACCOUNT_EMAIL`、`GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` の secrets 設定が必要です。
- 対象の Google カレンダーは、サービスアカウントのメールアドレスに「予定の変更」権限で共有してください。
- `medication_log.google_calendar_event_id` 列があれば、作成した Google イベント ID を保存します。
- CDN と Supabase に接続するため、ブラウザ側ではネットワーク接続が必要です。

## Edge Function デプロイ

```bash
supabase functions deploy google-calendar-log
supabase secrets set GOOGLE_CALENDAR_ID=...
supabase secrets set GOOGLE_SERVICE_ACCOUNT_EMAIL=...
supabase secrets set GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY='-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n'
```

関数設定は [supabase/config.toml](/home/ysk2tzk/medication-log/supabase/config.toml:1) にあります。`verify_jwt = false` にしているため、このアプリのようにブラウザから直接 `invoke()` できます。
