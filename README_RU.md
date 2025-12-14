# SKR Airdrop – Vercel version

Готовый проект под Vercel:

- `api/claim.js` – серверлес-функция, рассылает 500 SKR
- `public/index.html` – сайт с логотипом, анимацией снега и кнопкой Claim
- `package.json` – зависимости

## Как запустить на Vercel

1. Создай новый репозиторий на GitHub, например `skr-airdrop-vercel`.
2. Залей туда содержимое этой папки:
   - `package.json`
   - папка `api` с `claim.js`
   - папка `public` с `index.html`
3. Зайди на vercel.com, залогинься через GitHub.
4. Нажми **New Project**, выбери репозиторий `skr-airdrop-vercel`, жми Deploy.
5. В настройках проекта на Vercel открой **Environment Variables** и добавь:
   - `RPC_URL = https://api.mainnet-beta.solana.com`
   - `AIRDROP_PRIVATE_KEY_BASE58 = твой base58 приватный ключ кошелька, с которого раздаёшь SKR`
6. Сохрани переменные и сделай **redeploy** (или Vercel сам перезапустит).
7. После деплоя получишь ссылку вида `https://...vercel.app` – это твой постоянный сайт.

Приватный ключ держи **только** в переменной окружения Vercel, не клади его в код и репозиторий.
