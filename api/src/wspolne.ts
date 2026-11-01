import {
  ArgumentsHost, BadRequestException, CanActivate, Catch, ExceptionFilter, ExecutionContext,
  HttpException, Injectable, SetMetadata, createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Prisma, rola_uzytkownika } from '@prisma/client';
import { z } from 'zod';
import { kontekst } from './db';

export type Uzytkownik = { id: number; rola: rola_uzytkownika };

// Walidacja wejścia (Zod) na granicy API.
export function waliduj<T extends z.ZodType>(schemat: T, dane: unknown): z.infer<T> {
  const w = schemat.safeParse(dane);
  if (!w.success) throw new BadRequestException(w.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  return w.data;
}

export const Stronicowanie = z.object({
  strona: z.coerce.number().int().min(1).default(1),
  rozmiar: z.coerce.number().int().min(1).max(100).default(20),
});
export const stronicuj = (q: unknown) => {
  const { strona, rozmiar } = waliduj(Stronicowanie, q);
  return { strona, rozmiar, skip: (strona - 1) * rozmiar, take: rozmiar };
};

// RBAC: @Role(...) wymaga jednej z ról (ADMIN przechodzi zawsze), @Zalogowany() dowolnego konta.
export const Role = (...role: rola_uzytkownika[]) => SetMetadata('role', role);
export const Zalogowany = () => SetMetadata('role', []);
export const Ja = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().uzytkownik as Uzytkownik | undefined);

@Injectable()
export class StraznikRol implements CanActivate {
  constructor(private reflector: Reflector, private jwt: JwtService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (token) {
      try {
        const p = this.jwt.verify(token);
        if (p.cel === 'dostep') req.uzytkownik = { id: p.sub, rola: p.rola };
      } catch {
        throw new HttpException('Token wygasł lub jest nieprawidłowy', 401);
      }
    }
    const ctxStore = kontekst.getStore();
    if (ctxStore && req.uzytkownik) ctxStore.idUzytkownika = req.uzytkownik.id;

    const role = this.reflector.getAllAndOverride<rola_uzytkownika[] | undefined>('role', [ctx.getHandler(), ctx.getClass()]);
    if (role === undefined) return true;
    if (!req.uzytkownik) throw new HttpException('Wymagane logowanie', 401);
    if (role.length && req.uzytkownik.rola !== 'ADMIN' && !role.includes(req.uzytkownik.rola)) throw new HttpException('Brak uprawnień', 403);
    return true;
  }
}

// Błędy w formacie RFC 7807 (application/problem+json).
@Catch()
export class FiltrProblemow implements ExceptionFilter {
  catch(e: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    let status = 500;
    let detail = 'Wewnętrzny błąd serwera';
    if (e instanceof HttpException) {
      status = e.getStatus();
      const r = e.getResponse() as any;
      detail = typeof r === 'string' ? r : Array.isArray(r.message) ? r.message.join('; ') : r.message ?? e.message;
    } else if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      status = 409;
      detail = 'Taki rekord już istnieje';
    } else if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      status = 404;
      detail = 'Nie znaleziono';
    } else {
      console.error(e);
    }
    if (res.headersSent) return res.end();
    res.status(status).type('application/problem+json').json({ type: 'about:blank', title: tytulBledu(status), status, detail });
  }
}

const tytulBledu = (s: number) =>
  ({ 400: 'Błędne dane', 401: 'Brak uwierzytelnienia', 403: 'Brak uprawnień', 404: 'Nie znaleziono', 409: 'Konflikt', 429: 'Przekroczony limit' } as Record<number, string>)[s] ?? 'Błąd';

export const blad = (status: number, detail: string) => new HttpException(detail, status);

export const dzisiaj = () => new Date(new Date().toISOString().slice(0, 10));
export const DataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((s) => new Date(s));
