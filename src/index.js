// Точка входа: собрать бота из готовых частей и не дать ему упасть.

import { Bot } from 'grammy';

import { ask, ClaudeError } from './claude.js';
import { config } from './config.js';
import * as history from './history.js';
import { sendLong } from './telegram.js';

const bot = new Bot(config.tgToken);

// Telegram гасит индикатор «печатает» через 5 секунд, а Claude думает дольше.
const TYPING_INTERVAL = 4000;

const HELP = [
  'Пишу ответы через Claude и помню разговор, так что уточнять можно коротко.',
  '',
  '/reset — забыть разговор и начать заново',
  '',
  `Модель: ${config.model}. Помню последние ${config.historyLimit} сообщений.`,
].join('\n');

// Whitelist. Стоит первым — до него не доходит ни одна команда и ни один
// обработчик, поэтому проверять доступ где-то ещё не нужно.
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;

  if (userId && config.allowedUserIds.has(userId)) return next();

  console.warn(`Отказано в доступе: user id ${userId ?? 'неизвестен'}`);
  await ctx.reply('Это личный бот, доступ только у владельца.').catch(() => {});
});

bot.command('start', (ctx) => ctx.reply(HELP));

bot.command('reset', async (ctx) => {
  const removed = history.clear(ctx.chat.id);
  await ctx.reply(
    removed > 0 ? `Забыл разговор (${removed} сообщений).` : 'Забывать пока нечего.',
  );
});

bot.on('message:text', async (ctx) => {
  const chatId = ctx.chat.id;
  const question = ctx.message.text;

  try {
    // Вопрос подмешиваем к истории, но в базу пишем только после успешного
    // ответа: иначе неудачный запрос оставил бы висеть реплику без пары.
    const answer = await withTyping(ctx, () =>
      ask([...history.get(chatId), { role: 'user', content: question }]),
    );

    history.append(chatId, 'user', question);
    history.append(chatId, 'assistant', answer);

    await sendLong(ctx, answer);
  } catch (error) {
    // В лог — длину и id чата, но не текст: лог могут увидеть посторонние.
    console.error(`Ошибка в чате ${chatId} (вопрос ${question.length} симв.):`, error);

    const explanation =
      error instanceof ClaudeError ? error.chatMessage : 'Не смог ответить. Подробности в логе.';
    await ctx.reply(explanation).catch(() => {});
  }
});

// TODO: голосовые и картинки. У Claude есть vision, так что фото — вопрос
// нескольких строк, но по ТЗ пока только текст.
bot.on('message', (ctx) => ctx.reply('Пока понимаю только текст.'));

/** Держать «печатает» включённым, пока идёт работа. */
async function withTyping(ctx, work) {
  const ping = () => ctx.replyWithChatAction('typing').catch(() => {});

  ping();
  const timer = setInterval(ping, TYPING_INTERVAL);

  try {
    return await work();
  } finally {
    clearInterval(timer);
  }
}

// Последний рубеж: сюда попадает всё, что не поймали обработчики.
// Логируем и живём дальше — уронить процесс тут значит уйти в офлайн до
// следующего перезапуска.
bot.catch((error) => {
  console.error(`Необработанная ошибка (update ${error.ctx?.update?.update_id}):`, error.error);
});

process.on('unhandledRejection', (reason) => console.error('Необработанный reject:', reason));
process.on('uncaughtException', (error) => console.error('Необработанное исключение:', error));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    console.log('\nОстанавливаюсь…');
    await bot.stop();
    history.close();
    process.exit(0);
  });
}

// Здоровается с Telegram до старта опроса: неверный токен или отсутствие сети
// должны выглядеть как внятная строчка, а не как стектрейс при первом сообщении.
try {
  const me = await bot.api.getMe();
  console.log(
    `Бот @${me.username} запущен. Модель ${config.model}, доступ у ${config.allowedUserIds.size} чел.`,
  );
} catch (error) {
  console.error('Не удалось подключиться к Telegram:', error.description ?? error.message);
  console.error('Проверь TG_TOKEN в .env и что VPN включён (npm run check-net).');
  process.exit(1);
}

bot.start();
