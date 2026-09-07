import { NextRequest, NextResponse } from 'next/server';

import type { BrandApplyApiResponse } from '@/types/api';

import { getAppConfig, hasRealValue } from '@/server/config';
import {
  applyBrandsToCatalog,
  buildFullCsvDownload,
} from '@/server/services/brand-apply';
import {
  parseBrandApplyMode,
  parseBrandApplySourceFromBody,
  assertApiSecret,
} from '@/server/validation';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    assertApiSecret(req);
    const config = getAppConfig();
    const mode = parseBrandApplyMode(req);
    const source = await parseBrandApplySourceFromBody(req);

    const catalogRows = Array.isArray(source?.catalog)
      ? source.catalog.map((c) => ({
          sku: c.sku,
          name: c.name,
          brand: c.brand,
          existingCategoryIds: c.existingCategoryIds ?? [],
          brandCategoryId: c.brandCategoryId ?? undefined,
          displayName: c.displayName,
        }))
      : [];

    const result = await applyBrandsToCatalog(catalogRows, {
      mode,
      source: source?.brands ?? null,
    });

    if (mode === 'csv-download') {
      const csv = buildFullCsvDownload(result);
      const filename = `tilda-brand-patch-${new Date().toISOString().slice(0, 10)}.csv`;
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type':
            'text/csv; charset=utf-8; header=present;',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'X-Status': result.status,
          'X-Total-Items': String(result.totalItems),
          'X-Matched-Brand': String(result.matchedWithBrand),
          'X-Unknown-Brand': String(result.unknownBrand),
        },
      });
    }

    return NextResponse.json({
      status: result.status,
      mode: result.mode,
      target: 'tilda' as const,
      action: 'apply-brands',
      summary: {
        totalItems: result.totalItems,
        matchedWithBrand: result.matchedWithBrand,
        unknownBrand: result.unknownBrand,
        brandAlreadySetAsSpec: result.brandAlreadySetAsSpec,
        categoryAlreadyAssigned: result.categoryAlreadyAssigned,
        needsImportCsv: result.needsImportCsv,
        brandDistribution: result.brandDistribution,
      },
      config: {
        integrationsMode: config.integrations.mode,
        tildaConfigured:
          hasRealValue(config.integrations.tilda.baseUrl) &&
          hasRealValue(config.integrations.tilda.apiKey),
        brandSpecId: config.integrations.tilda.brandSpecId,
      },
      csvPreviewRows: result.csvPreview?.split('\n').slice(0, 6) ?? null,
      rowsSummary: result.rows.slice(0, 20).map((r) => ({
        sku: r.sku,
        name: r.name,
        brandDetected: r.brandDetected,
        categoryUid: r.categoryUid,
        needsUpdate: r.needsUpdate,
      })),
      nextStep: result.needsImportCsv
        ? [
            '1. Вызовите этот же endpoint с mode=csv-download, скачайте CSV-файл.',
            '2. Tilda → Каталог → ⚙️ Настройки каталога → Синхронизации → Импорт товаров из CSV.',
            '3. Выберите файл → опция «Обновлять существующие товары по SKU» = ВКЛ.',
            '4. Опция «Разделы: добавлять к существующим (не удалять ручные)» = ВКЛ.',
            '5. Запустить импорт. Товары получат системное поле «Brand» + раздел Бренды/<Бренд> (append-only).',
          ]
        : [
            'Обновление не требуется: у всех товаров бренд уже проставлен или товаров для обработки нет.',
          ],
    } satisfies BrandApplyApiResponse);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'unknown brand-apply error';
    return NextResponse.json({
      status: 'error',
      mode: 'error' as const,
      target: 'tilda' as const,
      action: 'apply-brands',
      error: message,
    } satisfies BrandApplyApiResponse, { status: 400 });
  }
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('mode') ?? 'apply-brands-help';
  const mode = (raw === 'csv-download' || raw === 'dry-run' || raw === 'preview'
    ? raw
    : 'apply-brands-help') as BrandApplyApiResponse['mode'];
  return NextResponse.json({
    status: 'ok',
    mode,
    target: 'tilda' as const,
    action: 'apply-brands-help',
    usage: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-secret': '=== INTEGRATIONS_API_SECRET ===',
      },
      query: {
        mode: ['preview (default)', 'csv-download', 'dry-run'],
      },
      bodyExample: {
        catalog: [
          {
            sku: 'ART-001',
            name: 'Ваза Baccarat Rouge',
            brand: 'Baccarat',
            existingCategoryIds: ['100', '200'],
          },
        ],
        brands: {
          mode: 'payload',
          payload: [{ sku: 'ART-001', brand: 'Baccarat' }],
        },
      },
    },
  } satisfies BrandApplyApiResponse);
}
