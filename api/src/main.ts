import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { uruchomProcesIndeksowania } from './baza-wiedzy/indeksowanie';

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

async function start() {
  if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') throw new Error('Ustaw JWT_SECRET');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.set('trust proxy', 1);
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('Wypożyczalnia i szkółka narciarska').setVersion('1').addBearerAuth().build()));
  uruchomProcesIndeksowania();
  await app.listen(Number(process.env.PORT ?? 3000));
}
start();
