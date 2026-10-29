// Consulta de rótulos no Open Food Facts (base aberta, licença ODbL — atribuição obrigatória).
// Não exige chave. Só é chamada quando o usuário pede explicitamente (busca por marca/código de barras).
import type { Food, Nutrients } from '../db/types';
import { normalizeNutrients } from '../lib/nutrition';

export const OFF_LABEL = 'Rótulo — Open Food Facts (ODbL)';
const BASE = 'https://world.openfoodfacts.org';

interface OFFProduct {
  code?: string;
  product_name?: string;
  product_name_pt?: string;
  brands?: string;
  serving_size?: string;
  nutriments?: Record<string, number | string | undefined>;
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
}

export function mapOFFNutrients(n: OFFProduct['nutriments'] = {}): Nutrients {
  const kcal = num(n['energy-kcal_100g']) ?? (num(n['energy_100g']) !== null ? Math.round(num(n['energy_100g'])! / 4.184) : null);
  const g2mg = (v: number | null) => (v === null ? null : Math.round(v * 1000));
  return normalizeNutrients({
    kcal,
    protein: num(n['proteins_100g']),
    carbs: num(n['carbohydrates_100g']),
    sugars: num(n['sugars_100g']),
    addedSugars: num(n['added-sugars_100g']),
    fat: num(n['fat_100g']),
    saturatedFat: num(n['saturated-fat_100g']),
    transFat: num(n['trans-fat_100g']),
    monoFat: num(n['monounsaturated-fat_100g']),
    polyFat: num(n['polyunsaturated-fat_100g']),
    fiber: num(n['fiber_100g']),
    sodium: g2mg(num(n['sodium_100g'])),
    cholesterol: g2mg(num(n['cholesterol_100g'])),
    potassium: g2mg(num(n['potassium_100g'])),
    calcium: g2mg(num(n['calcium_100g'])),
    iron: g2mg(num(n['iron_100g'])),
  } as Partial<Nutrients>);
}

function toFood(p: OFFProduct): Food | null {
  const name = p.product_name_pt || p.product_name;
  if (!name || !p.code) return null;
  const per100g = mapOFFNutrients(p.nutriments);
  if (per100g.kcal === null && per100g.protein === null && per100g.carbs === null) return null;
  return {
    id: `off:${p.code}`,
    name,
    brand: p.brands?.split(',')[0]?.trim(),
    barcode: p.code,
    category: 'Produto industrializado',
    per100g,
    source: 'rotulo',
    sourceLabel: OFF_LABEL,
  };
}

async function getJSON(url: string) {
  if (!navigator.onLine) throw new Error('Você está offline. A consulta de rótulos precisa de internet.');
  const res = await fetch(url);
  if (!res.ok) throw new Error('Não foi possível consultar o Open Food Facts agora.');
  return res.json();
}

export async function lookupBarcode(code: string): Promise<Food | null> {
  const clean = code.replace(/\D/g, '');
  if (clean.length < 8 || clean.length > 14) throw new Error('Código de barras inválido (8 a 14 dígitos).');
  const data = await getJSON(`${BASE}/api/v2/product/${clean}.json?fields=code,product_name,product_name_pt,brands,serving_size,nutriments`);
  return data.status === 1 ? toFood(data.product) : null;
}

export async function searchProducts(query: string): Promise<Food[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const data = await getJSON(
    `${BASE}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=12&countries_tags_en=brazil&fields=code,product_name,product_name_pt,brands,nutriments`,
  );
  return ((data.products ?? []) as OFFProduct[]).map(toFood).filter((f): f is Food => f !== null);
}
