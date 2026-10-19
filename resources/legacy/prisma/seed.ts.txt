import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.userAccount.upsert({
    where: { principal: 'admin@example.com' },
    update: {},
    create: {
      principal: 'admin@example.com',
      passwordHash: 'seed-managed-outside-runtime',
      role: 'admin',
      displayName: 'admin',
      status: 'active',
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

