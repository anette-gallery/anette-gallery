import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../../integrations/integrations.module';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  imports: [IntegrationsModule],
  controllers: [CatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}
