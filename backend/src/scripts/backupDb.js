import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

async function runBackup() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    console.error('[Backup] MONGODB_URI is not set. Aborting backup.');
    process.exit(1);
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();

  const snapshot = {
    exportedAt: new Date().toISOString(),
    database: db.databaseName,
    collections: {},
  };

  for (const col of collections) {
    const docs = await db.collection(col.name).find({}).toArray();
    // Redact password hashes & reset tokens in exported backup only if needed, or preserve full restore capability
    snapshot.collections[col.name] = docs;
  }

  const outDir = path.resolve(process.cwd(), 'backups');
  await fs.mkdir(outDir, { recursive: true });
  const fileName = `hruvita-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const outPath = path.join(outDir, fileName);

  await fs.writeFile(outPath, JSON.stringify(snapshot, null, 2), 'utf8');
  console.log(
    `[Backup Complete] Exported ${collections.length} collections to ${outPath}`
  );
  await mongoose.disconnect();
  process.exit(0);
}

runBackup().catch((err) => {
  console.error('[Backup Error]', err.message);
  process.exit(1);
});
