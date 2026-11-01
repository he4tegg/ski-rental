import { Body, Controller, Get, Module, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '../db';
import { Ja, Role, Uzytkownik, blad, stronicuj, waliduj } from '../wspolne';
import { zaplanujIndeksowanie } from './indeksowanie';

const Artykul = z.object({
  idKategorii: z.number().int(),
  tytul: z.string().trim().min(3).max(200),
  tresc: z.string().trim().min(20).max(50_000),
});

const autorzy = {
  kategoria_wiedzy: true,
  uzytkownik_artykul_id_autoraTouzytkownik: { select: { imie: true, nazwisko: true } },
} satisfies Prisma.artykulInclude;

@Controller('baza-wiedzy')
export class BazaWiedzyController {
  @Get('kategorie')
  kategorie() {
    return db.kategoria_wiedzy.findMany({ orderBy: { kolejnosc: 'asc' } });
  }

  @Get('artykuly')
  async artykuly(@Query() q: Record<string, string>, @Ja() ja?: Uzytkownik) {
    const s = stronicuj(q);
    const wszystkie = q.wszystkie === '1' && ja?.rola === 'ADMIN';
    const where: Prisma.artykulWhereInput = {
      ...(wszystkie ? (q.status ? { status: q.status as any } : {}) : { status: 'OPUBLIKOWANY' }),
      ...(q.kategoria && { id_kategorii_wiedzy: Number(q.kategoria) }),
      ...(q.q && { OR: [{ tytul: { contains: q.q, mode: 'insensitive' } }, { tresc_markdown: { contains: q.q, mode: 'insensitive' } }] }),
    };
    const [dane, lacznie] = await Promise.all([
      db.artykul.findMany({ where, include: autorzy, orderBy: [{ id_kategorii_wiedzy: 'asc' }, { tytul: 'asc' }], skip: s.skip, take: s.take }),
      db.artykul.count({ where }),
    ]);
    return { dane, strona: s.strona, rozmiar: s.rozmiar, lacznie };
  }

  @Get('artykuly/:id')
  async artykul(@Param('id', ParseIntPipe) id: number, @Ja() ja?: Uzytkownik) {
    const a = await db.artykul.findUnique({ where: { id_artykulu: id }, include: autorzy });
    if (!a || (a.status !== 'OPUBLIKOWANY' && ja?.rola !== 'ADMIN' && a.id_autora !== ja?.id)) throw blad(404, 'Nie ma takiego artykułu');
    return a;
  }

  @Post('artykuly')
  @Role('ADMIN', 'INSTRUKTOR')
  utworz(@Body() body: unknown, @Ja() ja: Uzytkownik) {
    const d = waliduj(Artykul, body);
    return db.artykul.create({
      data: { id_kategorii_wiedzy: d.idKategorii, tytul: d.tytul, tresc_markdown: d.tresc, id_autora: ja.id, status: ja.rola === 'ADMIN' ? 'SZKIC' : 'PROPOZYCJA' },
    });
  }

  @Patch('artykuly/:id')
  @Role('ADMIN')
  async edytuj(@Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const d = waliduj(Artykul.partial().extend({ status: z.enum(['SZKIC', 'ARCHIWALNY']).optional() }), body);
    const a = await db.artykul.findUniqueOrThrow({ where: { id_artykulu: id } });
    const zmianaTresci = d.tresc !== undefined || d.tytul !== undefined;
    // Edycja opublikowanego artykułu to nowa wersja; asystent dostaje ją po przeindeksowaniu.
    const nowaWersja = a.status === 'OPUBLIKOWANY' && zmianaTresci && !d.status;
    const w = await db.artykul.update({
      where: { id_artykulu: id },
      data: {
        id_kategorii_wiedzy: d.idKategorii,
        tytul: d.tytul,
        tresc_markdown: d.tresc,
        status: d.status,
        data_modyfikacji: new Date(),
        ...(nowaWersja && { wersja: { increment: 1 } }),
      },
    });
    if (nowaWersja || (a.status === 'OPUBLIKOWANY' && d.status)) await zaplanujIndeksowanie(id);
    return w;
  }

  @Post('artykuly/:id/publikacja')
  @Role('ADMIN')
  async publikuj(@Param('id', ParseIntPipe) id: number, @Body() body: unknown, @Ja() ja: Uzytkownik) {
    const { idPytan } = waliduj(z.object({ idPytan: z.array(z.number().int()).default([]) }), body ?? {});
    const a = await db.artykul.findUniqueOrThrow({ where: { id_artykulu: id } });
    if (a.status === 'OPUBLIKOWANY') throw blad(409, 'Artykuł jest już opublikowany');
    const w = await db.artykul.update({
      where: { id_artykulu: id },
      data: {
        status: 'OPUBLIKOWANY',
        id_zatwierdzajacego: ja.id,
        data_publikacji: new Date(),
        data_modyfikacji: new Date(),
        ...(a.data_publikacji && { wersja: { increment: 1 } }),
      },
    });
    if (idPytan.length) await db.pytanie_bez_odpowiedzi.updateMany({ where: { id_pytania: { in: idPytan } }, data: { status: 'OBSLUZONE', id_artykulu: id } });
    await zaplanujIndeksowanie(id);
    return w;
  }
}

@Controller('admin/pytania-bez-odpowiedzi')
@Role('ADMIN')
export class PytaniaController {
  @Get()
  async lista(@Query() q: Record<string, string>) {
    const s = stronicuj(q);
    const where = { status: (q.status as any) ?? 'NOWE' };
    const [dane, lacznie] = await Promise.all([
      db.pytanie_bez_odpowiedzi.findMany({ where, include: { artykul: { select: { tytul: true } } }, orderBy: { data_utworzenia: 'desc' }, skip: s.skip, take: s.take }),
      db.pytanie_bez_odpowiedzi.count({ where }),
    ]);
    return { dane, strona: s.strona, rozmiar: s.rozmiar, lacznie };
  }

  @Patch(':id')
  zmien(@Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    const d = waliduj(z.object({ status: z.enum(['NOWE', 'OBSLUZONE', 'ODRZUCONE']), idArtykulu: z.number().int().nullable().optional() }), body);
    return db.pytanie_bez_odpowiedzi.update({ where: { id_pytania: id }, data: { status: d.status, id_artykulu: d.idArtykulu } });
  }
}

@Module({ controllers: [BazaWiedzyController, PytaniaController] })
export class BazaWiedzyModule {}
