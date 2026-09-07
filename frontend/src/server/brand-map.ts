export const BRAND_CATEGORY_MAP: Record<string, string> = {
  'Côte Noire': '687267900012',
  Baccarat: '832012411482',
  Ginori: '905060515882',
  Hermes: '374414889522',
  "L'Objet": '732075948042',
  Lalique: '199854413542',
  Assouline: '176924635212',
  'Mariage frres': '534251520172',
  'St. Louis': '186307903922',
  Daum: '674890025632',
  Haviland: '118528228052',
  'Hector Saxe': '225485330522',
  'Ralph Lauren': '571219623412',
  Ercuis: '749037532692',
  Bitossi: '640766342082',
  'Robert Haviland & C. Parlon': '316922189812',
  Lladro: '583348909982',
  Ladenac: '573232153382',
  Raynaud: '944122795602',
  QLOCKTWO: '905701589302',
  'J.L. Coquet': '218283485412',
  Pinetti: '607971813242',
  'Ghindi 1961': '142199986482',
  'Cristal de Paris': '115217048102',
  Bernardaud: '753215073222',
};

export function resolveBrandCategoryId(brandName?: string): string | null {
  if (!brandName) return null;
  const key = Object.keys(BRAND_CATEGORY_MAP).find(
    (k) => k.trim().toLowerCase() === brandName.trim().toLowerCase(),
  );
  if (!key) return null;
  const value = BRAND_CATEGORY_MAP[key];
  if (!value || value === 'REPLACE_WITH_TILDA_CATEGORY_ID') return null;
  return value;
}

export const ALL_BRAND_CATEGORY_IDS = new Set(Object.values(BRAND_CATEGORY_MAP));
