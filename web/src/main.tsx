import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth, type Rola } from './api';
import Czat from './Czat';
import './styl.css';
import Admin from './strony/Admin';
import { Artykul, BazaWiedzy } from './strony/BazaWiedzy';
import { Katalog, ModelSprzetu } from './strony/Katalog';
import Koszyk from './strony/Koszyk';
import { Logowanie, Potwierdz, Rejestracja } from './strony/Konto';
import Pracownik from './strony/Pracownik';
import { MojeRezerwacje, Profil } from './strony/Klient';

function Chronione({ role, children }: { role?: Rola[]; children: ReactNode }) {
  const { ja, gotowe } = useAuth();
  if (!gotowe) return null;
  if (!ja) return <Navigate to="/logowanie" replace />;
  if (role && ja.rola !== 'ADMIN' && !role.includes(ja.rola)) return <p>Brak dostępu.</p>;
  return children;
}

function Uklad() {
  const { ja, wyloguj } = useAuth();
  const link = ({ isActive }: { isActive: boolean }) => `px-2 py-1 rounded ${isActive ? 'bg-sky-100 text-sky-900' : 'hover:bg-slate-100'}`;
  return (
    <>
      <header className="bg-white border-b border-slate-200">
        <nav className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-2 text-sm">
          <Link to="/" className="font-bold text-sky-800 mr-4">⛷ Szkółka i wypożyczalnia</Link>
          <NavLink to="/" end className={link}>Sprzęt</NavLink>
          <NavLink to="/baza-wiedzy" className={link}>Baza wiedzy</NavLink>
          {ja?.rola === 'KLIENT' && <NavLink to="/koszyk" className={link}>Koszyk</NavLink>}
          {ja?.rola === 'KLIENT' && <NavLink to="/rezerwacje" className={link}>Moje rezerwacje</NavLink>}
          {(ja?.rola === 'PRACOWNIK' || ja?.rola === 'ADMIN') && <NavLink to="/pracownik" className={link}>Obsługa</NavLink>}
          {ja?.rola === 'ADMIN' && <NavLink to="/admin" className={link}>Administracja</NavLink>}
          <span className="ml-auto flex gap-2 items-center">
            {ja ? (
              <>
                <NavLink to="/profil" className={link}>{ja.imie}</NavLink>
                <button onClick={wyloguj} className="px-2 py-1 hover:underline">Wyloguj</button>
              </>
            ) : (
              <>
                <NavLink to="/logowanie" className={link}>Zaloguj</NavLink>
                <NavLink to="/rejestracja" className={link}>Załóż konto</NavLink>
              </>
            )}
          </span>
        </nav>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<Katalog />} />
          <Route path="/sprzet/:id" element={<ModelSprzetu />} />
          <Route path="/baza-wiedzy" element={<BazaWiedzy />} />
          <Route path="/baza-wiedzy/:id" element={<Artykul />} />
          <Route path="/logowanie" element={<Logowanie />} />
          <Route path="/rejestracja" element={<Rejestracja />} />
          <Route path="/potwierdz" element={<Potwierdz />} />
          <Route path="/koszyk" element={<Chronione role={['KLIENT']}><Koszyk /></Chronione>} />
          <Route path="/rezerwacje" element={<Chronione role={['KLIENT']}><MojeRezerwacje /></Chronione>} />
          <Route path="/profil" element={<Chronione><Profil /></Chronione>} />
          <Route path="/pracownik/*" element={<Chronione role={['PRACOWNIK']}><Pracownik /></Chronione>} />
          <Route path="/admin/*" element={<Chronione role={['ADMIN']}><Admin /></Chronione>} />
          <Route path="*" element={<p>Nie ma takiej strony.</p>} />
        </Routes>
      </main>
      <Czat />
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Uklad />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
