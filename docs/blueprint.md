# Альфа‑карту: заявка и лиды — Bot specification

**Archetype:** crm

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

Компактный Telegram‑бот на русском языке, который показывает текущую акцию при оформлении карты Альфа, собирает простые лид‑данные (опционально телефон/email и текстовый вопрос), сохраняет лиды и пересылает отформатированное уведомление владельцу в указанный админ‑чат.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Русскоязычные пользователи, интересующиеся оформлением карты Альфа
- Владельцы/партнёры, собирающие заявки и лиды для последующей обработки

## Success criteria

- Пользователь видит актуальную акцию через /reward и основное меню
- Пользователь может нажать «Хочу оформить карту», заполнить опциональные контакт/вопрос и подтвердить отправку лидa
- Каждый подтверждённый лид сохраняется в хранилище с требуемыми полями
- Владелец (ADMIN_CHAT_ID) получает отформатированное уведомление о новом лиде в указанном чате
- Пользователь получает подтверждение с инструкцией и контактной информацией владельца

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Открыть главное меню (приветствие, кнопка 'Хочу оформить карту', кнопки 'Акция' и 'Помощь')
- **Хочу оформить карту** (button, actor: user, callback: apply:start) — Запустить поток заявки (показывает краткие инструкции, готовое сообщение владельцу и опциональную форму для контакта)
  - outputs: Краткая инструкция и готовое сообщение для копирования, Форма: выбор способа контакта (телефон/email/не давать) и свободный текст, Кнопка подтверждения отправки лида
- **/reward** (command, actor: user, command: /reward) — Показать текущий текст бонуса/акции и кнопку копирования сообщения владельцу
- **/help** (command, actor: user, command: /help) — Краткая помощь по использованию бота и как скопировать сообщение владельцу

## Flows

### Main menu /start
_Trigger:_ /start or deep link

1. Показать приветствие (рус.) и кнопку 'Хочу оформить карту', кнопку 'Акция', кнопку 'Помощь'
2. Прикрепить в приветствии контакт владельца (OWNER_HANDLE) как информация для связи

_Data touched:_ User (read)

### Apply for card (lead capture)
_Trigger:_ callback apply:start (user taps 'Хочу оформить карту')

1. Показать краткие инструкции по оформлению и готовую строку для копирования — сообщение владельцу с шаблоном (включая OWNER_HANDLE)
2. Предложить опциональную форму: выбор контактного метода (Телефон / Email / Не оставлять), поле для ввода контакта (ForceReply for free text), поле для свободного вопроса
3. Валидировать формат контакта (basic phone/email validation) if provided; при неверном формате предложить повторить
4. Показать обзор введённых данных и кнопку 'Отправить заявку'
5. При подтверждении: создать Lead (user id, handle, contact if provided, message, chosen card optional, timestamp), сохранить в БД
6. Отправить отформатированное уведомление админу (ADMIN_CHAT_ID) с lead‑шаблоном и ссылкой/маячком на Telegram пользователя (если доступно)
7. Показать пользователю подтверждение: короткое спасибо, подтверждение отправки, контакт владельца и ожидаемые следующие шаги

_Data touched:_ Lead (create), User (read), CardOffer (read)

### Show reward
_Trigger:_ /reward command or 'Акция' button

1. Загрузить текущий текст CardOffer из хранилища
2. Показать текст акции (до 300 символов) и кнопку 'Скопировать сообщение владельцу' и кнопку 'Хочу оформить карту'

_Data touched:_ CardOffer (read)

### Admin: set reward
_Trigger:_ /set_reward command (admin only)

1. Только админ (ADMIN_CHAT_ID) может отправить /set_reward
2. Бот запрашивает новый текст акции (ForceReply) — owner вводит до 300 символов
3. Бот сохраняет новый CardOffer и подтверждает обновление владельцу
4. Опционально — отправить уведомление в owner чат что текст обновлён

_Data touched:_ CardOffer (create/update)

### Admin: view leads
_Trigger:_ /list_leads command (admin only)

1. Только админ (ADMIN_CHAT_ID) может вызвать /list_leads
2. Бот возвращает список недавних лидов (paged by 10) с кнопками для просмотра деталей или удаления
3. Детали лида показывают все сохранённые поля и ссылку/пересылку сообщения пользователя если актуально

_Data touched:_ Lead (read, delete)

## Owner-supplied settings

The OWNER provides these; they are collected in chat and injected into the environment at deploy. Read each one from the environment where it is used (`ctx.env.<KEY>` / `env.<KEY>` on Cloudflare Workers; `process.env.<KEY>` only as a Node/harness fallback — never the sole read). Do NOT invent your own way of learning the value, do NOT ask for it in a bot message, and do NOT hardcode a default.

- **ADMIN_CHAT_ID** — Куда пересылать новые лиды и где доступны админ‑команды (id чата владельца)
  - this is the OWNER's own chat id; the platform already knows it. Read `ADMIN_CHAT_ID` via `ctx.env` (prefer toolkit `adminChatId` / `requireOwner`) — never ask a user, never treat whoever writes first as the admin, never invent claim-admin or open manage for everyone.
  - may be UNSET at runtime: the bot must still start, and the feature needing ADMIN_CHAT_ID must say so plainly instead of failing.
