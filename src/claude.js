// Клиент Anthropic: собрать запрос, разобрать ответ, перевести ошибки
// на человеческий язык.
//
// Наружу торчит одна функция ask() и один класс ошибки. Всё, что бот показывает
// пользователю при неудаче, формулируется здесь — обработчику в index.js
// остаётся только вывести .chatMessage в чат.

import Anthropic from '@anthropic-ai/sdk';

import { config } from './config.js';

const client = new Anthropic({ apiKey: config.apiKey });

// Adaptive thinking есть не у всех моделей: на Haiku 4.5 и более старых
// такой запрос вернёт 400. Список проще и честнее, чем угадывание по имени.
const ADAPTIVE_THINKING = [
  'claude-opus-5',
  'claude-opus-4-8',
  'claude-opus-4-7',
  'claude-opus-4-6',
  'claude-sonnet-5',
  'claude-sonnet-4-6',
];

/** Ошибка, которую не стыдно показать пользователю в чат. */
export class ClaudeError extends Error {
  constructor(chatMessage, cause) {
    super(chatMessage, { cause });
    this.name = 'ClaudeError';
    this.chatMessage = chatMessage;
  }
}

/**
 * Спросить Claude. На вход — история в формате API (от старых к новым,
 * начиная с сообщения пользователя), на выход — текст ответа.
 */
export async function ask(messages) {
  let response;

  try {
    response = await client.messages.create({
      model: config.model,
      max_tokens: config.maxTokens,
      system: config.systemPrompt,
      messages,
      // Историю шлём целиком каждый раз, поэтому повторяющийся префикс
      // выгодно кэшировать: то же самое, но заметно дешевле.
      cache_control: { type: 'ephemeral' },
      ...(ADAPTIVE_THINKING.includes(config.model)
        ? { thinking: { type: 'adaptive' } }
        : {}),
    });
  } catch (error) {
    throw new ClaudeError(explain(error), error);
  }

  // Модель может отказаться отвечать — это HTTP 200, а не исключение.
  if (response.stop_reason === 'refusal') {
    throw new ClaudeError('Модель отказалась отвечать на этот запрос.');
  }

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  if (!text) {
    throw new ClaudeError('Модель вернула пустой ответ. Попробуй переформулировать.');
  }

  // Ответ упёрся в потолок max_tokens — предупреждаем, а не молчим:
  // иначе обрыв на полуслове выглядит как баг.
  if (response.stop_reason === 'max_tokens') {
    return `${text}\n\n_(ответ обрезан по лимиту MAX_TOKENS)_`;
  }

  return text;
}

// Разбор ошибок по типизированным классам SDK, от частного к общему.
// По тексту сообщения не проверяем: он меняется без предупреждения.
function explain(error) {
  if (error instanceof Anthropic.AuthenticationError) {
    return 'Ключ Anthropic не принят. Проверь ANTHROPIC_API_KEY в .env.';
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return 'Доступ к модели закрыт. Проверь, что MODEL в .env доступна твоему аккаунту.';
  }
  if (error instanceof Anthropic.RateLimitError) {
    return 'Слишком много запросов подряд. Подожди с полминуты и повтори.';
  }
  if (error instanceof Anthropic.BadRequestError) {
    // Сюда же попадает исчерпанный баланс — самая частая причина на старте.
    return `Запрос отклонён: ${error.message}`;
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return 'Не достучался до api.anthropic.com. Проверь, что VPN включён.';
  }
  if (error instanceof Anthropic.APIError) {
    return `Anthropic вернул ошибку ${error.status ?? '?'}. Скорее всего временно — попробуй ещё раз.`;
  }
  return 'Что-то пошло не так при обращении к Claude. Подробности в логе.';
}
