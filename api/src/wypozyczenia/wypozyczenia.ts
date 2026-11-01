import { randomBytes } from 'node:crypto';
import { Body, Controller, Get, Module, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { z } from 'zod';
import { db } from '../db';
import { kluczRozmiaru, liczbaDni } from '../sprzet/dobor';
import { dostepneEgzemplarze, zalecRozmiar } from '../sprzet/sprzet';
import { DataISO, Ja, Role, Uzytkownik, blad, dzisiaj, waliduj } from '../wspolne';

const NowaRezerwacja = z.object({
  dataOd: DataISO,
  dataDo: DataISO,
  pozycje: z.array(z.object({ idModelu: z.number().int(), rozmiar: z.string().max(10).nullable().optional() })).min(1).max(20),
  // wypożyczenie przez pracownika (także na miejscu): dla kogo
  klient: z
    .object({
      email: z.email().transform((e) => e.toLowerCase()),
      imie: z.string().trim().min(1).max(80),
      nazwisko: z.string().trim().min(1).max(80),
      telefon: z.string().trim().max(20).optional(),
    })
    .optional(),
});

const szczegoly = {
  pozycja_rezerwacji: { include: { model_sprzetu: { include: { kategoria_sprzetu: true } }, egzemplarz: true } },
  klient: { select: { id_uzytkownika: true, imie: true, nazwisko: true, email: true, telefon: true } },
} satisfies Prisma.rezerwacja_sprzetuInclude;

export const kodRezerwacji = (id: number) => `R-${String(id).padStart(6, '0')}`;
const zKodem = <T extends { id_rezerwacji: number }>(r: T) => ({ ...r, kod: kodRezerwacji(r.id_rezerwacji) });

@Controller('rezerwacje-sprzetu')
export class WypozyczeniaController {
  @Post()
  @Role('KLIENT', 'PRACOWNIK')
  async utworz(@Body() body: unknown, @Ja() ja: Uzytkownik) {
    const d = waliduj(NowaRezerwacja, body);
    if (d.dataDo < d.dataOd) throw blad(400, 'Data zwrotu nie może być wcześniejsza niż data odbioru');
    if (d.dataOd < dzisiaj()) throw blad(400, 'Nie można rezerwować wstecz');

    const obsluga = ja.rola !== 'KLIENT';
    if (obsluga && !d.klient) throw blad(400, 'Podaj dane klienta');
    const idKlienta = obsluga ? await this.klientNaMiejscu(d.klient!) : ja.id;

    // Rozmiar każdej pozycji: podany albo zalecony z profilu klienta.
    const pozycje: { idModelu: number; rozmiar: string | null }[] = [];
    for (const p of d.pozycje) {
      const z = await zalecRozmiar(idKlienta, p.idModelu);
      const rozmiar = p.rozmiar ?? z.zalecany;
      if (z.rozmiary.length && !rozmiar) throw blad(400, z.brakuje ? `Uzupełnij profil (${z.brakuje}) albo wybierz rozmiar` : 'Wybierz rozmiar');
      if (rozmiar && !z.rozmiary.includes(rozmiar)) throw blad(400, `Model nie ma rozmiaru ${rozmiar}`);
      pozycje.push({ idModelu: p.idModelu, rozmiar: rozmiar ?? null });
    }

    const dni = liczbaDni(d.dataOd, d.dataDo);
    const r = await db.$transaction(async (tx) => {
      // Blokada egzemplarzy zamawianych modeli: równoległe rezerwacje tych samych modeli czekają tutaj na swoją kolej.
      const idModeli = [...new Set(pozycje.map((p) => p.idModelu))];
      await tx.$queryRaw`SELECT id_egzemplarza FROM egzemplarz WHERE id_modelu = ANY(${idModeli}::int[]) FOR UPDATE`;
      const modele = await tx.model_sprzetu.findMany({ where: { id_modelu: { in: idModeli }, aktywny: true } });
      if (modele.length !== idModeli.length) throw blad(404, 'Któryś model nie istnieje albo jest niedostępny');

      const potrzebne = new Map<string, number>();
      for (const p of pozycje) potrzebne.set(`${p.idModelu}|${p.rozmiar}`, (potrzebne.get(`${p.idModelu}|${p.rozmiar}`) ?? 0) + 1);
      for (const [klucz, ile] of potrzebne) {
        const [idModelu, rozmiar] = klucz.split('|');
        const wolne = await dostepneEgzemplarze(Number(idModelu), d.dataOd, d.dataDo, rozmiar === 'null' ? null : rozmiar, tx);
        if (wolne < ile) {
          const m = modele.find((x) => x.id_modelu === Number(idModelu))!;
          throw blad(409, `Brak wolnych egzemplarzy: ${m.producent} ${m.nazwa}${rozmiar !== 'null' ? ` (rozmiar ${rozmiar})` : ''} w tym terminie. Wybierz inny model lub termin.`);
        }
      }

      const cena = (id: number) => modele.find((m) => m.id_modelu === id)!;
      const suma = pozycje.reduce((s, p) => s + Number(cena(p.idModelu).cena_za_dzien) * dni + Number(cena(p.idModelu).kaucja), 0);
      return tx.rezerwacja_sprzetu.create({
        data: {
          id_klienta: idKlienta,
          data_od: d.dataOd,
          data_do: d.dataDo,
          kwota_calkowita: suma,
          pozycja_rezerwacji: {
            create: pozycje.map((p) => ({ id_modelu: p.idModelu, rozmiar_zalecany: p.rozmiar, cena: Number(cena(p.idModelu).cena_za_dzien) * dni })),
          },
        },
        include: szczegoly,
      });
    });
    return zKodem(r);
  }

  @Get('moje')
  @Role('KLIENT')
  async moje(@Ja() ja: Uzytkownik) {
    const r = await db.rezerwacja_sprzetu.findMany({ where: { id_klienta: ja.id }, include: szczegoly, orderBy: { data_od: 'desc' } });
    return r.map(zKodem);
  }

  @Get()
  @Role('PRACOWNIK')
  async szukaj(@Query('szukaj') szukaj = '') {
    const s = szukaj.trim();
    const id = s.match(/^(?:R-?)?0*(\d+)$/i)?.[1];
    const where: Prisma.rezerwacja_sprzetuWhereInput = !s
      ? { status: { in: ['UTWORZONA', 'OPLACONA', 'WYDANA'] } }
      : {
          OR: [
            ...(id ? [{ id_rezerwacji: Number(id) }] : []),
            { klient: { nazwisko: { contains: s, mode: 'insensitive' } } },
            { klient: { telefon: { contains: s.replace(/\s/g, '') } } },
            { klient: { email: { contains: s, mode: 'insensitive' } } },
          ],
        };
    const r = await db.rezerwacja_sprzetu.findMany({ where, include: szczegoly, orderBy: { data_od: 'asc' }, take: 50 });
    return r.map(zKodem);
  }

  @Get(':id')
  @Role('KLIENT', 'PRACOWNIK')
  async jedna(@Param('id', ParseIntPipe) id: number, @Ja() ja: Uzytkownik) {
    const r = await this.pobierz(id, ja);
    // Dla pracownika: wolne egzemplarze do przypisania przy wydaniu, najbliższe zalecanemu rozmiarowi na górze.
    const pozycje = await Promise.all(
      r.pozycja_rezerwacji.map(async (p) => {
        if (ja.rola === 'KLIENT') return p;
        const wolne = await db.egzemplarz.findMany({ where: { id_modelu: p.id_modelu, stan: 'DOSTEPNY' } });
        const odl = (e: (typeof wolne)[number]) => (p.rozmiar_zalecany ? Math.abs(Number(kluczRozmiaru(e)) - Number(p.rozmiar_zalecany)) || 0 : 0);
        return { ...p, wolneEgzemplarze: wolne.sort((a, b) => odl(a) - odl(b)) };
      }),
    );
    return zKodem({ ...r, pozycja_rezerwacji: pozycje });
  }

  @Post(':id/anuluj')
  @Role('KLIENT', 'PRACOWNIK')
  async anuluj(@Param('id', ParseIntPipe) id: number, @Ja() ja: Uzytkownik) {
    const r = await this.pobierz(id, ja);
    if (!['UTWORZONA', 'OPLACONA'].includes(r.status)) throw blad(409, 'Tej rezerwacji nie można już anulować');
    // shortcut: zwrot płatności ≥ 24 h przed terminem dojdzie razem ze Stripe (etap 01.12); w MVP płatność jest przy ladzie.
    return zKodem(await db.rezerwacja_sprzetu.update({ where: { id_rezerwacji: id }, data: { status: 'ANULOWANA' }, include: szczegoly }));
  }

  @Post(':id/wydanie')
  @Role('PRACOWNIK')
  async wydanie(@Param('id', ParseIntPipe) id: number, @Body() body: unknown, @Ja() ja: Uzytkownik) {
    const { egzemplarze } = waliduj(z.object({ egzemplarze: z.array(z.object({ idPozycji: z.number().int(), idEgzemplarza: z.number().int() })) }), body);
    return db.$transaction(async (tx) => {
      const r = await tx.rezerwacja_sprzetu.findUnique({ where: { id_rezerwacji: id }, include: { pozycja_rezerwacji: true } });
      if (!r) throw blad(404, 'Nie ma takiej rezerwacji');
      if (!['UTWORZONA', 'OPLACONA'].includes(r.status)) throw blad(409, 'Rezerwacja nie czeka na wydanie');
      const dzis = dzisiaj();
      if (r.data_od > dzis || r.data_do < dzis) throw blad(409, 'Sprzęt wydajemy w terminie rezerwacji');
      if (new Set(egzemplarze.map((e) => e.idEgzemplarza)).size !== egzemplarze.length) throw blad(400, 'Ten sam egzemplarz wybrano dwa razy');
      if (r.pozycja_rezerwacji.some((p) => !egzemplarze.find((e) => e.idPozycji === p.id_pozycji))) throw blad(400, 'Przypisz egzemplarz do każdej pozycji');

      for (const e of egzemplarze) {
        const p = r.pozycja_rezerwacji.find((x) => x.id_pozycji === e.idPozycji);
        if (!p) throw blad(400, `Pozycja ${e.idPozycji} nie należy do rezerwacji`);
        const [egz] = await tx.$queryRaw<{ id_modelu: number; stan: string }[]>`SELECT id_modelu, stan FROM egzemplarz WHERE id_egzemplarza = ${e.idEgzemplarza} FOR UPDATE`;
        if (!egz || egz.id_modelu !== p.id_modelu) throw blad(400, `Egzemplarz ${e.idEgzemplarza} to inny model`);
        if (egz.stan !== 'DOSTEPNY') throw blad(409, `Egzemplarz ${e.idEgzemplarza} nie jest dostępny`);
        await tx.egzemplarz.update({ where: { id_egzemplarza: e.idEgzemplarza }, data: { stan: 'WYPOZYCZONY' } });
        await tx.pozycja_rezerwacji.update({ where: { id_pozycji: p.id_pozycji }, data: { id_egzemplarza: e.idEgzemplarza } });
      }
      const w = await tx.rezerwacja_sprzetu.update({
        where: { id_rezerwacji: id },
        data: { status: 'WYDANA', id_pracownika_wydania: ja.id, data_wydania: new Date() },
        include: szczegoly,
      });
      return zKodem(w);
    });
  }

  @Post(':id/zwrot')
  @Role('PRACOWNIK')
  async zwrot(@Param('id', ParseIntPipe) id: number, @Body() body: unknown, @Ja() ja: Uzytkownik) {
    const { uszkodzenia } = waliduj(
      z.object({
        uszkodzenia: z.array(z.object({ idEgzemplarza: z.number().int(), opis: z.string().trim().min(3).max(2000), oplata: z.number().min(0) })).default([]),
      }),
      body ?? {},
    );
    return db.$transaction(async (tx) => {
      const r = await tx.rezerwacja_sprzetu.findUnique({ where: { id_rezerwacji: id }, include: { pozycja_rezerwacji: { include: { model_sprzetu: true } } } });
      if (!r) throw blad(404, 'Nie ma takiej rezerwacji');
      if (r.status !== 'WYDANA') throw blad(409, 'Ta rezerwacja nie jest wydana');
      const wydane = r.pozycja_rezerwacji.map((p) => p.id_egzemplarza);
      if (uszkodzenia.some((u) => !wydane.includes(u.idEgzemplarza))) throw blad(400, 'Uszkodzony egzemplarz nie należy do tej rezerwacji');

      for (const p of r.pozycja_rezerwacji) {
        const u = uszkodzenia.find((x) => x.idEgzemplarza === p.id_egzemplarza);
        if (u)
          await tx.zgloszenie_serwisowe.create({
            data: { id_egzemplarza: u.idEgzemplarza, id_pracownika: ja.id, id_rezerwacji: id, opis_uszkodzenia: u.opis, oplata_za_szkode: u.oplata },
          });
        await tx.egzemplarz.update({ where: { id_egzemplarza: p.id_egzemplarza! }, data: { stan: u ? 'W_SERWISIE' : 'DOSTEPNY' } });
      }

      // Zwrot po terminie: każdy rozpoczęty dzień zwłoki według ceny dziennej pozycji.
      const dniZwloki = Math.max(0, liczbaDni(r.data_do, dzisiaj()) - 1);
      const cenaDnia = r.pozycja_rezerwacji.reduce((s, p) => s + Number(p.model_sprzetu.cena_za_dzien), 0);
      const kaucja = r.pozycja_rezerwacji.reduce((s, p) => s + Number(p.model_sprzetu.kaucja), 0);
      const oplataZwloka = dniZwloki * cenaDnia;
      const oplataSzkody = uszkodzenia.reduce((s, u) => s + u.oplata, 0);

      const w = await tx.rezerwacja_sprzetu.update({
        where: { id_rezerwacji: id },
        data: { status: 'ZWROCONA', id_pracownika_zwrotu: ja.id, data_zwrotu: new Date(), kwota_calkowita: { increment: oplataZwloka } },
        include: szczegoly,
      });
      return { ...zKodem(w), rozliczenie: { kaucja, oplataZwloka, dniZwloki, oplataSzkody, doZwrotuZKaucji: kaucja - oplataZwloka - oplataSzkody } };
    });
  }

  private async pobierz(id: number, ja: Uzytkownik) {
    const r = await db.rezerwacja_sprzetu.findUnique({ where: { id_rezerwacji: id }, include: szczegoly });
    if (!r || (ja.rola === 'KLIENT' && r.id_klienta !== ja.id)) throw blad(404, 'Nie ma takiej rezerwacji');
    return r;
  }

  // Klient bez konta przy ladzie (F-15): zakładamy konto z losowym hasłem, które może później zresetować.
  private async klientNaMiejscu(k: { email: string; imie: string; nazwisko: string; telefon?: string }) {
    const istnieje = await db.uzytkownik.findUnique({ where: { email: k.email } });
    if (istnieje) return istnieje.id_uzytkownika;
    const u = await db.uzytkownik.create({
      data: { ...k, haslo_hash: await argon2.hash(randomBytes(24).toString('hex')), profil_klienta: { create: {} } },
    });
    return u.id_uzytkownika;
  }
}

@Module({ controllers: [WypozyczeniaController] })
export class WypozyczeniaModule {}
