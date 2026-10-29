// Camada de persistência: todas as operações de leitura/escrita do app passam por aqui.
import { getDB, uid, USER_STORES } from './index';
import type {
  ChatConversation, Consent, Food, Habit, HabitLog, MealEntry, MeasurementLog, NutritionPlan,
  PhotoAnalysis, PlanCheck, Questionnaire, QuestionnaireAnswers, Reminder, Settings, ShoppingList,
  StoredImage, User, WaterLog, WeightLog,
} from './types';

export class DataError extends Error {}

// ---------- Usuários ----------
export async function findUserByEmail(email: string) {
  return (await getDB()).getFromIndex('users', 'by_email', email.trim().toLowerCase());
}
export async function getUser(id: string) {
  return (await getDB()).get('users', id);
}
export async function putUser(u: User) {
  await (await getDB()).put('users', u);
}

// ---------- Consentimento ----------
export async function getConsent(userId: string) {
  return (await getDB()).get('consents', userId);
}
export async function saveConsent(c: Consent) {
  await (await getDB()).put('consents', c);
}

// ---------- Questionário ----------
export async function getQuestionnaire(userId: string) {
  return (await getDB()).get('questionnaires', userId);
}
export async function saveQuestionnaire(userId: string, answers: QuestionnaireAnswers, step: number, completed: boolean) {
  const q: Questionnaire = { userId, answers, step, completed, updatedAt: Date.now() };
  await (await getDB()).put('questionnaires', q);
  return q;
}

// ---------- Configurações ----------
export function defaultSettings(userId: string): Settings {
  return {
    userId, theme: 'sistema', hideCalories: false, hideWeight: false, weightTrackingEnabled: true,
    waterGoalMl: 2000, imageQuality: 'padrao', updatedAt: Date.now(),
  };
}
export async function getSettings(userId: string): Promise<Settings> {
  return (await (await getDB()).get('settings', userId)) ?? defaultSettings(userId);
}
export async function saveSettings(s: Settings) {
  await (await getDB()).put('settings', { ...s, updatedAt: Date.now() });
}

// ---------- Imagens ----------
export const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;
export const MAX_TOTAL_IMAGE_BYTES = 150 * 1024 * 1024;

export async function saveImage(userId: string, blob: Blob, width: number, height: number): Promise<StoredImage> {
  if (blob.size > MAX_IMAGE_BYTES) throw new DataError('A imagem é grande demais mesmo após a compressão.');
  const used = await imageUsage(userId);
  if (used.bytes + blob.size > MAX_TOTAL_IMAGE_BYTES) {
    throw new DataError('Limite de armazenamento de fotos atingido. Exclua fotos antigas em Privacidade e dados.');
  }
  const img: StoredImage = { id: uid(), userId, blob, bytes: blob.size, width, height, createdAt: Date.now() };
  await (await getDB()).put('images', img);
  return img;
}
export async function getImage(id: string) {
  return (await getDB()).get('images', id);
}
export async function imageUsage(userId: string) {
  const imgs = await (await getDB()).getAllFromIndex('images', 'by_user', userId);
  return { count: imgs.length, bytes: imgs.reduce((s, i) => s + i.bytes, 0) };
}
/** Exclui todas as fotos e remove as referências nas refeições/análises. */
export async function deleteAllImages(userId: string) {
  const db = await getDB();
  const tx = db.transaction(['images', 'meals', 'analyses'], 'readwrite');
  for (const k of await tx.objectStore('images').index('by_user').getAllKeys(userId)) await tx.objectStore('images').delete(k);
  for (const m of await tx.objectStore('meals').index('by_user').getAll(userId)) {
    if (m.imageId) await tx.objectStore('meals').put({ ...m, imageId: undefined });
  }
  for (const a of await tx.objectStore('analyses').index('by_user').getAll(userId)) await tx.objectStore('analyses').delete(a.id);
  await tx.done;
}
export async function deleteImage(id: string) {
  await (await getDB()).delete('images', id);
}

