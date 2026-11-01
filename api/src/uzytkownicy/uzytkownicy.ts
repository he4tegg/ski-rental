import { createHash, randomBytes } from 'node:crypto';
import { Body, Controller, Get, Module, Param, ParseIntPipe, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import type { Request, Response } from 'express';
import { createTransport } from 'nodemailer';
import { z } from 'zod';
import { db } from '../db';
import { Ja, Role, Uzytkownik, Zalogowany, blad, stronicuj, waliduj } from '../wspolne';

const poczta = createTransport({ host: process.env.SMTP_HOST ?? 'localhost', port: Number(process.env.SMTP_PORT ?? 1025) });
const WEB_URL = process.env.WEB_URL ?? 'http://localhost:8088';
const DNI_ODSWIEZANIA = 7;
const sha = (t: string) => createHash('sha256').update(t).digest('hex');

const Rejestracja = z.object({
  email: z.email().max(255).transform((e) => e.toLowerCase()),
  haslo: z.string().min(8).max(200),
  imie: z.string().trim().min(1).max(80),
  nazwisko: z.string().trim().min(1).max(80),
  telefon: z.string().trim().max(20).optional(),
});
const Profil = z.object({
  imie: z.string().trim().min(1).max(80).optional(),
  nazwisko: z.string().trim().min(1).max(80).optional(),
  telefon: z.string().trim().max(20).nullable().optional(),
  profil: z
    .object({
      wzrost_cm: z.number().int().min(80).max(230).nullable().optional(),
      waga_kg: z.number().min(15).max(200).nullable().optional(),
      rozmiar_buta_eu: z.number().min(15).max(55).nullable().optional(),
      poziom_jazdy: z.enum(['POCZATKUJACY', 'SREDNIOZAAWANSOWANY', 'ZAAWANSOWANY']).optional(),
    })
    .optional(),
});

const publiczne = { id_uzytkownika: true, email: true, imie: true, nazwisko: true, telefon: true, rola: true, aktywny: true, email_potwierdzony: true, data_utworzenia: true } as const;

@Controller('auth')
export class AuthController {
  constructor(private jwt: JwtService) {}

  @Post('rejestracja')
  async rejestracja(@Body() body: unknown) {
    const d = waliduj(Rejestracja, body);
    if (await db.uzytkownik.findUnique({ where: { email: d.email } })) throw blad(409, 'Konto z tym adresem e-mail już istnieje');
    const u = await db.uzytkownik.create({
      data: { email: d.email, haslo_hash: await argon2.hash(d.haslo), imie: d.imie, nazwisko: d.nazwisko, telefon: d.telefon, profil_klienta: { create: {} } },
    });
    const token = this.jwt.sign({ sub: u.id_uzytkownika, cel: 'potwierdzenie' }, { expiresIn: '24h' });
    await poczta.sendMail({
      from: 'Wypożyczalnia <no-reply@npi.local>',
      to: u.email,
      subject: 'Potwierdź adres e-mail',
      text: `Cześć ${u.imie}!\n\nPotwierdź konto, otwierając link:\n${WEB_URL}/potwierdz?token=${token}\n\nLink jest ważny 24 godziny.`,
    });
    return { komunikat: 'Konto utworzone. Sprawdź skrzynkę e-mail i potwierdź adres.' };
  }

  @Post('potwierdz')
  async potwierdz(@Body() body: unknown) {
    const { token } = waliduj(z.object({ token: z.string() }), body);
    let p: any;
    try {
      p = this.jwt.verify(token);
    } catch {
      throw blad(400, 'Link wygasł lub jest nieprawidłowy');
    }
    if (p.cel !== 'potwierdzenie') throw blad(400, 'Nieprawidłowy token');
    await db.uzytkownik.update({ where: { id_uzytkownika: p.sub }, data: { email_potwierdzony: true } });
    return { komunikat: 'Adres e-mail potwierdzony. Możesz się zalogować.' };
  }

  @Post('logowanie')
  async logowanie(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const d = waliduj(z.object({ email: z.string().transform((e) => e.toLowerCase()), haslo: z.string() }), body);
    const u = await db.uzytkownik.findUnique({ where: { email: d.email } });
    if (!u || !(await argon2.verify(u.haslo_hash, d.haslo))) throw blad(401, 'Nieprawidłowy e-mail lub hasło');
    if (!u.aktywny) throw blad(403, 'Konto jest zablokowane');
    if (!u.email_potwierdzony) throw blad(403, 'Najpierw potwierdź adres e-mail (link w wiadomości po rejestracji)');
    return this.wydajTokeny(u.id_uzytkownika, res);
  }

  @Post('odswiez')
  async odswiez(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const stary = req.cookies?.odswiez;
    const t = stary && (await db.token_odswiezania.findUnique({ where: { token_hash: sha(stary) }, include: { uzytkownik: true } }));
    if (!t || t.uniewazniony || t.wygasa < new Date() || !t.uzytkownik.aktywny) throw blad(401, 'Sesja wygasła, zaloguj się ponownie');
    await db.token_odswiezania.update({ where: { id_tokenu: t.id_tokenu }, data: { uniewazniony: true } });
    return this.wydajTokeny(t.id_uzytkownika, res);
  }

  @Post('wyloguj')
  async wyloguj(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const t = req.cookies?.odswiez;
    if (t) await db.token_odswiezania.updateMany({ where: { token_hash: sha(t) }, data: { uniewazniony: true } });
    res.clearCookie('odswiez', { path: '/api/v1/auth' });
    return { komunikat: 'Wylogowano' };
  }

  private async wydajTokeny(id: number, res: Response) {
    const u = await db.uzytkownik.findUniqueOrThrow({ where: { id_uzytkownika: id }, select: publiczne });
    const odswiez = randomBytes(32).toString('base64url');
    const wygasa = new Date(Date.now() + DNI_ODSWIEZANIA * 864e5);
    await db.token_odswiezania.create({ data: { id_uzytkownika: id, token_hash: sha(odswiez), wygasa } });
    res.cookie('odswiez', odswiez, { httpOnly: true, sameSite: 'strict', secure: process.env.COOKIE_SECURE === 'true', path: '/api/v1/auth', expires: wygasa });
    return { accessToken: this.jwt.sign({ sub: id, rola: u.rola, cel: 'dostep' }, { expiresIn: '15m' }), uzytkownik: u };
  }
}

@Controller()
export class UzytkownicyController {
  @Get('uzytkownicy/me')
  @Zalogowany()
  async ja(@Ja() ja: Uzytkownik) {
    return db.uzytkownik.findUniqueOrThrow({ where: { id_uzytkownika: ja.id }, select: { ...publiczne, profil_klienta: true } });
  }

  @Patch('uzytkownicy/me')
  @Zalogowany()
  async edytuj(@Ja() ja: Uzytkownik, @Body() body: unknown) {
    const { profil, ...dane } = waliduj(Profil, body);
    await db.uzytkownik.update({ where: { id_uzytkownika: ja.id }, data: dane });
    if (profil) await db.profil_klienta.upsert({ where: { id_klienta: ja.id }, create: { id_klienta: ja.id, ...profil }, update: profil });
    return this.ja(ja);
  }

  @Get('admin/uzytkownicy')
  @Role('ADMIN')
  async lista(@Query() q: Record<string, string>) {
    const s = stronicuj(q);
    const where = {
      ...(q.rola && { rola: q.rola as any }),
      ...(q.szukaj && { OR: ['email', 'nazwisko', 'imie', 'telefon'].map((p) => ({ [p]: { contains: q.szukaj, mode: 'insensitive' } })) }),
    };
    const [dane, lacznie] = await Promise.all([
      db.uzytkownik.findMany({ where, select: publiczne, orderBy: { id_uzytkownika: 'asc' }, skip: s.skip, take: s.take }),
      db.uzytkownik.count({ where }),
    ]);
    return { dane, strona: s.strona, rozmiar: s.rozmiar, lacznie };
  }

  @Patch('admin/uzytkownicy/:id')
  @Role('ADMIN')
  async zmien(@Param('id', ParseIntPipe) id: number, @Body() body: unknown, @Ja() ja: Uzytkownik) {
    const d = waliduj(z.object({ rola: z.enum(['KLIENT', 'INSTRUKTOR', 'PRACOWNIK', 'ADMIN']).optional(), aktywny: z.boolean().optional() }), body);
    if (id === ja.id && (d.aktywny === false || (d.rola && d.rola !== 'ADMIN'))) throw blad(400, 'Nie możesz zablokować ani zdegradować własnego konta');
    const u = await db.uzytkownik.update({ where: { id_uzytkownika: id }, data: d, select: publiczne });
    if (d.aktywny === false || d.rola) await db.token_odswiezania.updateMany({ where: { id_uzytkownika: id }, data: { uniewazniony: true } });
    return u;
  }
}

@Module({ controllers: [AuthController, UzytkownicyController] })
export class UzytkownicyModule {}
