import { Body, Controller, Get, Module, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Tx, db } from '../db';
import { DataISO, Ja, Role, Uzytkownik, Zalogowany, blad, stronicuj, waliduj } from '../wspolne';
import { kluczRozmiaru, najblizszyRozmiar, zalecenieDlaKategorii } from './dobor';

export const AKTYWNE_REZERWACJE = ['UTWORZONA', 'OPLACONA', 'WYDANA'] as const;
const UZYWALNE = ['DOSTEPNY', 'WYPOZYCZONY'] as const;

// Ile egzemplarzy modelu (opcjonalnie w danym rozmiarze) jest wolnych w terminie: egzemplarze w obiegu minus pozycje nakładających się rezerwacji.
export async function dostepneEgzemplarze(idModelu: number, od: Date, doDnia: Date, rozmiar?: string | null, tx: Tx = db as any) {
  const egz = await tx.egzemplarz.findMany({ where: { id_modelu: idModelu, stan: { in: [...UZYWALNE] } }, select: { dlugosc_cm: true, rozmiar: true } });
  const pojemnosc = egz.filter((e) => rozmiar == null || kluczRozmiaru(e) === rozmiar).length;
  const zajete = await tx.pozycja_rezerwacji.count({
    where: {
      id_modelu: idModelu,
      ...(rozmiar != null && { rozmiar_zalecany: rozmiar }),
      rezerwacja_sprzetu: { status: { in: [...AKTYWNE_REZERWACJE] }, data_od: { lte: doDnia }, data_do: { gte: od } },
    },
  });
  return Math.max(0, pojemnosc - zajete);
}

// Zalecany rozmiar dla klienta: reguła z profilu dopasowana do rozmiarów, które model faktycznie ma.
export async function zalecRozmiar(idKlienta: number, idModelu: number) {
  const model = await db.model_sprzetu.findUnique({ where: { id_modelu: idModelu }, include: { kategoria_sprzetu: true, egzemplarz: true } });
  if (!model) throw blad(404, 'Nie ma takiego modelu');
  const rozmiary = [...new Set(model.egzemplarz.map(kluczRozmiaru).filter((r): r is string => r != null))];
  if (!rozmiary.length) return { zalecany: null, rozmiary, opis: 'Rozmiar uniwersalny' };
  const profil = await db.profil_klienta.findUnique({ where: { id_klienta: idKlienta } });
  const z = zalecenieDlaKategorii(model.kategoria_sprzetu.nazwa, {
    wzrost_cm: profil?.wzrost_cm,
    waga_kg: profil?.waga_kg ? Number(profil.waga_kg) : null,
    rozmiar_buta_eu: profil?.rozmiar_buta_eu ? Number(profil.rozmiar_buta_eu) : null,
    poziom_jazdy: profil?.poziom_jazdy ?? 'POCZATKUJACY',
  });
  if (z.brakuje) return { zalecany: null, rozmiary, opis: `Uzupełnij w profilu: ${z.brakuje}`, brakuje: z.brakuje };
  if (z.wartosc == null) return { zalecany: null, rozmiary, opis: 'Wybierz rozmiar z listy' };
  const zalecany = najblizszyRozmiar(z.wartosc, rozmiary);
  return { zalecany, rozmiary, opis: `Według profilu: ${z.wartosc}${model.kategoria_sprzetu.nazwa === 'Narty' ? ' cm' : ''}, najbliższy dostępny rozmiar ${zalecany}` };
}

const Model = z.object({
  id_kategorii: z.number().int(),
  producent: z.string().trim().min(1).max(80),
  nazwa: z.string().trim().min(1).max(120),
  opis: z.string().max(5000).nullable().optional(),
  poziom_docelowy: z.enum(['POCZATKUJACY', 'SREDNIOZAAWANSOWANY', 'ZAAWANSOWANY']).nullable().optional(),
  cena_za_dzien: z.number().min(0),
  kaucja: z.number().min(0).optional(),
  zdjecie_url: z.url().max(500).nullable().optional(),
  aktywny: z.boolean().optional(),
});
const Egzemplarz = z.object({
  id_modelu: z.number().int(),
  kod_inwentarzowy: z.string().trim().min(1).max(30),
  rozmiar: z.string().trim().max(10).nullable().optional(),
  dlugosc_cm: z.number().int().min(50).max(250).nullable().optional(),
  stan: z.enum(['DOSTEPNY', 'WYPOZYCZONY', 'W_SERWISIE', 'WYCOFANY']).optional(),
  data_zakupu: DataISO.nullable().optional(),
});
const Termin = z.object({ od: DataISO.optional(), do: DataISO.optional() });

