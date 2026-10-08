import { lazy, Suspense } from 'react';
import { useRoute } from './router';
import HomePage from './pages/HomePage';
import PlayersPage from './pages/PlayersPage';
import PlayerEditPage from './pages/PlayerEditPage';
import RulesPage from './pages/RulesPage';
import RuleEditPage from './pages/RuleEditPage';
import MatchesPage from './pages/MatchesPage';
import NewMatchPage from './pages/NewMatchPage';
import MatchPage from './pages/MatchPage';
import SettingsPage from './pages/SettingsPage';
import StatsPage from './pages/StatsPage';
import LoginPage from './pages/LoginPage';
import UsersPage from './pages/UsersPage';
import ClubsPage from './pages/ClubsPage';
import PlayerStatsPage from './pages/PlayerStatsPage';
import { useSession } from './hooks';
import { isAdmin, UserContext, useUser } from './user';

const HelpPage = lazy(() => import('./pages/HelpPage'));
const PublicStatsPage = lazy(() => import('./pages/PublicStatsPage'));

const safeReturn = (value: string | null) => (value && /^\/[\w/-]*$/.test(value) ? value : null);

export default function App() {
  const session = useSession();
  const { segments } = useRoute();
  if (segments[0] === 'shared-stats') {
    return (
      <Suspense fallback={<main className="page" role="status">Loading stats...</main>}>
        <PublicStatsPage key={segments[1] ?? ''} token={segments[1] ?? ''} />
      </Suspense>
    );
  }
  if (segments[0] === 'help') {
    return (
      <Suspense fallback={<main className="page" role="status">Loading help...</main>}>
        <HelpPage />
      </Suspense>
    );
  }
  if (session === undefined) return null;
  if (!session) return <LoginPage />;
  return (
    <UserContext value={session.user}>
      <Routes />
    </UserContext>
  );
}

function Routes() {
  const user = useUser();
  const { segments, query } = useRoute();
  const [section, rawId, action] = segments;
  const id = rawId ? decodeURIComponent(rawId) : undefined;

  switch (section) {
    case 'players':
      if (id && action === 'stats') return <PlayerStatsPage id={id} />;
      return id ? <PlayerEditPage id={id} returnTo={safeReturn(query.get('return'))} /> : <PlayersPage />;
    case 'rules':
      return id ? <RuleEditPage id={id} copyFrom={query.get('from')} /> : <RulesPage />;
    case 'match':
      if (id === 'new') return <NewMatchPage />;
      if (id && action === 'edit') return <NewMatchPage id={id} />;
      if (id && action === 'stats') return <StatsPage id={id} />;
      return id ? <MatchPage id={id} /> : <MatchesPage />;
    case 'settings':
      return <SettingsPage />;
    case 'users':
      return isAdmin(user) ? <UsersPage /> : <HomePage />;
    case 'clubs':
      return isAdmin(user) ? <ClubsPage /> : <HomePage />;
    default:
      return <HomePage />;
  }
}
