import { Queue, Worker } from 'bullmq';
import { db } from '../db';
import { DostawcaEmbeddingow, OllamaEmbeddingAdapter } from '../asystent/dostawcy';
import { podzielNaFragmenty } from './fragmenty';

export const embeddingi: DostawcaEmbeddingow = new OllamaEmbeddingAdapter();
const polaczenie = { host: process.env.REDIS_HOST ?? 'localhost', port: Number(process.env.REDIS_PORT ?? 6379) };
const kolejka = new Queue('indeksowanie', { connection: polaczenie });

// F-31: indeksowanie w tle, ponawiane do 3 razy z rosnącym odstępem.
export const zaplanujIndeksowanie = (idArtykulu: number) =>
  kolejka.add('artykul', { idArtykulu }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100 });

const wektor = (v: number[]) => `[${v.join(',')}]`;

export async function zindeksujArtykul(idArtykulu: number) {
  const a = await db.artykul.findUnique({ where: { id_artykulu: idArtykulu } });
  if (!a || a.status !== 'OPUBLIKOWANY') {
    await db.$executeRaw`DELETE FROM fragment_artykulu WHERE id_artykulu = ${idArtykulu}`;
    return 0;
  }
  const fragmenty = podzielNaFragmenty(a.tresc_markdown);
  // Tytuł w tekście do osadzenia poprawia trafność; w bazie zostaje sam fragment.
  const wektory = await embeddingi.osadz(fragmenty.map((f) => `${a.tytul}\n${f}`));
  await db.$transaction([
    db.$executeRaw`DELETE FROM fragment_artykulu WHERE id_artykulu = ${idArtykulu}`,
    ...fragmenty.map(
      (f, i) => db.$executeRaw`INSERT INTO fragment_artykulu (id_artykulu, numer, tresc, wektor) VALUES (${idArtykulu}, ${i + 1}, ${f}, ${wektor(wektory[i])}::vector)`,
    ),
  ]);
  return fragmenty.length;
}

export type Fragment = { id_fragmentu: number; id_artykulu: number; tytul: string; tresc: string; podobienstwo: number };

// Zapytanie z rozdziału 8.5: 5 najbliższych fragmentów opublikowanych artykułów.
export async function fragmentyOpublikowane(pytanie: string, ile = 5): Promise<Fragment[]> {
  const [v] = await embeddingi.osadz([pytanie]);
  return db.$queryRaw<Fragment[]>`
    SELECT f.id_fragmentu, a.id_artykulu, a.tytul, f.tresc, 1 - (f.wektor <=> ${wektor(v)}::vector) AS podobienstwo
    FROM fragment_artykulu f JOIN artykul a ON a.id_artykulu = f.id_artykulu
    WHERE a.status = 'OPUBLIKOWANY'
    ORDER BY f.wektor <=> ${wektor(v)}::vector
    LIMIT ${ile}`;
}

export function uruchomProcesIndeksowania() {
  const w = new Worker('indeksowanie', async (job) => zindeksujArtykul(job.data.idArtykulu), { connection: polaczenie });
  w.on('failed', (job, e) => console.error(`Indeksowanie artykułu ${job?.data.idArtykulu} nieudane (próba ${job?.attemptsMade}):`, e.message));
  return w;
}
