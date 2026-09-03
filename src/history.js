// История диалогов в SQLite через встроенный node:sqlite.
//
// Одна таблица на все чаты, разделение по chat_id. Держим последние
// config.historyLimit сообщений на чат — и в выдаче, и физически: старое
// удаляется при записи, чтобы файл не рос бесконечно.

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { config } from './config.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

const db = new DatabaseSync(config.dbPath);

// WAL: процесс живёт сутками, а читать базу вьюером хочется не останавливая бота.
db.exec('PRAGMA journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY,
    chat_id    INTEGER NOT NULL,
    role       TEXT    NOT NULL,
    content    TEXT    NOT NULL,
    created_at INTEGER NOT NULL
  )
`);
// Порядок сообщений задаёт id, по нему же идёт выборка последних N — индекс под это.
db.exec('CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages (chat_id, id)');

const statements = {
  insert: db.prepare(
    'INSERT INTO messages (chat_id, role, content, created_at) VALUES (?, ?, ?, ?)',
  ),
  trim: db.prepare(`
    DELETE FROM messages
    WHERE chat_id = ?
      AND id NOT IN (SELECT id FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT ?)
  `),
  recent: db.prepare(
    'SELECT role, content FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT ?',
  ),
  clear: db.prepare('DELETE FROM messages WHERE chat_id = ?'),
  count: db.prepare('SELECT COUNT(*) AS n FROM messages WHERE chat_id = ?'),
};

/** Дописать сообщение в историю чата и обрезать хвост. */
export function append(chatId, role, content) {
  statements.insert.run(chatId, role, content, Date.now());
  statements.trim.run(chatId, chatId, config.historyLimit);
}

/**
 * История чата в том виде, в каком её ждёт Anthropic API:
 * от старых к новым, обязательно начиная с сообщения пользователя.
 */
export function get(chatId) {
  const messages = statements.recent.all(chatId, config.historyLimit).reverse();

  // Обрезка хвоста может оставить первым ответ ассистента — API такое не примет.
  // Отбрасываем начало до первого сообщения пользователя.
  const start = messages.findIndex((message) => message.role === 'user');
  return start === -1 ? [] : messages.slice(start);
}

/** Забыть всё, что было в этом чате. Остальные чаты не трогаем. */
export function clear(chatId) {
  return statements.clear.run(chatId).changes;
}

/** Сколько сообщений реально лежит в базе по этому чату. Для проверок и отладки. */
export function count(chatId) {
  return statements.count.get(chatId).n;
}

export function close() {
  db.close();
}
