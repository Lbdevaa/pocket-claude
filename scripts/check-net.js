// Доступны ли оба API. Ключей не требует — нужна только сеть.
//
// Используется двумя способами: руками, когда бот молчит и непонятно почему,
// и из start.bat, который после перезагрузки ждёт, пока поднимется VPN.
// Код возврата: 0 — связь есть, 1 — нет.

const TARGETS = [
  ['Telegram ', 'https://api.telegram.org'],
  ['Anthropic', 'https://api.anthropic.com/v1/models'],
];

const TIMEOUT = 8000;

let allReachable = true;

for (const [name, url] of TARGETS) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
    // Любой ответ означает, что достучались. 401 от Anthropic — норма:
    // ключ мы не отправляли, а сервер успел сказать, что его нет.
    console.log(`${name}: доступен (HTTP ${response.status})`);
  } catch (error) {
    console.log(`${name}: НЕДОСТУПЕН (${error.cause?.code ?? error.name})`);
    allReachable = false;
  }
}

if (!allReachable) {
  console.log('\nСкорее всего не поднят VPN.');
  process.exit(1);
}