// ---------- Análises de foto ----------
export async function saveAnalysis(a: PhotoAnalysis) {
  await (await getDB()).put('analyses', a);
}
export async function getAnalysis(id: string) {
  return (await getDB()).get('analyses', id);
}
export async function listAnalyses(userId: string) {
  const all = await (await getDB()).getAllFromIndex('analyses', 'by_user', userId);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

// ---------- Alimentos personalizados ----------
export async function listCustomFoods(userId: string) {
  return (await getDB()).getAllFromIndex('foods', 'by_user', userId);
}
export async function saveFood(f: Food) {
  await (await getDB()).put('foods', f);
}
export async function deleteFood(id: string) {
  await (await getDB()).delete('foods', id);
}

// ---------- Diário ----------
export async function listMealsByDate(userId: string, date: string) {
  const meals = await (await getDB()).getAllFromIndex('meals', 'by_user_date', [userId, date]);
  return meals.sort((a, b) => a.time.localeCompare(b.time));
}
export async function listMealsInRange(userId: string, start: string, end: string) {
  const range = IDBKeyRange.bound([userId, start], [userId, end]);
  return (await getDB()).getAllFromIndex('meals', 'by_user_date', range);
}
export async function listRecentMeals(userId: string, limit = 6) {
  const all = await (await getDB()).getAllFromIndex('meals', 'by_user', userId);
  return all.sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time)).slice(0, limit);
}
export async function getMeal(id: string) {
  return (await getDB()).get('meals', id);
}
/**
 * Salva uma refeição. Para evitar contagem dupla, uma análise de foto só pode gerar uma refeição:
 * se já existir uma refeição para a mesma análise, ela é atualizada em vez de duplicada.
 */
export async function saveMeal(m: MealEntry): Promise<MealEntry> {
  if (!m.items.length) throw new DataError('Adicione ao menos um alimento à refeição.');
  if (m.items.some((i) => !(i.grams > 0) || i.grams > 5000)) throw new DataError('Informe porções entre 1 g e 5.000 g.');
  const db = await getDB();
  if (m.analysisId) {
    const all = await db.getAllFromIndex('meals', 'by_user', m.userId);
    const existing = all.find((x) => x.analysisId === m.analysisId && x.id !== m.id);
    if (existing) m = { ...m, id: existing.id, createdAt: existing.createdAt };
  }
  const saved = { ...m, updatedAt: Date.now() };
  await db.put('meals', saved);
  if (m.analysisId) {
    const a = await db.get('analyses', m.analysisId);
    if (a) await db.put('analyses', { ...a, savedMealId: saved.id, confirmedItems: m.items });
  }
  return saved;
}
export async function duplicateMeal(id: string, date: string, time: string) {
  const m = await getMeal(id);
  if (!m) throw new DataError('Refeição não encontrada.');
  const copy: MealEntry = {
    ...m, id: uid(), date, time, analysisId: undefined, createdAt: Date.now(), updatedAt: Date.now(),
    items: m.items.map((i) => ({ ...i, id: uid() })),
  };
  await (await getDB()).put('meals', copy);
  return copy;
}
export async function deleteMeal(id: string) {
  const db = await getDB();
  const m = await db.get('meals', id);
  if (!m) return;
  await db.delete('meals', id);
  if (m.imageId) {
    // Remove a foto apenas se nenhuma outra refeição a usar (duplicatas compartilham a foto).
    const others = (await db.getAllFromIndex('meals', 'by_user', m.userId)).filter((x) => x.imageId === m.imageId);
    const analysisUsing = (await db.getAllFromIndex('analyses', 'by_user', m.userId)).some((a) => a.imageId === m.imageId);
    if (!others.length && !analysisUsing) await db.delete('images', m.imageId);
  }
  if (m.analysisId) {
    const a = await db.get('analyses', m.analysisId);
    if (a?.savedMealId === id) await db.put('analyses', { ...a, savedMealId: undefined });
  }
}

