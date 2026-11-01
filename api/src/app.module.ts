import { Controller, Get, MiddlewareConsumer, Module, NestModule, Query } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { AsystentModule } from './asystent/asystent';
import { BazaWiedzyModule } from './baza-wiedzy/baza-wiedzy';
import { db, kontekst } from './db';
import { SprzetModule } from './sprzet/sprzet';
import { UzytkownicyModule } from './uzytkownicy/uzytkownicy';
import { WypozyczeniaModule } from './wypozyczenia/wypozyczenia';
import { DataISO, FiltrProblemow, Role, StraznikRol, stronicuj, waliduj } from './wspolne';
import { z } from 'zod';

@Controller()
class AudytController {
  @Get('admin/audyt')
  @Role('ADMIN')
  async dziennik(@Query() q: Record<string, string>) {
    const s = stronicuj(q);
    const { od, do: doDnia } = waliduj(z.object({ od: DataISO.optional(), do: DataISO.optional() }), q);
    const where: Prisma.wpis_audytuWhereInput = {
      ...(q.encja && { encja: q.encja }),
      ...((od || doDnia) && { znacznik_czasu: { gte: od, ...(doDnia && { lt: new Date(doDnia.getTime() + 864e5) }) } }),
    };
    const [dane, lacznie] = await Promise.all([
      db.wpis_audytu.findMany({ where, include: { uzytkownik: { select: { email: true } } }, orderBy: { id_wpisu: 'desc' }, skip: s.skip, take: s.take }),
      db.wpis_audytu.count({ where }),
    ]);
    return { dane, strona: s.strona, rozmiar: s.rozmiar, lacznie };
  }

  @Get('health')
  async health() {
    await db.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}

@Module({
  imports: [
    JwtModule.register({ global: true, secret: process.env.JWT_SECRET ?? 'tylko-do-developmentu' }),
    UzytkownicyModule,
    SprzetModule,
    WypozyczeniaModule,
    BazaWiedzyModule,
    AsystentModule,
  ],
  controllers: [AudytController],
  providers: [
    { provide: APP_GUARD, useClass: StraznikRol },
    { provide: APP_FILTER, useClass: FiltrProblemow },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply((req: any, _res: any, next: () => void) => kontekst.run({ ip: req.ip?.replace(/^::ffff:/, '') }, next)).forRoutes('*');
  }
}
