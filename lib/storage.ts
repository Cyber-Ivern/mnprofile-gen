import fs from 'fs-extra';
import path from 'path';

const STORAGE_DIR = path.join(process.cwd(), 'data');
const TOKENS_FILE = path.join(STORAGE_DIR, 'tokens.json');

// Ensure storage directory exists
fs.ensureDirSync(STORAGE_DIR);

// Initialize tokens file if it doesn't exist
if (!fs.existsSync(TOKENS_FILE)) {
  fs.writeJsonSync(TOKENS_FILE, {});
}

export function saveUserToken(userId: string, accessToken: string): void {
  const tokens = fs.readJsonSync(TOKENS_FILE);
  tokens[userId] = {
    accessToken,
    createdAt: new Date().toISOString()
  };
  fs.writeJsonSync(TOKENS_FILE, tokens, { spaces: 2 });
}

export function getUserToken(userId: string): string | null {
  const tokens = fs.readJsonSync(TOKENS_FILE);
  return tokens[userId]?.accessToken || null;
}

export function deleteUserToken(userId: string): void {
  const tokens = fs.readJsonSync(TOKENS_FILE);
  delete tokens[userId];
  fs.writeJsonSync(TOKENS_FILE, tokens, { spaces: 2 });
}

export default {
  saveUserToken,
  getUserToken,
  deleteUserToken
}; 