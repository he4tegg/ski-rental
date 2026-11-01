import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, useAuth } from '../api';

export function Logowanie() {
  const { zaloguj } = useAuth();
  const nav = useNavigate();
  const [blad, setBlad] = useState('');
  const wyslij = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await zaloguj(String(f.get('email')), String(f.get('haslo')));
      nav('/');
    } catch (err) {
      setBlad((err as Error).message);
    }
  };
  return (
    <form onSubmit={wyslij} className="karta max-w-sm mx-auto space-y-3">
      <h1 className="text-xl font-semibold">Logowanie</h1>
      <label className="block"><span className="etykieta">E-mail</span><input name="email" type="email" required autoComplete="email" className="pole" /></label>
      <label className="block"><span className="etykieta">Hasło</span><input name="haslo" type="password" required autoComplete="current-password" className="pole" /></label>
      {blad && <p className="blad">{blad}</p>}
      <button className="btn w-full">Zaloguj</button>
      <p className="text-sm">Nie masz konta? <Link to="/rejestracja" className="underline">Załóż je</Link>.</p>
    </form>
  );
}

export function Rejestracja() {
  const [blad, setBlad] = useState('');
  const [ok, setOk] = useState('');
  const wyslij = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      setOk((await api('/auth/rejestracja', { method: 'POST', body: { ...f, telefon: f.telefon || undefined } })).komunikat);
      setBlad('');
    } catch (err) {
      setBlad((err as Error).message);
    }
  };
  if (ok) return <p className="ok max-w-sm mx-auto">{ok}</p>;
  return (
    <form onSubmit={wyslij} className="karta max-w-sm mx-auto space-y-3">
      <h1 className="text-xl font-semibold">Załóż konto</h1>
      <label className="block"><span className="etykieta">Imię</span><input name="imie" required className="pole" autoComplete="given-name" /></label>
      <label className="block"><span className="etykieta">Nazwisko</span><input name="nazwisko" required className="pole" autoComplete="family-name" /></label>
      <label className="block"><span className="etykieta">E-mail</span><input name="email" type="email" required className="pole" autoComplete="email" /></label>
      <label className="block"><span className="etykieta">Telefon (opcjonalnie)</span><input name="telefon" className="pole" autoComplete="tel" /></label>
      <label className="block"><span className="etykieta">Hasło (min. 8 znaków)</span><input name="haslo" type="password" minLength={8} required className="pole" autoComplete="new-password" /></label>
      {blad && <p className="blad">{blad}</p>}
      <button className="btn w-full">Załóż konto</button>
    </form>
  );
}

export function Potwierdz() {
  const [q] = useSearchParams();
  const [wynik, setWynik] = useState<{ ok: boolean; tekst: string } | null>(null);
  useEffect(() => {
    api('/auth/potwierdz', { method: 'POST', body: { token: q.get('token') ?? '' } })
      .then((d) => setWynik({ ok: true, tekst: d.komunikat }))
      .catch((e) => setWynik({ ok: false, tekst: e.message }));
  }, [q]);
  if (!wynik) return null;
  return (
    <div className="max-w-sm mx-auto space-y-3">
      <p className={wynik.ok ? 'ok' : 'blad'}>{wynik.tekst}</p>
      {wynik.ok && <Link to="/logowanie" className="btn">Przejdź do logowania</Link>}
    </div>
  );
}
