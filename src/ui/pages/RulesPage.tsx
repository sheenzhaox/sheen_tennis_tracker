import Header from '../components/Header';
import { useAllRuleSets } from '../hooks';
import { describeRules } from '../../model/rules';
import type { RuleSet } from '../../model/types';

export default function RulesPage() {
  const ruleSets = useAllRuleSets();
  const builtIn = ruleSets.filter((r) => r.builtIn);
  const custom = ruleSets.filter((r) => !r.builtIn);

  return (
    <>
      <Header title="Rules" back="/" action={<a href="#/rules/new">+ New</a>} />
      <main className="page">
        <h2>My rules</h2>
        {custom.length === 0 ? (
          <p className="muted">No custom rules yet. Create one or duplicate a standard rule set.</p>
        ) : (
          <RuleList items={custom} />
        )}
        <h2>Standard</h2>
        <RuleList items={builtIn} />
      </main>
    </>
  );
}

function RuleList({ items }: { items: RuleSet[] }) {
  return (
    <ul className="list">
      {items.map((r) => (
        <li key={r.id}>
          <a href={`#/rules/${encodeURIComponent(r.id)}`}>
            <strong>{r.name}</strong>
            <span className="muted">{describeRules(r.rules)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
