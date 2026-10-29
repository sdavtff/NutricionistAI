import { openDB, type DBSchema, type IDBPDatabase, type StoreNames } from 'idb';
import type {
  ChatConversation, Consent, FavoriteRecipe, Food, Habit, HabitLog, MealEntry, MeasurementLog,
  NutritionPlan, PhotoAnalysis, PlanCheck, Questionnaire, Reminder, Settings, ShoppingList,
  StoredImage, User, WaterLog, WeightLog,
} from './types';

export const DB_NAME = 'nutricionist-ai';
export const DB_VERSION = 2;

export interface NutriDB extends DBSchema {
  users: { key: string; value: User; indexes: { by_email: string } };
  consents: { key: string; value: Consent };
  questionnaires: { key: string; value: Questionnaire };
  settings: { key: string; value: Settings };
  foods: { key: string; value: Food; indexes: { by_user: string; by_barcode: string } };
  images: { key: string; value: StoredImage; indexes: { by_user: string } };
  analyses: { key: string; value: PhotoAnalysis; indexes: { by_user: string } };
  meals: { key: string; value: MealEntry; indexes: { by_user: string; by_user_date: [string, string] } };
  weights: { key: string; value: WeightLog; indexes: { by_user_date: [string, string] } };
  measurements: { key: string; value: MeasurementLog; indexes: { by_user_date: [string, string] } };
  plans: { key: string; value: NutritionPlan; indexes: { by_user: string } };
  planChecks: { key: string; value: PlanCheck; indexes: { by_user: string; by_plan_date: [string, string] } };
  habits: { key: string; value: Habit; indexes: { by_user: string } };
  habitLogs: { key: string; value: HabitLog; indexes: { by_user: string; by_user_date: [string, string] } };
  water: { key: string; value: WaterLog; indexes: { by_user: string } };
  chats: { key: string; value: ChatConversation; indexes: { by_user: string } };
  favorites: { key: string; value: FavoriteRecipe; indexes: { by_user: string } };
  shoppingLists: { key: string; value: ShoppingList; indexes: { by_user: string } };
  reminders: { key: string; value: Reminder; indexes: { by_user: string } };
}

export type StoreName = StoreNames<NutriDB>;

/** Lojas que contêm dados por usuário (usadas na exportação e exclusão). */
export const USER_STORES = [
  'consents', 'questionnaires', 'settings', 'foods', 'images', 'analyses', 'meals', 'weights',
  'measurements', 'plans', 'planChecks', 'habits', 'habitLogs', 'water', 'chats', 'favorites',
  'shoppingLists', 'reminders',
] as const;

let dbPromise: Promise<IDBPDatabase<NutriDB>> | null = null;

/**
 * Migrações incrementais: cada versão adiciona o que falta, preservando os dados existentes.
 * Para evoluir o esquema, incremente DB_VERSION e acrescente um bloco `if (oldVersion < N)`.
 */
export function getDB(): Promise<IDBPDatabase<NutriDB>> {
  if (!dbPromise) {
    dbPromise = openDB<NutriDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const users = db.createObjectStore('users', { keyPath: 'id' });
          users.createIndex('by_email', 'email', { unique: true });
          db.createObjectStore('consents', { keyPath: 'userId' });
          db.createObjectStore('questionnaires', { keyPath: 'userId' });
          db.createObjectStore('settings', { keyPath: 'userId' });
          const foods = db.createObjectStore('foods', { keyPath: 'id' });
          foods.createIndex('by_user', 'userId');
          foods.createIndex('by_barcode', 'barcode');
          db.createObjectStore('images', { keyPath: 'id' }).createIndex('by_user', 'userId');
          db.createObjectStore('analyses', { keyPath: 'id' }).createIndex('by_user', 'userId');
          const meals = db.createObjectStore('meals', { keyPath: 'id' });
          meals.createIndex('by_user', 'userId');
          meals.createIndex('by_user_date', ['userId', 'date']);
          db.createObjectStore('weights', { keyPath: 'id' }).createIndex('by_user_date', ['userId', 'date']);
          db.createObjectStore('measurements', { keyPath: 'id' }).createIndex('by_user_date', ['userId', 'date']);
          db.createObjectStore('plans', { keyPath: 'id' }).createIndex('by_user', 'userId');
          const checks = db.createObjectStore('planChecks', { keyPath: 'id' });
          checks.createIndex('by_user', 'userId');
          checks.createIndex('by_plan_date', ['planId', 'date']);
          db.createObjectStore('habits', { keyPath: 'id' }).createIndex('by_user', 'userId');
          const hl = db.createObjectStore('habitLogs', { keyPath: 'id' });
          hl.createIndex('by_user', 'userId');
          hl.createIndex('by_user_date', ['userId', 'date']);
          db.createObjectStore('chats', { keyPath: 'id' }).createIndex('by_user', 'userId');
          db.createObjectStore('favorites', { keyPath: 'id' }).createIndex('by_user', 'userId');
          db.createObjectStore('shoppingLists', { keyPath: 'id' }).createIndex('by_user', 'userId');
          db.createObjectStore('reminders', { keyPath: 'id' }).createIndex('by_user', 'userId');
        }
        if (oldVersion < 2) {
          // v2: registro de hidratação diária.
          if (!db.objectStoreNames.contains('water')) {
            db.createObjectStore('water', { keyPath: 'id' }).createIndex('by_user', 'userId');
          }
        }
      },
      blocked() {
        console.warn('Banco de dados bloqueado por outra aba aberta com versão antiga.');
      },
      terminated() {
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}

/** Usado nos testes para reiniciar a conexão. */
export async function closeDB() {
  if (dbPromise) {
    (await dbPromise).close();
    dbPromise = null;
  }
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
