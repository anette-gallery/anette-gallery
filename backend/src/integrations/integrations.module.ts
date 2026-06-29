import { Module } from '@nestjs/common';
import { MaxmaService } from './maxma.service';
import { OneCService } from './onec.service';
import { TildaService } from './tilda.service';

@Module({
  providers: [MaxmaService, OneCService, TildaService],
  exports: [MaxmaService, OneCService, TildaService],
})
export class IntegrationsModule {}
