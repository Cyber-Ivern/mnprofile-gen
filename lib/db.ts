import Database from 'better-sqlite3';
import { join } from 'path';

// Initialize database
const db = new Database(join(process.cwd(), 'spotify_tokens.db'));

// Create tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS user_tokens (
    user_id TEXT PRIMARY KEY,
    access_token TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

export function saveUserToken(userId: string, accessToken: string): void {
  const stmt = db.prepare('INSERT OR REPLACE INTO user_tokens (user_id, access_token) VALUES (?, ?)');
  stmt.run(userId, accessToken);
}

export function getUserToken(userId: string): string | null {
  const stmt = db.prepare('SELECT access_token FROM user_tokens WHERE user_id = ?');
  const result = stmt.get(userId);
  return result ? result.access_token : null;
}

export function deleteUserToken(userId: string): void {
  const stmt = db.prepare('DELETE FROM user_tokens WHERE user_id = ?');
  stmt.run(userId);
}

export default db; 