// ---------- Peso e medidas ----------
export async function listWeights(userId: string) {
  const range = IDBKeyRange.bound([userId, ''], [userId, '￿']);
  return (await getDB()).getAllFromIndex('weights', 'by_user_date', range);
}
export async function saveWeight(userId: string, date: string, weightKg: number) {
  if (!(weightKg >= 20 && weightKg <= 400)) throw new DataError('Informe um peso entre 20 e 400 kg.');
  const db = await getDB();
  const existing = (await db.getAllFromIndex('weights', 'by_user_date', [userId, date]))[0];
  const w: WeightLog = { id: existing?.id ?? uid(), userId, date, weightKg, createdAt: Date.now() };
  await db.put('weights', w);
  return w;
}
export async function deleteWeight(id: string) {
  await (await getDB()).delete('weights', id);
}
export async function listMeasurements(userId: string) {
  const range = IDBKeyRange.bound([userId, ''], [userId, '￿']);
  return (await getDB()).getAllFromIndex('measurements', 'by_user_date', range);
}
export async function saveMeasurement(m: Omit<MeasurementLog, 'id' | 'createdAt'>) {
  const rec: MeasurementLog = { ...m, id: uid(), createdAt: Date.now() };
  await (await getDB()).put('measurements', rec);
  return rec;
}
export async function deleteMeasurement(id: string) {
  await (await getDB()).delete('measurements', id);
}

// ---------- Planos ----------
export async function savePlan(p: NutritionPlan) {
  await (await getDB()).put('plans', p);
}
export async function getLatestPlan(userId: string) {
  const all = await (await getDB()).getAllFromIndex('plans', 'by_user', userId);
  return all.sort((a, b) => b.createdAt - a.createdAt)[0];
}
export async function listPlanChecks(planId: string, date: string) {
  return (await getDB()).getAllFromIndex('planChecks', 'by_plan_date', [planId, date]);
}
export async function setPlanCheck(c: Omit<PlanCheck, 'id'>) {
  await (await getDB()).put('planChecks', { ...c, id: `${c.planId}|${c.date}|${c.key}` });
}

