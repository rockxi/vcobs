# vcobs

Публичный read-only просмотрщик Obsidian vault, синхронизируемого через Self-hosted LiveSync и CouchDB.

Заметка доступна по `/{slug}` только если в самом начале файла есть frontmatter:

```md
---
vcobs-link = note_1
---
```

Также поддерживается стандартная YAML-запись `vcobs-link: note_1`. `slug` может содержать латинские буквы, цифры, `_` и `-`. Повторяющийся slug намеренно не публикуется до устранения дубликата.

## Запуск

```bash
cp .env.example .env.local
npm install
npm run dev
```

### Docker

```bash
docker compose up --build -d
```

Сервис будет доступен на `http://localhost:3080`. Compose передаёт секреты из `.env.local` только во время запуска контейнера; они не попадают в Docker-образ. Остановить сервис: `docker compose down`.

Переменные CouchDB используются только сервером. Не добавляйте к ним префикс `NEXT_PUBLIC_` и не коммитьте `.env.local`.

После изменения видимости можно либо подождать до 60 секунд, либо обновить индекс:

```bash
curl -X POST http://localhost:3000/api/v1/refresh \
  -H "Authorization: Bearer $VCOBS_REFRESH_TOKEN"
```

## Что делает сервис

- Находит Markdown-метаданные LiveSync (`plain` и `newnote`), исключает `deleted: true`.
- Собирает содержание заметки из упорядоченного массива `children` (`h:*` leaf-документы).
- Рендерит Markdown и GFM-таблицы, чекбоксы, ссылки и код.
- Рендерит `.excalidraw.md` с JSON-сценой в разделе `# Drawing` в интерактивном режиме просмотра.
- Поддерживает Obsidian-embeds `![[image.png]]` и относительные Markdown-картинки. Медиа отдаётся только по ссылке из опубликованной заметки.
- Не создаёт и не изменяет документы в исходной базе `obsidian`.

Для production задайте отдельный длинный `VCOBS_REFRESH_TOKEN`, запустите `npm run build && npm run start` за reverse proxy с HTTPS.

Проверка работы контейнера: `GET /api/health` возвращает `{ "status": "ok" }`.

На главной странице можно вставить до 100 000 символов текста и получить публичную ссылку. Вставки хранятся отдельно от Obsidian в `data/pastes` и автоматически удаляются через 24 часа.
