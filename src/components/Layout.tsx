import { BookOpen, Camera, ClipboardList, Home, LineChart, Menu, MessageCircle, NotebookPen, Settings, Shield, ShoppingCart, Sprout, WifiOff } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Modal } from './ui';

export const NAV = [
  { to: '/', label: 'Início', icon: Home },
  { to: '/analisar', label: 'Analisar comida', icon: Camera },
  { to: '/diario', label: 'Diário', icon: NotebookPen },
  { to: '/plano', label: 'Plano alimentar', icon: ClipboardList },
  { to: '/receitas', label: 'Receitas', icon: BookOpen },
  { to: '/compras', label: 'Lista de compras', icon: ShoppingCart },
  { to: '/chat', label: 'Chat com IA', icon: MessageCircle },
  { to: '/progresso', label: 'Progresso', icon: LineChart },
  { to: '/perfil', label: 'Perfil e configurações', icon: Settings },
  { to: '/privacidade', label: 'Privacidade e dados', icon: Shield },
];

export function Brand({ small }: { small?: boolean }) {
  return (
    <span className="brand">
      <span className="brand-mark" aria-hidden><Sprout size={22} /></span>
      <span>Nutricionist AI{small ? null : <small>nutrição com IA</small>}</span>
    </span>
  );
}

function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function Layout() {
  const { user } = useApp();
  const [more, setMore] = useState(false);
  const loc = useLocation();
  const online = useOnline();
  useEffect(() => {
    setMore(false);
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  const bottom: { to: string; label: string; icon: ReactNode; fab?: boolean }[] = [
    { to: '/', label: 'Início', icon: <Home size={22} /> },
    { to: '/diario', label: 'Diário', icon: <NotebookPen size={22} /> },
    { to: '/analisar', label: 'Analisar', icon: <Camera size={26} />, fab: true },
    { to: '/plano', label: 'Plano', icon: <ClipboardList size={22} /> },
  ];

  return (
    <div className="app-shell">
      <a href="#conteudo" className="sr-only">Pular para o conteúdo</a>
      <aside className="sidebar" aria-label="Menu principal">
        <NavLink to="/" style={{ textDecoration: 'none' }}><Brand /></NavLink>
        <nav>
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <Icon size={20} aria-hidden />{label}
            </NavLink>
          ))}
        </nav>
        <div className="card flat mt small" style={{ padding: 12 }}>
          <div className="strong truncate">{user?.name}</div>
          <div className="tiny muted truncate">{user?.email}</div>
          <div className="tiny muted mt-sm">Conta local — dados salvos só neste dispositivo.</div>
        </div>
      </aside>

      <main className="main" id="conteudo">
        {!online ? (
          <div className="alert warning" style={{ borderRadius: 0, justifyContent: 'center' }} role="status">
            <WifiOff size={18} /> <span className="alert-body small">Você está offline. Diário, histórico e receitas continuam funcionando; a IA e a consulta de rótulos precisam de internet.</span>
          </div>
        ) : null}
        <Outlet />
      </main>

      <nav className="bottom-nav" aria-label="Navegação inferior">
        {bottom.map((b) => (
          <NavLink key={b.to} to={b.to} end={b.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')} aria-label={b.label}>
            {b.fab ? <span className="fab">{b.icon}</span> : b.icon}
            <span>{b.label}</span>
          </NavLink>
        ))}
        <button type="button" onClick={() => setMore(true)} aria-haspopup="dialog"><Menu size={22} /><span>Mais</span></button>
      </nav>

      <Modal open={more} onClose={() => setMore(false)} title="Mais opções">
        <div className="options two">
          {NAV.filter((n) => !['/', '/diario', '/analisar', '/plano'].includes(n.to)).map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className="option" style={{ textDecoration: 'none', color: 'var(--text)' }}>
              <Icon size={22} color="var(--primary)" aria-hidden /> {label}
            </NavLink>
          ))}
        </div>
      </Modal>
    </div>
  );
}
