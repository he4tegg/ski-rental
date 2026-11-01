import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaClient } from '@prisma/client';

// Kontekst żądania: kto i skąd, potrzebny do dziennika audytu (F-48).
export const kontekst = new AsyncLocalStorage<{ idUzytkownika?: number; ip?: string }>();

const baza = new PrismaClient();

// Tabele techniczne i czat nie są „danymi biznesowymi”, nie trafiają do audytu.
const BEZ_AUDYTU = new Set(['wpis_audytu', 'token_odswiezania', 'wiadomosc_czatu', 'rozmowa_czatu']);
const ZAPISY = new Set(['create', 'update', 'delete', 'upsert', 'createMany', 'updateMany', 'deleteMany']);

const doJson = (v: unknown) =>
  v == null
    ? undefined
    : JSON.parse(JSON.stringify(v, (k, x) => (k === 'haslo_hash' ? undefined : typeof x === 'bigint' ? x.toString() : x)));

// shortcut: wpis audytu zapisuje się poza transakcją wywołującego, więc wycofana transakcja zostawia wpis; przy dużym ruchu przenieść do triggerów w bazie.
export const db = baza.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!ZAPISY.has(operation) || BEZ_AUDYTU.has(model)) return query(args);
        const a = args as any;
        const delegat = (baza as any)[model];
        const przed = ['update', 'delete', 'upsert'].includes(operation) ? await delegat.findUnique({ where: a.where }) : null;
        const wynik: any = await query(args);
        const ctx = kontekst.getStore();
        const idEncji = wynik && typeof wynik === 'object' ? Object.entries(wynik).find(([k, v]) => k.startsWith('id_') && typeof v === 'number')?.[1] : undefined;
        await baza.wpis_audytu.create({
          data: {
            akcja: `${model}.${operation}`.toUpperCase(),
            encja: model,
            id_encji: (idEncji as number) ?? null,
            dane_przed: doJson(przed),
            dane_po: doJson(operation.endsWith('Many') ? a.data ?? a.where : wynik),
            id_uzytkownika: ctx?.idUzytkownika ?? null,
            adres_ip: ctx?.ip ?? null,
          },
        });
        return wynik;
      },
    },
  },
});

export type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];
