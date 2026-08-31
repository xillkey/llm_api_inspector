import { safeStorage } from 'electron';

export function encryptApiKey(plainText) {
  if (!plainText) return null;
  if (!safeStorage.isEncryptionAvailable()) {
    return Buffer.from(plainText, 'utf8');
  }
  return safeStorage.encryptString(plainText);
}

export function decryptApiKey(encrypted) {
  if (!encrypted) return '';
  if (!safeStorage.isEncryptionAvailable()) {
    return Buffer.from(encrypted).toString('utf8');
  }
  return safeStorage.decryptString(encrypted);
}

export function maskApiKey(key) {
  if (!key) return '';
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}
