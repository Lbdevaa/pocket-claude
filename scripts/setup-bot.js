// Оформление бота в Telegram: описание, подпись в профиле и меню команд.
//
// Запускается один раз (и потом при изменении текстов): npm run setup-bot
// Это глобальные настройки бота на стороне Telegram, а не состояние процесса,
// поэтому дёргать их при каждом старте незачем.
//
// Заменяет ручную возню с @BotFather (/setdescription, /setabouttext, /setcommands).

import { Bot } from 'grammy';

import { config } from '../src/config.js';

// Экран до первого /start — то, что видно в пустом чате.
const DESCRIPTION = [
  'Личный ассистент на Claude.',
  '',
  'Пишешь вопрос — получаешь ответ. Бот помнит разговор, так что уточнять можно',
  'коротко, не пересказывая всё заново.',
  '',
  'Доступ только у владельца.',
].join('\n');

// Строчка в профиле бота и в списке чатов.
const SHORT_DESCRIPTION = 'Личный ассистент на Claude';

// Меню по кнопке «/» рядом с полем ввода.
const COMMANDS = [
  { command: 'start', description: 'Что умею' },
  { command: 'reset', description: 'Забыть разговор и начать заново' },
];

const bot = new Bot(config.tgToken);

const me = await bot.api.getMe();

await bot.api.setMyDescription(DESCRIPTION);
await bot.api.setMyShortDescription(SHORT_DESCRIPTION);
await bot.api.setMyCommands(COMMANDS);

console.log(`Оформлен бот @${me.username}:`);
console.log('  • описание и подпись в профиле обновлены');
console.log(`  • команды в меню: ${COMMANDS.map((c) => '/' + c.command).join(', ')}`);
console.log('\nЕсли чат с ботом уже открыт, Telegram обновит текст не сразу — перезайди в него.');
