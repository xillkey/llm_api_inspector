import { DatabaseSync } from 'node:sqlite';

try {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
  db.prepare('INSERT INTO test (value) VALUES (?)').run('ok');
  const row = db.prepare('SELECT value FROM test WHERE id = 1').get();
  db.close();
  console.log('node:sqlite OK:', row?.value);
  process.exit(0);
} catch (err) {
  console.error('node:sqlite FAILED:', err);
  process.exit(1);
}
