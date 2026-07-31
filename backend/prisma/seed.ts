import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 1. Create Default Organization
  const org = await prisma.organization.upsert({
    where: { slug: 'default-org' },
    update: {},
    create: {
      name: 'Default Organization',
      slug: 'default-org',
      timezone: 'UTC',
    },
  });

  // 2. Create Default Program
  const program = await prisma.program.create({
    data: {
      organizationId: org.id,
      name: 'Community Outreach',
      description: 'Default program for all community events.',
    },
  });

  console.log('✅ Seeding complete!');
  console.log('--------------------------------------------------');
  console.log(`USE THIS PROGRAM ID IN THE EVENT BUILDER:`);
  console.log(`=> ${program.id}`);
  console.log('--------------------------------------------------');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
