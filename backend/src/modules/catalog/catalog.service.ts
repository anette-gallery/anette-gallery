import { Injectable } from '@nestjs/common';
import { OneCService } from '../../integrations/onec.service';
import { TildaService } from '../../integrations/tilda.service';
import {
  SyncCatalogBatchDto,
  SyncCatalogItemDto,
} from './dto/sync-catalog.dto';

@Injectable()
export class CatalogService {
  constructor(
    private readonly oneCService: OneCService,
    private readonly tildaService: TildaService,
  ) {}

  private buildOverrideMeta(payload: SyncCatalogItemDto) {
    const manualOverrideFields = payload.manualOverrideFields ?? [];
    const preserveTildaOverrides = payload.preserveTildaOverrides ?? true;
    const sourceUpdatedAt = payload.sourceUpdatedAt ?? null;
    const tildaUpdatedAt = payload.tildaUpdatedAt ?? null;
    const missingInOneC = payload.missingInOneC ?? false;

    return {
      manualOverrideFields,
      preserveTildaOverrides,
      hasManualOverrides: manualOverrideFields.length > 0,
      missingInOneC,
      visibilityAction: missingInOneC ? 'hide-in-tilda' : 'keep-visible',
      sourceUpdatedAt,
      tildaUpdatedAt,
      synchronizationMode: 'last-write-wins',
      priorityRule:
        'Последнее изменение между 1С и Tilda должно иметь приоритет, если доступны корректные timestamps',
    };
  }

  syncItem(payload: SyncCatalogItemDto) {
    const overrideMeta = this.buildOverrideMeta(payload);
    const normalized = this.oneCService.normalizeCatalogItem(payload);
    const synced = this.tildaService.upsertProduct(payload);

    return {
      status: 'stub',
      source: '1c',
      target: 'tilda',
      action: 'sync-item',
      overrideMeta,
      normalized,
      synced,
    };
  }

  syncBatch(payload: SyncCatalogBatchDto) {
    const overrideSummary = payload.items.map((item) => ({
      sku: item.sku,
      ...this.buildOverrideMeta(item),
    }));
    const normalized = this.oneCService.normalizeCatalogBatch(payload.items);
    const synced = this.tildaService.upsertProductsBatch(payload.items);

    return {
      status: 'stub',
      source: '1c',
      target: 'tilda',
      action: 'sync-batch',
      itemsCount: payload.items.length,
      overrideSummary,
      normalized,
      synced,
    };
  }
}
