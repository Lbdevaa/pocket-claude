// Отправка ответа в Telegram.
//
// Две вещи, которые Telegram не прощает и приходится делать руками:
//   1. Сообщение длиннее 4096 символов не отправляется вовсе — режем сами.
//   2. Разметка, которую Telegram не смог разобрать, роняет всю отправку —
//      повторяем тот же кусок без разметки.

import { GrammyError } from 'grammy';

import { config } from './config.js';

const TELEGRAM_LIMIT = 4096;

// Режем с запасом: при разрыве блока кода дописываем ограждения,
// и кусок не должен из-за этого перевалить за лимит.
const CHUNK = 4000;

// Не отрезать половину слова, если чуть выше есть нормальная граница.
// Ниже этой доли куска ищем следующий по грубости разделитель.
const MIN_FILL = 0.5;

/**
 * Разбить текст на куски, влезающие в лимит Telegram.
 * Приоритет границ: пустая строка → перевод строки → пробел → жёсткий обрыв.
 */
export function splitMessage(text, limit = CHUNK) {
  const chunks = [];
  let rest = text.trim();

  while (rest.length > limit) {
    const cut = findCut(rest, limit);
    chunks.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }

  if (rest) chunks.push(rest);
  return balanceFences(chunks);
}

function findCut(text, limit) {
  const floor = limit * MIN_FILL;

  for (const separator of ['\n\n', '\n', ' ']) {
    const at = text.lastIndexOf(separator, limit);
    if (at > floor) return at + separator.length;
  }
  return limit;
}

/**
 * Блок кода, разорванный пополам, ломает разметку в обеих половинах.
 * Закрываем ограждение в конце куска и открываем заново в начале следующего.
 */
function balanceFences(chunks) {
  const balanced = [];
  let carry = null;

  for (const chunk of chunks) {
    const piece = carry ? `${carry}\n${chunk}` : chunk;
    const fences = piece.match(/^ {0,3}```.*$/gm) ?? [];

    if (fences.length % 2 === 1) {
      // Последнее ограждение осталось открытым — запоминаем его вместе
      // с языком, чтобы продолжение подсветилось так же.
      carry = fences.at(-1).trim();
      balanced.push(`${piece}\n\`\`\``);
    } else {
      carry = null;
      balanced.push(piece);
    }
  }

  return balanced;
}

/** Отправить текст в чат, разбив на части и пережив кривую разметку. */
export async function sendLong(ctx, text) {
  for (const chunk of splitMessage(text)) {
    await sendChunk(ctx, chunk);
  }
}

async function sendChunk(ctx, chunk) {
  if (!config.parseMode) {
    await ctx.reply(chunk);
    return;
  }

  try {
    await ctx.reply(chunk, { parse_mode: config.parseMode });
  } catch (error) {
    if (!isMarkupError(error)) throw error;

    // Claude пишет полноценный Markdown, а Telegram понимает лишь его огрызок.
    // Текст важнее оформления: отправляем как есть.
    console.warn(`Разметку Telegram не принял, отправляю без неё: ${error.description}`);
    await ctx.reply(chunk);
  }
}

function isMarkupError(error) {
  return (
    error instanceof GrammyError &&
    error.error_code === 400 &&
    /parse entities|entity|end of the entity/i.test(error.description)
  );
}
