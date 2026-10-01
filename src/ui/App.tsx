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

const safeReturn = (value: string | null) => (value && /^\/[\w/-]*$/.test(value) ? value : null);

export default function App() {
  const { segments, query } = useRoute();
  const [section, rawId] = segments;
  const id = rawId ? decodeURIComponent(rawId) : undefined;

  switch (section) {
    case 'players':
      return id ? <PlayerEditPage id={id} returnTo={safeReturn(query.get('return'))} /> : <PlayersPage />;
    case 'rules':
      return id ? <RuleEditPage id={id} copyFrom={query.get('from')} /> : <RulesPage />;
    case 'match':
      if (id === 'new') return <NewMatchPage />;
      return id ? <MatchPage id={id} /> : <MatchesPage />;
    case 'settings':
      return <SettingsPage />;
    default:
      return <HomePage />;
  }
}
