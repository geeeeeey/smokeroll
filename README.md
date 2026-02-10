# tg-shop (Telegram bot + Mini App)

Готовый проект Telegram-магазина.

## Что внутри

### Backend (Node.js + TypeScript)
- **Telegraf bot**
  - `/start` — кнопка открытия магазина (WebApp)
  - `/admin` — назначить себя админом (сохраняет chat_id)
  - `/addproduct` — мастер добавления товара (название → цена → остаток → фото или `/skip`)
  - `/editproduct <id>` — редактирование товара (название/цена/остаток/фото/скрыть)
  - `/stock` — список товаров с остатками
  - `/setstock <id> <число>` — установить остаток
  - `/setprice <id> <число>` — установить цену
  - `/orders` — последние 10 заказов

- **Express API**
  - `GET /products` — каталог
  - `POST /orders` — создать заказ (вариант A: без телефона/адреса) + списать остатки в транзакции
  - `GET /images/:fileId` — прокси для картинок Telegram (по `file_id`)
  - `GET /health` — проверка

- **DB**: PostgreSQL + Prisma

### WebApp (Mini App)
- React + Vite
- Framer Motion (анимации)
- Каталог: картинка, цена, остаток, +/- в корзину
- Корзина/итого/оформление
- Экран подтверждения 18+

> Важно: продажа вейп/никотин товаров может регулироваться законом. Этот проект — технический шаблон.

## Быстрый старт (локально)

### 1) База данных
Нужен PostgreSQL. Создайте БД, например `tgshop`.

### 2) Backend

```bash
cd backend
npm i
cp .env.example .env
# заполните BOT_TOKEN, DATABASE_URL, WEBAPP_URL, PUBLIC_BASE_URL
npm run prisma:migrate
npm run seed
npm run dev
```

### 3) WebApp

```bash
cd webapp
npm i
cp .env.example .env
# заполните VITE_API_URL (адрес backend)
npm run dev
```

### 4) Настройка в Telegram
1. Создайте бота в @BotFather, получите `BOT_TOKEN`.
2. Запустите backend, напишите боту `/admin` со своего аккаунта.
3. Нажмите `/start` → «Открыть магазин».

## ENV переменные

### backend/.env
- `BOT_TOKEN` — токен бота
- `DATABASE_URL` — строка подключения Postgres
- `WEBAPP_URL` — публичная ссылка на WebApp (https://...)
- `PUBLIC_BASE_URL` — публичная ссылка на API (https://...)
- `PORT` — порт API (по умолчанию 3000)

### webapp/.env
- `VITE_API_URL` — публичный URL API

## Деплой
Подойдет Render/Fly.io/VPS.
- WebApp нужно задеплоить как статический сайт.
- Backend — как Node service + Postgres.
- В `WEBAPP_URL` укажите URL WebApp.
- В `PUBLIC_BASE_URL` укажите URL API.

