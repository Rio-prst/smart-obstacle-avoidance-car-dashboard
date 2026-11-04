import { PrismaClient } from '@prisma/client';
import { hash } from 'argon2';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const username = process.env.ADMIN_USERNAME ?? 'admin';
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    throw new Error('ADMIN_PASSWORD is required in environment before running seed');
  }

  const passwordHash = await hash(password);

  await prisma.user.upsert({
    where: { username },
    update: { passwordHash },
    create: { username, passwordHash },
  });

  await prisma.device.upsert({
    where: { id: 'car01' },
    update: {},
    create: {
      id: 'car01',
      name: 'Mobil 1',
    },
  });

  await prisma.deviceConfig.upsert({
    where: { deviceId: 'car01' },
    update: {},
    create: { deviceId: 'car01' },
  });

  console.log(`Seed completed: user "${username}" and device "car01"`);
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
