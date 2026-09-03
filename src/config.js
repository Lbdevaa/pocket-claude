// Чтение и валидация окружения.
//
// Единственное место, где трогается process.env. Смысл в том, чтобы ошибка в .env
// всплывала одним внятным сообщением при старте, а не стектрейсом из недр
// библиотеки на первом же сообщении пользователя.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PARSE_MODES = ['Markdown', 'MarkdownV2', 'HTML', 'none'];

const problems = [];

function required(name, hint) {
  const value = process.env[name]?.trim();
  if (!value) problems.push(`${name} не задан — ${hint}`);
  return value ?? '';
}

function positiveInt(name, fallback, { min = 1 } = {}) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    problems.push(`${name}="${raw}" — ожидалось целое число не меньше ${min}`);
    return fallback;
  }
  return value;
}

// Список Telegram user id через запятую. Разбирается один раз при старте,
// дальше whitelist — это проверка вхождения в Set.
function userIds() {
  const raw = required('ALLOWED_USER_IDS', 'узнай свой Telegram user id у @userinfobot');
  const ids = new Set();

  for (const part of raw.split(',')) {
    const piece = part.trim();
    if (!piece) continue;

    const id = Number(piece);
    if (!Number.isInteger(id) || id <= 0) {
      problems.push(`ALLOWED_USER_IDS: "${piece}" не похоже на Telegram user id (ожидалось положительное целое)`);
      continue;
    }
    ids.add(id);
  }

  if (raw && ids.size === 0) {
    problems.push('ALLOWED_USER_IDS не содержит ни одного корректного id — боту будет некому отвечать');
  }
  return ids;
}

function parseMode() {
  const raw = process.env.PARSE_MODE?.trim() || 'Markdown';
  if (!PARSE_MODES.includes(raw)) {
    problems.push(`PARSE_MODE="${raw}" — допустимы: ${PARSE_MODES.join(', ')}`);
    return 'Markdown';
  }
  // 'none' наружу отдаём как null: именно это Telegram понимает как «без разметки».
  return raw === 'none' ? null : raw;
}

export const config = {
  tgToken: required('TG_TOKEN', 'получи токен у @BotFather командой /newbot'),
  apiKey: required('ANTHROPIC_API_KEY', 'ключ берётся на console.anthropic.com -> API Keys'),
  allowedUserIds: userIds(),

  model: process.env.MODEL?.trim() || 'claude-opus-5',
  maxTokens: positiveInt('MAX_TOKENS', 16000, { min: 256 }),
  systemPrompt: process.env.SYSTEM_PROMPT?.trim() || undefined,

  historyLimit: positiveInt('HISTORY_LIMIT', 30, { min: 2 }),
  dbPath: path.join(ROOT, 'data', 'history.db'),

  parseMode: parseMode(),
  root: ROOT,
};

if (problems.length > 0) {
  console.error('Не удалось прочитать настройки из .env:\n');
  for (const problem of problems) console.error(`  • ${problem}`);
  console.error('\nЗа образец возьми .env.example — там расписано, что где брать.');
  process.exit(1);
}
