// Проверка ключа и модели без Telegram: npm run smoke -- "привет"
//
// Смысл в том, чтобы отделить проблемы с Anthropic от проблем с ботом.
// Если здесь ответ печатается, а в Telegram тишина — дело не в ключе.

import { ask, ClaudeError } from '../src/claude.js';
import { config } from '../src/config.js';

const question = process.argv.slice(2).join(' ') || 'Ответь одним словом: связь есть?';

console.log(`Модель: ${config.model}`);
console.log(`Вопрос: ${question}\n`);

try {
  const answer = await ask([{ role: 'user', content: question }]);
  console.log(answer);
} catch (error) {
  console.error(error instanceof ClaudeError ? error.chatMessage : error);
  process.exit(1);
}
