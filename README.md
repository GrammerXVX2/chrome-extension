# Auto Swagger Token Refresher

Расширение Chrome (Manifest V3) для автоматического получения Bearer токена по Basic авторизации и подстановки его в Swagger UI только выбранных микросервисов.

## Ключевые возможности
- Basic заголовок (единое поле) вместо логина/пароля.
- Список микросервисов с индивидуальным включением (checkbox) и авто-обнаружением имени сервиса (пинг корневого URL).
- Автообновление токена через `chrome.alarms` с заданным интервалом (по умолчанию 10 минут).
- Рассылка свежего токена только тем вкладкам, чей URL начинается с baseUrl активного сервиса.
- Многовариантная авторизация Swagger: `authActions.authorize` (несколько схем), `preauthorizeApiKey`, и прямое заполнение модального окна / инпутов.
- Popup: список активных сервисов, индикатор наличия токена и ручное обновление.
- Тихая повторная инъекция, если контент‑скрипт не успел загрузиться (fallback через `chrome.scripting.executeScript`).

## Структура проекта
```
auto-swagger-token/
  manifest.json
  assets/                # Иконки
  src/
    background.js        # Service worker (логика получения и рассылки)
    content/
      contentScript.js   # Инъекция Bearer токена в Swagger UI
    ui/
      options.html       # Страница настроек
      popup.html         # Popup окна расширения
      options.js         # Логика управления настройками
      popup.js           # Логика отображения статуса и ручного refresh
      styles.css         # Единый стиль (тёмная тема)
  .gitignore
  README.md
```

## Установка (Dev)
1. Chrome → Extensions → включить Developer Mode.
2. Нажать `Load unpacked` и выбрать корень `chrome-extension`.
3. Иконка расширения открывает popup; кнопка «Настройки» ведёт на страницу конфигурации.

## Настройка
1. Ввести `Auth Endpoint URL` (GET возвращающий JSON с полем `access_token` / `token` / `data.access_token`).
2. Ввести полный `Basic Header` (если ввели только base64 часть — добавится префикс автоматически).
3. Задать интервал обновления (минуты).
4. Добавить микросервисы: baseUrl должен совпадать с началом URL Swagger страницы (например `https://api.example.com/swagger`).
5. Дождаться авто-пинга имени (если нужно) или заполнить вручную.
6. Отметить активные сервисы и сохранить.

## Работа механизма
- Service worker по будильнику (`chrome.alarms`) запрашивает токен с заголовком `Authorization: <Basic ...>`.
- Парсер пытается извлечь: `access_token`, `token`, `bearer`, либо вложенные `data.access_token`, `data.token`.
- Токен кэшируется в `chrome.storage.local` с меткой времени.
- Для каждого активного сервиса токен отправляется во все вкладки, чей URL начинается с baseUrl.
- Контент‑скрипт авторизует Swagger через несколько путей и закрывает модалку.

## Безопасность
- Basic header хранится в `chrome.storage.sync` открыто. Для продакшена — используйте технический ключ.
- Возможна дальнейшая интеграция простого шифрования / перемещение в `chrome.storage.local`.

## Ограничения
- Предполагается стандартная структура Swagger UI; нестандартные сборки могут требовать доп. селекторы.
- Если endpoint требует POST — измените `fetch` в `background.js` (пример ниже).
- CORS/timeout ошибки при авто-обнаружении имени сервиса — игнорируются.

## Пример смены метода на POST
```js
const resp = await fetch(authEndpoint, {
  method: 'POST',
  headers: { 'Authorization': basicHeader, 'Content-Type': 'application/json' },
  body: JSON.stringify({ grant_type: 'client_credentials' })
});
```

## Установка
1. Открыть Chrome: Меню → More Tools → Extensions.
2. Включить режим разработчика.
3. Нажать "Load unpacked" и выбрать папку `auto-swagger-token`.
4. Клик по иконке расширения откроет popup; кнопка "Настройки" в popup перейдёт на страницу настроек.

## Настройка
1. Ввести `Auth Endpoint URL` — адрес, который возвращает токен (GET).
2. Ввести `Basic Header` полностью (например `Basic Qw4t4lcIASdxmK=`) или только base64 часть.
3. Настроить интервал обновления.
4. Добавить микросервисы: base URL должен совпадать с началом адреса Swagger (например `https://api.example.com/swagger`).
5. Отметить чекбокс только у тех, куда нужно автоматическое обновление.
6. Сохранить.

## Как это работает
- Service worker (background.js) через `chrome.alarms` периодически делает запрос к Auth Endpoint с заголовком `Authorization: <Basic Header>`.
- Полученный токен сохраняется локально и рассылается вкладкам, чей URL начинается с baseUrl активного сервиса.
- Контент-скрипт ловит NEW_TOKEN и пытается применить токен к Swagger UI.

## Безопасность
- Basic header хранится в `chrome.storage.sync` в открытом виде. Если это чувствительные данные — используйте временный пользователь/специальный ключ.
- Можно перенести хранение в `chrome.storage.local` или внедрить простое шифрование (не реализовано в примере).

## Ограничения и заметки
- Предполагается, что Swagger определяет схему как `bearerAuth` (или похожие); при иных названиях может потребоваться ручная корректировка.
- Если токен истекает быстрее 9 минут — уменьшите интервал.
- Если endpoint требует POST, нужно изменить fetch в `background.js`.

## Изменение метода запроса (пример POST)
```js
const resp = await fetch(authEndpoint, {
  method: 'POST',
  headers: { 'Authorization': `Basic ${basic}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ grant_type: 'client_credentials' })
});
```

## TODO / Дальнейшие улучшения
- Поддержка разных схем авторизации для разных сервисов.
- Отображение состояния токена и времени обновления через popup.
- Шифрование секрета.

