import 'dotenv/config';
import { initDatabase, listProducts, listCategories, listUsers } from '../store/repository.js';

async function run() {
  const status = await initDatabase();
  const [categories, products, users] = await Promise.all([
    listCategories(),
    listProducts({ includeInactive: true }),
    listUsers(),
  ]);
  console.log(
    `[Seed Complete] Mode=${status.mode} | Categories=${categories.length} | Products=${products.length} | Users=${users.length}`
  );
  process.exit(0);
}

run();
