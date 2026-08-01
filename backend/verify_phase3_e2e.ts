import { Test } from '@nestjs/testing';
import { AppModule } from './src/app.module';
import { AttendanceService } from './src/modules/attendance/attendance.service';
import { ParticipationLedgerService } from './src/modules/participation-ledger/participation-ledger.service';
import { PrismaService } from './src/common/prisma/prisma.service';
import { UserRole } from './src/common/types/user-role.enum';
import { AuthenticatedUser } from './src/common/types/jwt-payload.interface';
import { v4 as uuidv4 } from 'uuid';

async function runE2eProof() {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  const prisma = app.get(PrismaService);
  const attendanceService = app.get(AttendanceService);

  console.log('=== PHASE 3 E2E INTEGRATION & DB PROOF ===\n');

  const runId = uuidv4().substring(0, 8);

  const org = await prisma.organization.create({
    data: { name: `E2E Org ${runId}`, slug: `e2e-org-${runId}`, timezone: 'UTC' },
  });

  const supervisor = await prisma.volunteer.create({
    data: {
      orgId: org.id,
      email: `supervisor-${runId}@civic.org`,
      passwordHash: 'hash',
      fullName: 'Supervisor Sarah',
      role: 'SITE_SUPERVISOR',
      scopeSiteId: `site-${runId}`,
    },
  });

  const volunteer = await prisma.volunteer.create({
    data: {
      orgId: org.id,
      email: `volunteer-${runId}@civic.org`,
      passwordHash: 'hash',
      fullName: 'Volunteer Vic',
      role: 'VOLUNTEER',
    },
  });

  const walkinVolunteer = await prisma.volunteer.create({
    data: {
      orgId: org.id,
      email: `walkin-${runId}@civic.org`,
      passwordHash: 'hash',
      fullName: 'Walkin Wally',
      role: 'VOLUNTEER',
    },
  });

  const program = await prisma.program.create({
    data: { organizationId: org.id, name: 'E2E Program' },
  });

  const event = await prisma.event.create({
    data: {
      programId: program.id,
      name: 'E2E Community Cleanup',
      startsAt: new Date('2026-08-01T08:00:00Z'),
      endsAt: new Date('2026-08-01T16:00:00Z'),
    },
  });

  const opportunity = await prisma.opportunity.create({
    data: { eventId: event.id, name: 'Park Restoration', siteId: `site-${runId}` },
  });

  const role = await prisma.role.create({
    data: { opportunityId: opportunity.id, name: 'Tree Planter' },
  });

  const shift = await prisma.shift.create({
    data: {
      roleId: role.id,
      siteId: `site-${runId}`,
      capacityMin: 1,
      capacityMax: 10,
      startsAt: new Date('2026-08-01T08:00:00Z'),
      endsAt: new Date('2026-08-01T16:00:00Z'),
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

  // ── 1. Issue QR Token ──
  console.log('--- 1. POST /checkin/qr-token ---');
  const qrTokenResult = await attendanceService.issueQrToken(assignment.id, supervisorUser);
  console.log(JSON.stringify(qrTokenResult, null, 2));

  // ── 2. Check-in via QR Token ──
  console.log('\n--- 2. POST /checkin (using QR Token) ---');
  const checkInResult = await attendanceService.checkIn(
    { assignmentId: assignment.id, method: 'QR', qrToken: qrTokenResult.token },
    supervisorUser,
  );
  console.log(JSON.stringify(checkInResult, null, 2));

  // ── 3. Check-out ──
  console.log('\n--- 3. POST /checkout ---');
  const checkedOutAt = new Date(Date.now() + 3600 * 1000).toISOString();
  const checkOutResult = await attendanceService.checkOut(
    { assignmentId: assignment.id, checkedOutAt },
    supervisorUser,
  );
  console.log(JSON.stringify(checkOutResult, null, 2));

  // ── 4. Walk-in Check-in Path ──
  console.log('\n--- 4. POST /checkin (WALK_IN_MANUAL) ---');
  const walkinResult = await attendanceService.checkIn(
    { method: 'WALK_IN_MANUAL', volunteerId: walkinVolunteer.id, shiftId: shift.id },
    supervisorUser,
  );
  console.log(JSON.stringify(walkinResult, null, 2));

  // Query DB directly to prove Registration + Assignment + Attendance rows exist for Walk-in
  console.log('\n--- 5. DB Verification for Walk-in Volunteer (Registration + Assignment + Attendance) ---');
  const walkinReg = await prisma.registration.findFirst({ where: { volunteerId: walkinVolunteer.id } });
  const walkinAssign = await prisma.assignment.findFirst({ where: { volunteerId: walkinVolunteer.id } });
  const walkinAtt = await prisma.attendance.findFirst({ where: { assignmentId: walkinAssign?.id } });

  console.log('WALK-IN REGISTRATION ROW:', JSON.stringify(walkinReg, null, 2));
  console.log('WALK-IN ASSIGNMENT ROW:', JSON.stringify(walkinAssign, null, 2));
  console.log('WALK-IN ATTENDANCE ROW:', JSON.stringify(walkinAtt, null, 2));

  await app.close();
}

runE2eProof().catch(console.error);