@Controller('sprzet')
export class SprzetController {
  @Get('kategorie')
  kategorie() {
    return db.kategoria_sprzetu.findMany({ orderBy: { id_kategorii: 'asc' } });
  }

  @Get('modele')
  async modele(@Query() q: Record<string, string>) {
    const s = stronicuj(q);
    const t = waliduj(Termin, q);
    const where: Prisma.model_sprzetuWhereInput = {
      aktywny: q.wszystkie === '1' ? undefined : true,
      ...(q.kategoria && { id_kategorii: Number(q.kategoria) }),
      ...(q.poziom && { poziom_docelowy: q.poziom as any }),
      ...(q.cenaMax && { cena_za_dzien: { lte: Number(q.cenaMax) } }),
    };
    const [modele, lacznie] = await Promise.all([
      db.model_sprzetu.findMany({ where, include: { kategoria_sprzetu: true }, orderBy: { id_modelu: 'asc' }, skip: s.skip, take: s.take }),
      db.model_sprzetu.count({ where }),
    ]);
    const dane = await Promise.all(
      modele.map(async (m) => ({ ...m, dostepne: t.od && t.do ? await dostepneEgzemplarze(m.id_modelu, t.od, t.do) : undefined })),
    );
    return { dane, strona: s.strona, rozmiar: s.rozmiar, lacznie };
  }

  @Get('modele/:id')
  async model(@Param('id', ParseIntPipe) id: number, @Query() q: Record<string, string>) {
    const t = waliduj(Termin, q);
    const m = await db.model_sprzetu.findUnique({ where: { id_modelu: id }, include: { kategoria_sprzetu: true, egzemplarz: { where: { stan: { in: [...UZYWALNE] } } } } });
    if (!m) throw blad(404, 'Nie ma takiego modelu');
    const { egzemplarz, ...model } = m;
    const klucze = [...new Set(egzemplarz.map(kluczRozmiaru))].sort((a, b) => Number(a) - Number(b));
    const rozmiary = await Promise.all(
      klucze.map(async (r) => ({
        rozmiar: r,
        egzemplarzy: egzemplarz.filter((e) => kluczRozmiaru(e) === r).length,
        dostepne: t.od && t.do ? await dostepneEgzemplarze(id, t.od, t.do, r) : undefined,
      })),
    );
    return { ...model, rozmiary };
  }

  @Get('modele/:id/dobor-rozmiaru')
  @Zalogowany()
  dobor(@Param('id', ParseIntPipe) id: number, @Ja() ja: Uzytkownik) {
    return zalecRozmiar(ja.id, id);
  }

  @Post('modele')
  @Role('ADMIN')
  dodajModel(@Body() body: unknown) {
    return db.model_sprzetu.create({ data: waliduj(Model, body) });
  }

  @Patch('modele/:id')
  @Role('ADMIN')
  edytujModel(@Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    return db.model_sprzetu.update({ where: { id_modelu: id }, data: waliduj(Model.partial(), body) });
  }

  @Get('egzemplarze')
  @Role('PRACOWNIK')
  egzemplarze(@Query('model') model?: string) {
    return db.egzemplarz.findMany({
      where: model ? { id_modelu: Number(model) } : {},
      include: { model_sprzetu: { select: { producent: true, nazwa: true } } },
      orderBy: { kod_inwentarzowy: 'asc' },
    });
  }

  @Post('egzemplarze')
  @Role('PRACOWNIK')
  dodajEgzemplarz(@Body() body: unknown) {
    return db.egzemplarz.create({ data: waliduj(Egzemplarz, body) });
  }

  @Patch('egzemplarze/:id')
  @Role('PRACOWNIK')
  edytujEgzemplarz(@Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    return db.egzemplarz.update({ where: { id_egzemplarza: id }, data: waliduj(Egzemplarz.partial(), body) });
  }
}

@Module({ controllers: [SprzetController] })
export class SprzetModule {}
