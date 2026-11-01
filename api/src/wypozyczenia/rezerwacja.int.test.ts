// Test współbieżności na działającym API: API_URL=http://localhost:3000 npx vitest run src/wypozyczenia
import { describe, expect, it } from 'vitest';

const API = process.env.API_URL;
const HASLO = process.env.SEED_HASLO ?? 'Haslo123!';

async function zaloguj(email: string) {
  const r = await fetch(`${API}/api/v1/auth/logowanie`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, haslo: HASLO }) });
  return { 'content-type': 'application/json', authorization: `Bearer ${(await r.json()).accessToken}` };
}

describe.skipIf(!API)('rezerwacje równoległe', () => {
  it('pięć równoczesnych rezerwacji ostatniego egzemplarza: przechodzi dokładnie jedna', async () => {
    const admin = await zaloguj('admin@npi.local');
    const klient = await zaloguj('klient@npi.local');
    const kod = `TEST-${Date.now()}`;
    const model = await (await fetch(`${API}/api/v1/sprzet/modele`, { method: 'POST', headers: admin, body: JSON.stringify({ id_kategorii: 5, producent: 'Test', nazwa: kod, cena_za_dzien: 1 }) })).json();
    await fetch(`${API}/api/v1/sprzet/egzemplarze`, { method: 'POST', headers: admin, body: JSON.stringify({ id_modelu: model.id_modelu, kod_inwentarzowy: kod }) });

    const termin = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    const odpowiedzi = await Promise.all(
      Array.from({ length: 5 }, () =>
        fetch(`${API}/api/v1/rezerwacje-sprzetu`, { method: 'POST', headers: klient, body: JSON.stringify({ dataOd: termin, dataDo: termin, pozycje: [{ idModelu: model.id_modelu }] }) }),
      ),
    );
    const statusy = odpowiedzi.map((r) => r.status).sort();
    expect(statusy).toEqual([201, 409, 409, 409, 409]);

    await fetch(`${API}/api/v1/sprzet/modele/${model.id_modelu}`, { method: 'PATCH', headers: admin, body: JSON.stringify({ aktywny: false }) });
  });
});