// ---------- Hábitos ----------
export async function listHabits(userId: string) {
  const all = await (await getDB()).getAllFromIndex('habits', 'by_user', userId);
  return all.sort((a, b) => a.createdAt - b.createdAt);
}
export async function saveHabit(h: Habit) {
  await (await getDB()).put('habits', h);
}
export async function deleteHabit(id: string) {
  const db = await getDB();
  const tx = db.transaction(['habits', 'habitLogs'], 'readwrite');
  await tx.objectStore('habits').delete(id);
  let cursor = await tx.objectStore('habitLogs').openCursor();
  while (cursor) {
    if (cursor.value.habitId === id) await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}
export async function listHabitLogsInRange(userId: string, start: string, end: string) {
  const range = IDBKeyRange.bound([userId, start], [userId, end]);
  return (await getDB()).getAllFromIndex('habitLogs', 'by_user_date', range);
}
export async function setHabitLog(l: Omit<HabitLog, 'id'>) {
  await (await getDB()).put('habitLogs', { ...l, id: `${l.habitId}|${l.date}` });
}

// ---------- Água ----------
export async function getWater(userId: string, date: string): Promise<WaterLog> {
  return (await (await getDB()).get('water', `${userId}|${date}`)) ?? { id: `${userId}|${date}`, userId, date, ml: 0 };
}
export async function setWater(userId: string, date: string, ml: number) {
  await (await getDB()).put('water', { id: `${userId}|${date}`, userId, date, ml: Math.max(0, Math.min(10000, ml)) });
}

// ---------- Chat ----------
export async function listChats(userId: string) {
  const all = await (await getDB()).getAllFromIndex('chats', 'by_user', userId);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function saveChat(c: ChatConversation) {
  await (await getDB()).put('chats', { ...c, updatedAt: Date.now() });
}
export async function deleteChat(id: string) {
  await (await getDB()).delete('chats', id);
}
export async function clearChats(userId: string) {
  const db = await getDB();
  for (const k of await db.getAllKeysFromIndex('chats', 'by_user', userId)) await db.delete('chats', k);
}

// ---------- Receitas favoritas ----------
export async function listFavorites(userId: string) {
  return (await getDB()).getAllFromIndex('favorites', 'by_user', userId);
}
export async function toggleFavorite(userId: string, recipeId: string) {
  const db = await getDB();
  const id = `${userId}|${recipeId}`;
  if (await db.get('favorites', id)) {
    await db.delete('favorites', id);
    return false;
  }
  await db.put('favorites', { id, userId, recipeId, createdAt: Date.now() });
  return true;
}

// ---------- Listas de compras ----------
export async function listShoppingLists(userId: string) {
  const all = await (await getDB()).getAllFromIndex('shoppingLists', 'by_user', userId);
  return all.sort((a, b) => b.weekStart.localeCompare(a.weekStart) || b.updatedAt - a.updatedAt);
}
export async function getShoppingList(id: string) {
  return (await getDB()).get('shoppingLists', id);
}
export async function saveShoppingList(l: ShoppingList) {
  await (await getDB()).put('shoppingLists', { ...l, updatedAt: Date.now() });
}
export async function deleteShoppingList(id: string) {
  await (await getDB()).delete('shoppingLists', id);
}
export async function getOrCreateWeekList(userId: string, weekStartISO: string): Promise<ShoppingList> {
  const lists = await listShoppingLists(userId);
  const found = lists.find((l) => l.weekStart === weekStartISO);
  if (found) return found;
  const l: ShoppingList = {
    id: uid(), userId, title: `Semana de ${weekStartISO.split('-').reverse().join('/')}`, weekStart: weekStartISO,
    items: [], createdAt: Date.now(), updatedAt: Date.now(),
  };
  await saveShoppingList(l);
  return l;
}

// ---------- Lembretes ----------
export async function listReminders(userId: string) {
  return (await getDB()).getAllFromIndex('reminders', 'by_user', userId);
}
export async function saveReminder(r: Reminder) {
  await (await getDB()).put('reminders', r);
}

// ---------- Exportação e exclusão ----------
async function blobToDataURL(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:${blob.type || 'image/jpeg'};base64,${btoa(s)}`;
}

export async function exportUserData(userId: string, includeImages: boolean) {
  const db = await getDB();
  const user = await db.get('users', userId);
  const out: Record<string, unknown> = {
    app: 'Nutricionist AI',
    exportedAt: new Date().toISOString(),
    schemaVersion: db.version,
    user: user ? { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt } : null,
  };
  for (const store of USER_STORES) {
    let rows: unknown[];
    if (store === 'consents' || store === 'questionnaires' || store === 'settings') {
      const r = await db.get(store, userId);
      rows = r ? [r] : [];
    } else if (store === 'weights' || store === 'measurements') {
      rows = await db.getAllFromIndex(store, 'by_user_date', IDBKeyRange.bound([userId, ''], [userId, '￿']));
    } else {
      rows = await db.getAllFromIndex(store, 'by_user', userId);
    }
    if (store === 'settings') {
      // A chave da OpenRouter é um segredo: nunca sai do dispositivo na exportação.
      rows = (rows as Settings[]).map(({ openrouterKey, ...rest }) => ({ ...rest, openrouterKey: openrouterKey ? '(removida da exportação)' : undefined }));
    }
    if (store === 'images') {
      rows = includeImages
        ? await Promise.all((rows as StoredImage[]).map(async (i) => ({ ...i, blob: await blobToDataURL(i.blob) })))
        : (rows as StoredImage[]).map(({ blob: _b, ...rest }) => rest);
    }
    out[store] = rows;
  }
  return out;
}

/** Remove TODOS os dados do usuário no dispositivo, incluindo a conta. */
export async function deleteAllUserData(userId: string) {
  const db = await getDB();
  for (const store of USER_STORES) {
    if (store === 'consents' || store === 'questionnaires' || store === 'settings') {
      await db.delete(store, userId);
      continue;
    }
    const tx = db.transaction(store, 'readwrite');
    let cursor = await tx.store.openCursor();
    while (cursor) {
      if ((cursor.value as { userId?: string }).userId === userId) await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  }
  await db.delete('users', userId);
}

export async function countUserRecords(userId: string) {
  const db = await getDB();
  const [meals, analyses, chats, weights, lists] = await Promise.all([
    db.countFromIndex('meals', 'by_user', userId),
    db.countFromIndex('analyses', 'by_user', userId),
    db.countFromIndex('chats', 'by_user', userId),
    db.countFromIndex('weights', 'by_user_date', IDBKeyRange.bound([userId, ''], [userId, '￿'])),
    db.countFromIndex('shoppingLists', 'by_user', userId),
  ]);
  return { meals, analyses, chats, weights, lists };
}

export { uid };
