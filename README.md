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

- Supabase の接続先は [config.js](/home/netforce/medication-log/config.js:1) に定義されています。
- Google カレンダー連携を使う場合は [config.js](/home/netforce/medication-log/config.js:1) の `MEDICATION_LOG_GOOGLE_CLIENT_ID`、`MEDICATION_LOG_GOOGLE_ACCOUNT_EMAIL`、`MEDICATION_LOG_GOOGLE_CALENDAR_ID` を設定してください。
- `medication_log` テーブルには `medicine_id` に加えて `google_calendar_event_id` 列が必要です。Google イベント作成後に、その `event.id` を保存します。
- CDN と Supabase に接続するため、ブラウザ側ではネットワーク接続が必要です。