- **OWNER_HANDLE** — Публичный Telegram‑хэндл владельца для показа в приветствии и шаблоне сообщения (например @kizz_105)
  - may be UNSET at runtime: the bot must still start, and the feature needing OWNER_HANDLE must say so plainly instead of failing.

Your behavioral specs run WITHOUT these values, so no spec may depend on one.

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

An entity that merely NAMES an owner-supplied setting above (an admin chat, an API account) is not something to store or discover — read it from the environment.

- **User** _(retention: session)_ — Telegram user profile interacting with the bot
  - fields: user_id (integer), first_name, last_name (optional), username (optional @handle), language_code (optional)
- **Lead** _(retention: persistent)_ — Запись лида, созданная пользователем при запросе помощи с оформлением карты
  - fields: lead_id (uuid), user_id, username (if any), preferred_contact_method (phone|email|none), contact_value (optional), message_text (optional user question), chosen_card (optional short identifier), timestamp (ISO8601), notified_admin (bool)
- **CardOffer** _(retention: persistent)_ — Краткий текст текущей акции / бонуса при оформлении карты, управляемый владельцем
  - fields: offer_id, text (plain, max 300 chars), updated_by_admin_id, updated_at (timestamp)

## Integrations

- **Telegram** (required) — Bot API messaging, inline keyboards, callback queries, admin notifications
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Установить/обновить текст акции (/set_reward)
- Просмотреть список лидов (/list_leads) с пагинацией
- Удалять/архивировать лиды
- Настроить/изменить ADMIN_CHAT_ID и OWNER_HANDLE (через платформу / конфиг)
- Экспорт лидов (CSV) — админская опция

## Notifications

- Новый лид: отсылается в ADMIN_CHAT_ID в формате: имя/handle пользователя, контакт (если есть), выбранная карта (если есть), текст сообщения, timestamp, ссылка/упоминание на пользователя
- Пользователь: подтверждение после отправки лида с инструкцией и контактной информацией владельца
- Админ: подтверждение после обновления текста акции

## Permissions & privacy

- Храним только данные, введённые пользователем явно: опциональный телефон/email и текст запроса; не запрашиваем/не храним документы и чувствительные данные.
- Доступ к списку лидов и командам админа ограничен ADMIN_CHAT_ID.
- Данные лидов используются только для связи и передачи владельцу; политика хранения: хранить до удаления владельцем (owner может удалять/экспортировать).
- Пользовательская явная отсылка сообщения владельцу считается согласием на передачу введённых контактных данных владельцу.

## Edge cases

- Пользователь не имеет username: бот пересылает lead с user_id и first_name/last_name; администратор не сможет напрямую упомянуть пользователя по handle
- ADMIN_CHAT_ID не задан — при попытке отправить лид бот возвращает понятную ошибку владельцу и сохраняет лид с flagged: true (неотправлено)
- Пользователь оставляет неверный формат телефона/email — показать ошибку и предложить повторить
- Дублирующие отправки: если пользователь повторно отправляет ту же форму в короткий срок, бот сохраняет каждую отправку, но помечает возможный дубль (по timestamp и идентификатору пользователя)
- Пользователь блокирует бота после отправки — сохранение и уведомление админу всё равно происходят, но бот не сможет далее отправлять сообщения пользователю
- Админ пытается вызвать админ‑команду не из ADMIN_CHAT_ID — команда игнорируется с объяснением прав доступа

## Required tests

- Диалог‑приёмка: пользователь нажимает 'Хочу оформить карту', вводит телефон и сообщение, подтверждает — лид сохраняется и уведомление с корректным форматом отправлено в ADMIN_CHAT_ID; пользователь видит подтверждение
- Диалог без контакта: пользователь отправляет заявку без телефона/email — лид сохраняется, админ получает уведомление поле контакта пусто, пользователь получает корректный подтверждающий текст
- Команда /reward: показывает актуальный текст акции; после /set_reward (админ) изменение отражается при следующем /reward
- Валидация контакта: ввод некорректного телефона/email — бот запрашивает корректный ввод
- Админ‑защита: команды админа (/set_reward, /list_leads) работают только из ADMIN_CHAT_ID
- Ошибка отсутствия ADMIN_CHAT_ID: при попытке отправки лида сохраняется локально и помечается как 'notified_admin=false' и пользователь уведомлён, что владелец не получил сообщение
- Пагинация лидов: /list_leads возвращает корректный набор и кнопки навигации
- Удаление лида: админ удаляет лид — проверка что запись удалена и при запросе списка не видна

## Assumptions

- Язык интерфейса — русский во всех пользовательских сообщениях и шаблонах
- OWNER_HANDLE предоставлен владельцем в конфигурации и отображается в приветствии и шаблоне готового сообщения
- Требуется только один админ‑чат (ADMIN_CHAT_ID) для уведомлений и админ‑команд
- Reward текст — короткий plain text до 300 символов, управляется владельцем через админ‑команду
- Нет внешних API (календарей, платёжных шлюзов и т.п.); бот лишь собирает лиды и пересылает их владельцу
