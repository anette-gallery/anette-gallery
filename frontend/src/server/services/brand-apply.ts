import type { BrandMapSource } from '@/types/api';
import {
  BRAND_CATEGORY_MAP,
  ALL_BRAND_CATEGORY_IDS,
  resolveBrandCategoryId,
} from '@/server/brand-map';

interface TildaCatalogRow {
  id?: string;
  sku: string;
  name: string;
  brand?: string;
  brandCategoryId?: string;
  existingCategoryIds: string[];
  displayName?: string;
}

export interface BrandApplyResult {
  status: 'ok' | 'partial' | 'error';
  mode: 'preview' | 'csv-download' | 'dry-run';
  totalItems: number;
  matchedWithBrand: number;
  unknownBrand: number;
  brandAlreadySetAsSpec: number;
  categoryAlreadyAssigned: number;
  needsImportCsv: boolean;
  brandDistribution: Array<{ brand: string; count: number; storepartuid: string }>;
  csvPreview?: string;
  rows: Array<{
    sku: string;
    name: string;
    brandDetected: string | null;
    categoryUid: string | null;
    existingCategoryIds: string[];
    mergedCategoryIds: string[];
    specBrandSet: boolean;
    needsUpdate: boolean;
  }>;
}

function fetchBrandFromSource(_sku: string, source: BrandMapSource | null | undefined) {
  if (!source) {
    return {
      source: 'stub' as const,
      brand: null,
    };
  }

  if (source.mode === 'payload') {
    const match = source.payload.find(
      (r) => String(r.sku).trim() === String(_sku).trim(),
    );
    return {
      source: 'payload' as const,
      brand: match?.brand ?? null,
    };
  }

  return {
    source: 'stub' as const,
    brand: null,
  };
}

function toCsvCell(value: string | number | null | undefined): string {
  const v = value === null || value === undefined ? '' : String(value);
  if (/[",;\n]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

export function buildCsvPatch(rows: BrandApplyResult['rows']): string {
  const headers = [
    'SKU',
    'Title',
    'Brand',
    'Разделы (storepartuid через запятую, режим APPEND)',
    'Обновление требуется',
  ];
  const lines = [headers.join(';')];

  rows.forEach((r) => {
    lines.push(
      [
        r.sku,
        r.name,
        r.brandDetected ?? '',
        r.mergedCategoryIds.join(','),
        r.needsUpdate ? 'Да' : 'Нет',
      ]
        .map(toCsvCell)
        .join(';'),
    );
  });

  return lines.join('\n');
}

export async function applyBrandsToCatalog(
  catalogRows: TildaCatalogRow[],
  options: {
    mode: 'preview' | 'csv-download' | 'dry-run';
    source?: BrandMapSource | null;
  },
) {
  const rowsProcessed: BrandApplyResult['rows'] = [];
  const brandCounters = new Map<string, number>();
  let matchedWithBrand = 0;
  let unknownBrand = 0;
  let brandAlreadySetAsSpec = 0;
  let categoryAlreadyAssigned = 0;
  let needsImportCsv = false;

  for (const row of catalogRows) {
    const brand =
      row.brand ??
      fetchBrandFromSource(row.sku, options.source ?? null).brand;

    if (!brand) {
      unknownBrand += 1;
      rowsProcessed.push({
        sku: row.sku,
        name: row.name,
        brandDetected: null,
        categoryUid: null,
        existingCategoryIds: row.existingCategoryIds,
        mergedCategoryIds: row.existingCategoryIds,
        specBrandSet: false,
        needsUpdate: false,
      });
      continue;
    }

    matchedWithBrand += 1;
    brandAlreadySetAsSpec += 1;
    const counter = brandCounters.get(brand) ?? 0;
    brandCounters.set(brand, counter + 1);

    const categoryId = resolveBrandCategoryId(brand);

    let merged = [...row.existingCategoryIds];
    if (categoryId && !row.existingCategoryIds.includes(categoryId)) {
      merged = Array.from(new Set([...merged, categoryId]));
    } else if (categoryId) {
      categoryAlreadyAssigned += 1;
    }

    const needsUpdate =
      true ||
      (Boolean(categoryId) && merged.length !== row.existingCategoryIds.length);

    if (needsUpdate) {
      needsImportCsv = true;
    }

    rowsProcessed.push({
      sku: row.sku,
      name: row.name,
      brandDetected: brand,
      categoryUid: categoryId ?? null,
      existingCategoryIds: row.existingCategoryIds,
      mergedCategoryIds: merged,
      specBrandSet: true,
      needsUpdate,
    });
  }

  const brandDistribution = Object.entries(BRAND_CATEGORY_MAP)
    .map(([brand, storepartuid]) => ({
      brand,
      storepartuid,
      count: brandCounters.get(brand) ?? 0,
    }))
    .sort((a, b) => b.count - a.count);

  const csvPreview =
    options.mode === 'csv-download' || options.mode === 'preview'
      ? buildCsvPatch(rowsProcessed.slice(0, 10))
      : undefined;

  const status: BrandApplyResult['status'] =
    unknownBrand === catalogRows.length
      ? 'error'
      : unknownBrand > 0
        ? 'partial'
        : 'ok';

  return {
    status,
    mode: options.mode,
    totalItems: catalogRows.length,
    matchedWithBrand,
    unknownBrand,
    brandAlreadySetAsSpec,
    categoryAlreadyAssigned,
    needsImportCsv,
    brandDistribution,
    csvPreview,
    rows: rowsProcessed,
  };
}

export function buildFullCsvDownload(result: BrandApplyResult) {
  return buildCsvPatch(result.rows);
}

export { ALL_BRAND_CATEGORY_IDS };
