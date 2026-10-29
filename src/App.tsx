import { Sprout } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AppProvider, useApp } from './context/AppContext';
import { ToastProvider } from './context/ToastContext';
import { AnalyzePage } from './pages/Analyze';
import { ForgotPasswordPage, LoginPage, RegisterPage } from './pages/Auth';
import { ChatPage } from './pages/Chat';
import { DashboardPage } from './pages/Dashboard';
import { DiaryPage } from './pages/Diary';
import { PlanPage } from './pages/Plan';
import { PrivacyPage, PublicPolicyPage } from './pages/Privacy';
import { ProfileResultPage } from './pages/ProfileResult';
import { ProgressPage } from './pages/Progress';
import { QuestionnairePage } from './pages/Questionnaire';
import { RecipesPage } from './pages/Recipes';
import { SettingsPage } from './pages/Settings';
import { ShoppingPage } from './pages/Shopping';

export function Splash() {
  return (
    <div className="splash" role="status" aria-label="Carregando Nutricionist AI">
      <div className="stack logo" style={{ alignItems: 'center', textAlign: 'center' }}>
        <span className="brand-mark" style={{ width: 84, height: 84, borderRadius: 26, background: 'rgba(255,255,255,.15)' }}><Sprout size={46} /></span>
        <h1 style={{ color: '#fff', fontSize: '2rem' }}>Nutricionist AI</h1>
        <p style={{ color: 'rgba(255,255,255,.8)' }}>Nutrição com inteligência, no seu ritmo.</p>
      </div>
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, questionnaire } = useApp();
  const loc = useLocation();
  if (!user) return <Navigate to="/login" replace />;
  const free = ['/questionario', '/privacidade', '/perfil'];
  if (!questionnaire?.completed && !free.includes(loc.pathname)) return <Navigate to="/questionario" replace />;
  return <>{children}</>;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { user } = useApp();
  return user ? <Navigate to="/" replace /> : <>{children}</>;
}

function AppRoutes() {
  const { loading } = useApp();
  const [minDelay, setMinDelay] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setMinDelay(false), 700);
    return () => clearTimeout(t);
  }, []);
  if (loading || minDelay) return <Splash />;
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
      <Route path="/cadastro" element={<PublicOnly><RegisterPage /></PublicOnly>} />
      <Route path="/recuperar-senha" element={<PublicOnly><ForgotPasswordPage /></PublicOnly>} />
      <Route path="/termos" element={<PublicPolicyPage />} />
      <Route path="/questionario" element={<RequireAuth><QuestionnairePage /></RequireAuth>} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="/perfil-nutricional" element={<ProfileResultPage />} />
        <Route path="/analisar" element={<AnalyzePage />} />
        <Route path="/diario" element={<DiaryPage />} />
        <Route path="/plano" element={<PlanPage />} />
        <Route path="/receitas" element={<RecipesPage />} />
        <Route path="/compras" element={<ShoppingPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/progresso" element={<ProgressPage />} />
        <Route path="/perfil" element={<SettingsPage />} />
        <Route path="/privacidade" element={<PrivacyPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppProvider>
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </AppProvider>
    </ToastProvider>
  );
}
