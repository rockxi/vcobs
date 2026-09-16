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

## Администратор

`/admin` закрыт отдельным паролем. Для работы нужны `VCOBS_ADMIN_PASSWORD_HASH` и `VCOBS_ADMIN_SESSION_SECRET`. Примеры генерации и обязательного для Docker Compose экранирования `$` как `$$` приведены в `.env.example`; пароль в `.env.local` не записывается — сохраните его отдельно. При отсутствующей или повреждённой конфигурации вход закрыт. Сессия действует 8 часов, хранится в подписанной HttpOnly-cookie с `SameSite=Strict` и `Secure` в production. Вход ограничен пятью неудачными попытками на 15 минут для каждого IP и общим лимитом 50 неудач на экземпляр за тот же период.

По умолчанию заголовки `X-Forwarded-*` не доверяются: все попытки получают общий консервативный лимит. Задайте `VCOBS_TRUST_PROXY_HEADERS=true` только если ваш nginx **перезаписывает**, а не передаёт значения клиента: `proxy_set_header X-Forwarded-For $remote_addr;`, `proxy_set_header X-Forwarded-Host $host;`, `proxy_set_header X-Forwarded-Proto $scheme;`. В этом режиме origin сверяется с публичными `X-Forwarded-Host` и `X-Forwarded-Proto`, а клиентский лимит использует валидный IP из `X-Forwarded-For`.

Проверка работы контейнера: `GET /api/health` возвращает `{ "status": "ok" }`.

На главной странице можно вставить до 1 000 000 символов текста или отправить файл до 500 МБ и получить публичную ссылку. Для текста можно включить «Редактирование»: тогда любой посетитель ссылки сможет сохранить новую полную версию текста, но исходный 12-часовой срок не продлевается. По умолчанию (и для ранее созданных ссылок) текст доступен только для чтения. Вставки хранятся отдельно от Obsidian в `data/pastes`, а файлы — в named Docker volume `vcobs-files`; оба типа временно доступны 12 часов.

Образ заранее создаёт `/app/data/files` с UID/GID `1001`, под которым работает приложение. При первом подключении пустого named volume Docker переносит эти права в `vcobs-files`; volume сохраняется между `docker compose up` и пересозданиями контейнера. Bind mount `data/pastes` остаётся отдельным и workflow его не изменяет.

Для production-загрузок reverse proxy должен принимать тело запроса немного больше лимита приложения: для nginx в vhost `vcobs` задайте как минимум `client_max_body_size 512m;` (500 MiB файла плюс небольшой запас протокола) и перезагрузите nginx. Лимит самого приложения остаётся ровно 500 MiB.
