import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- pg_indexes ---');
  const indexes = await prisma.$queryRaw`
    SELECT indexname, indexdef 
    FROM pg_indexes 
    WHERE tablename IN ('registration', 'volunteer', 'shift', 'assignment') 
    AND indexname LIKE 'ux_%';
  `;
  console.log(indexes);

  console.log('--- pg_constraint ---');
  const constraints = await prisma.$queryRaw`
    SELECT conname, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'assignment' AND conname = 'no_overlapping_assignments';
  `;
  console.log(constraints);
}

main().then(() => prisma.$disconnect());
