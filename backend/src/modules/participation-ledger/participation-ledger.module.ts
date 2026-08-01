import { Module } from '@nestjs/common';
import { ParticipationLedgerController } from './participation-ledger.controller';
import { ParticipationLedgerService } from './participation-ledger.service';

@Module({
  controllers: [ParticipationLedgerController],
  providers: [ParticipationLedgerService],
  exports: [ParticipationLedgerService],
})
export class ParticipationLedgerModule {}
