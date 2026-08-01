import { Test } from '@nestjs/testing';
import { AppModule } from './src/app.module';
import { AttendanceService } from './src/modules/attendance/attendance.service';
import { PrismaService } from './src/common/prisma/prisma.service';
import { UserRole } from './src/common/types/user-role.enum';
import { AuthenticatedUser } from './src/common/types/jwt-payload.interface';
import { v4 as uuidv4 } from 'uuid';

async function proveConcurrency() {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  const prisma = app.get(PrismaService);
  const attendanceService = app.get(AttendanceService);

  console.log('=== ATOMIC CONCURRENCY & DB CONSTRAINT PROOF ===\n');

  const runId = uuidv4().substring(0, 8);

  const org = await prisma.organization.create({
    data: { name: `Conc Org ${runId}`, slug: `conc-org-${runId}` },
  });

  const supervisor = await prisma.volunteer.create({
    data: {
      orgId: org.id,
      email: `conc-sup-${runId}@civic.org`,
      passwordHash: 'hash',
      fullName: 'Supervisor Concurrency',
      role: 'SITE_SUPERVISOR',
      scopeSiteId: `site-${runId}`,
    },
  });

  const volunteer = await prisma.volunteer.create({
    data: {
      orgId: org.id,
      email: `conc-vol-${runId}@civic.org`,
      passwordHash: 'hash',
      fullName: 'Volunteer Concurrency',
      role: 'VOLUNTEER',
    },
  });

  const program = await prisma.program.create({
    data: { organizationId: org.id, name: 'Conc Program' },
  });

  const event = await prisma.event.create({
    data: {
      programId: program.id,
      name: 'Conc Event',
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 3600000),
    },
  });

  const opportunity = await prisma.opportunity.create({
    data: { eventId: event.id, name: 'Conc Opp', siteId: `site-${runId}` },
  });

  const role = await prisma.role.create({
    data: { opportunityId: opportunity.id, name: 'Conc Role' },
  });

  const shift = await prisma.shift.create({
    data: {
      roleId: role.id,
      siteId: `site-${runId}`,
      capacityMin: 1,
      capacityMax: 10,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 3600000),
    },
  });

  const registration = await prisma.registration.create({
    data: { volunteerId: volunteer.id, shiftId: shift.id, status: 'REGISTERED' },
  });

  const assignment = await prisma.assignment.create({
    data: {
      registrationId: registration.id,
      shiftId: shift.id,
      volunteerId: volunteer.id,
      status: 'ASSIGNED',
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
    },
  });

  const supervisorUser: AuthenticatedUser = {
    sub: supervisor.id,
    email: supervisor.email,
    role: UserRole.SITE_SUPERVISOR,
    orgId: org.id,
    scopeSiteId: `site-${runId}`,
    mfaVerified: true,
    mfaEnabled: true,
    type: 'access',
  };

  // Issue single QR token
  const qrTokenResult = await attendanceService.issueQrToken(assignment.id, supervisorUser);
  console.log(`Issued QR Token: ${qrTokenResult.token.substring(0, 16)}...`);

  // Fire 2 SIMULTANEOUS parallel requests to consume the EXACT SAME QR token at the exact same millisecond
  console.log('\nExecuting 2 SIMULTANEOUS parallel checkIn requests via Promise.all...');
  const results = await Promise.allSettled([
    attendanceService.checkIn({ assignmentId: assignment.id, method: 'QR', qrToken: qrTokenResult.token }, supervisorUser),
    attendanceService.checkIn({ assignmentId: assignment.id, method: 'QR', qrToken: qrTokenResult.token }, supervisorUser),
  ]);

  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');

  console.log(`\nFulfilled requests: ${fulfilled.length}`);
  console.log(`Rejected requests:  ${rejected.length}`);

  if (fulfilled.length === 1 && rejected.length === 1) {
    console.log('\nRESULT: EXACTLY 1 request succeeded; EXACTLY 1 request was atomically blocked!');
    console.log('Blocked request exception:', (rejected[0] as PromiseRejectedResult).reason?.message);
  }

  // Verify database qr_token row
  const qrRow = await prisma.qrToken.findUnique({ where: { token: qrTokenResult.token } });
  console.log('\nDB QR Token Row state:', JSON.stringify(qrRow, null, 2));

  // Verify database attendance row count for assignment
  const attendanceCount = await prisma.attendance.count({ where: { assignmentId: assignment.id } });
  console.log(`DB Attendance row count for assignment: ${attendanceCount}`);

  await app.close();
}

proveConcurrency().catch(console.error);
