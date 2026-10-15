import Header from '../components/Header';
import { useAllRuleSets } from '../hooks';
import { describeRules } from '../../model/rules';
import type { RuleSet } from '../../model/types';
import { isAdmin, useUser } from '../user';

export default function RulesPage() {
  const admin = isAdmin(useUser());
  const ruleSets = useAllRuleSets();
  const builtIn = ruleSets.filter((r) => r.builtIn);
  const custom = ruleSets.filter((r) => !r.builtIn);

  return (
    <>
      <Header title="Rules" back="/" action={admin ? <a href="#/rules/new">+ New</a> : undefined} />
      <main className="page">
        <h2>Custom rules</h2>
        {custom.length === 0 ? (
          <p className="muted">{admin ? 'No custom rules yet. Create one or duplicate a standard rule set.' : 'No custom rules yet.'}</p>
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
