import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runProof() {
  console.log('--- Setting up data ---');
  await prisma.assignment.deleteMany({});
  await prisma.registration.deleteMany({});
  await prisma.shift.deleteMany({});
  await prisma.role.deleteMany({});
  await prisma.opportunity.deleteMany({});
  await prisma.event.deleteMany({});
  await prisma.volunteer.deleteMany({});
  await prisma.program.deleteMany({});
  await prisma.organization.deleteMany({});

  // Create an org and a program
  const org = await prisma.organization.create({
    data: { name: 'Test Org', slug: 'test-org' },
  });
  const program = await prisma.program.create({
    data: { organizationId: org.id, name: 'Test Program' },
  });

  // Create two volunteers
  const vol1 = await prisma.volunteer.create({
    data: { email: 'v1@test.com', passwordHash: 'hash', fullName: 'V1', orgId: org.id },
  });
  const vol2 = await prisma.volunteer.create({
    data: { email: 'v2@test.com', passwordHash: 'hash', fullName: 'V2', orgId: org.id },
  });

  // Create an event, opportunity, role
  const event = await prisma.event.create({
    data: { programId: program.id, name: 'Ev', startsAt: new Date(), endsAt: new Date(Date.now() + 86400000), createdByVolunteerId: vol1.id },
  });
  const opp = await prisma.opportunity.create({
    data: { eventId: event.id, name: 'Opp' },
  });
  const role = await prisma.role.create({
    data: { opportunityId: opp.id, name: 'Role' },
  });

  // 1. Shift capacity test (capacityMax = 1)
  console.log('\n--- Test 1: Simultaneous Registration (Capacity 1) ---');
  const shift1 = await prisma.shift.create({
    data: {
      roleId: role.id,
      capacityMin: 1,
      capacityMax: 1,
      startsAt: new Date('2026-08-01T10:00:00Z'),
      endsAt: new Date('2026-08-01T12:00:00Z'),
      status: 'PUBLISHED',
    },
  });

  // We need to simulate the service layer which does the transaction and FOR UPDATE
  // We'll write the logic inline here to prove it works with FOR UPDATE
  async function registerWithLock(volunteerId: string) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          // Lock shift
          const shifts = await tx.$queryRaw<any[]>`
            SELECT capacity_max, status FROM "shift" WHERE id = ${shift1.id} FOR UPDATE
          `;
          if (!shifts.length) throw new Error('Not found');
          const shiftData = shifts[0];

          const activeCount = await tx.registration.count({
            where: { shiftId: shift1.id, status: { notIn: ['CANCELLED'] } },
          });

          // Simulate some latency inside the transaction to encourage race conditions
          await delay(100);

          const isFull = activeCount >= shiftData.capacity_max;
          const status = isFull ? 'WAITLISTED' : 'REGISTERED';
          
          const reg = await tx.registration.create({
            data: { volunteerId, shiftId: shift1.id, status },
          });
          
          if (status === 'REGISTERED') {
            await tx.assignment.create({
              data: {
                registrationId: reg.id, shiftId: shift1.id, volunteerId,
                startsAt: shift1.startsAt, endsAt: shift1.endsAt, status: 'ASSIGNED',
              },
            });
          }
          return { volunteerId, status };
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (err: any) {
      return { volunteerId, error: err.message };
    }
  }

  // Fire simultaneously
  const results = await Promise.all([
    registerWithLock(vol1.id),
    registerWithLock(vol2.id),
  ]);
  
  console.log('Results of simultaneous registration:', results);


  // 2. Overlap Constraint Test
  console.log('\n--- Test 2: Overlapping Assignments Constraint ---');
  await prisma.assignment.deleteMany({});
  await prisma.registration.deleteMany({});
  // Shift 2 overlaps with Shift 1 for vol1 (who got REGISTERED we assume, or we just force create assignments)
  
  // Cleanup vol1 assignments so we can test cleanly
  await prisma.assignment.deleteMany({ where: { volunteerId: vol1.id } });
  
  const shift2 = await prisma.shift.create({
    data: {
      roleId: role.id,
      capacityMin: 1,
      capacityMax: 10,
      startsAt: new Date('2026-08-01T11:00:00Z'), // Overlaps with 10:00 - 12:00
      endsAt: new Date('2026-08-01T13:00:00Z'),
      status: 'PUBLISHED',
    },
  });

  const regBase = await prisma.registration.create({
    data: { volunteerId: vol1.id, shiftId: shift1.id, status: 'REGISTERED' },
  });

  console.log('Creating first assignment (10:00 - 12:00)...');
  await prisma.assignment.create({
    data: {
      registrationId: regBase.id, shiftId: shift1.id, volunteerId: vol1.id,
      startsAt: shift1.startsAt, endsAt: shift1.endsAt, status: 'ASSIGNED',
    },
  });
  console.log('First assignment created successfully.');

  const regOverlap = await prisma.registration.create({
    data: { volunteerId: vol1.id, shiftId: shift2.id, status: 'REGISTERED' },
  });

  console.log('Attempting to create overlapping assignment (11:00 - 13:00)...');
  try {
    await prisma.assignment.create({
      data: {
        registrationId: regOverlap.id, shiftId: shift2.id, volunteerId: vol1.id,
        startsAt: shift2.startsAt, endsAt: shift2.endsAt, status: 'ASSIGNED',
      },
    });
    console.log('FAIL: Overlapping assignment created successfully (constraint failed).');
  } catch (err: any) {
    console.log('SUCCESS: Overlapping assignment rejected by DB.');
    console.log('Error output:', err.message);
  }

  // Cleanup
  await prisma.assignment.deleteMany({});
  await prisma.registration.deleteMany({});
  await prisma.shift.deleteMany({});
  await prisma.role.deleteMany({});
  await prisma.opportunity.deleteMany({});
  await prisma.event.deleteMany({});
  await prisma.volunteer.deleteMany({});
  await prisma.program.deleteMany({});
  await prisma.organization.deleteMany({});
}

runProof()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
