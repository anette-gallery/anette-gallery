import { Body, Controller, Post } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import {
  SyncCatalogBatchDto,
  SyncCatalogItemDto,
} from './dto/sync-catalog.dto';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Post('sync')
  syncItem(@Body() payload: SyncCatalogItemDto) {
    return this.catalogService.syncItem(payload);
  }

  @Post('sync/batch')
  syncBatch(@Body() payload: SyncCatalogBatchDto) {
    return this.catalogService.syncBatch(payload);
  }
}
