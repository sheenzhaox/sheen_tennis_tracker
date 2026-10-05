import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Header from '../components/Header';
import { db, deleteRecord, isLive, newId, saveRecord } from '../../storage/db';
import { BUILT_IN_RULE_SETS, DEFAULT_RULES, describeRules, validateRules } from '../../model/rules';
import type { FinalSetFormat, RuleSet, Rules } from '../../model/types';
import { navigate } from '../router';
import { isAdmin, useUser } from '../user';

interface Props {
  id: string;
  copyFrom: string | null;
}

async function findRuleSet(id: string): Promise<RuleSet | null> {
  const builtIn = BUILT_IN_RULE_SETS.find((r) => r.id === id);
  if (builtIn) return builtIn;
  const custom = await db.ruleSets.get(id);
  return isLive(custom) ? custom : null;
}

export default function RuleEditPage({ id, copyFrom }: Props) {
  const admin = isAdmin(useUser());
  const isNew = id === 'new';
  const [newRuleId] = useState(newId);
  const source = useLiveQuery(() => findRuleSet(isNew ? (copyFrom ?? '') : id), [id, copyFrom]);

  if (source === undefined) return null;
  if ((!isNew && source === null) || (isNew && !admin)) {
    return (
      <>
        <Header title="Rules" back="/rules" />
        <main className="page">
          <p>{isNew ? 'Only the admin can create rules.' : 'Rule set not found.'}</p>
        </main>
      </>
    );
  }

  if (!isNew && (source?.builtIn || !admin)) return <ReadOnlyView ruleSet={source!} canDuplicate={admin} />;

  const initial: RuleSet = isNew
    ? {
        id: newRuleId,
        name: source ? `${source.name} (copy)` : '',
        rules: source?.rules ?? DEFAULT_RULES,
        builtIn: false,
      }
    : source!;
  return <RuleForm key={initial.id} initial={initial} isNew={isNew} />;
}

function ReadOnlyView({ ruleSet, canDuplicate }: { ruleSet: RuleSet; canDuplicate: boolean }) {
  return (
    <>
      <Header title={ruleSet.name} back="/rules" />
      <main className="page">
        <p>{describeRules(ruleSet.rules)}</p>
        {canDuplicate ? (
          <>
            <p className="muted">Standard rule sets can't be edited. Duplicate to customise.</p>
            <a className="btn btn-primary" href={`#/rules/new?from=${encodeURIComponent(ruleSet.id)}`}>
              Duplicate
            </a>
          </>
        ) : (
          <p className="muted">Rules are managed by the admin.</p>
        )}
      </main>
    </>
  );
}

function RuleForm({ initial, isNew }: { initial: RuleSet; isNew: boolean }) {
  const [name, setName] = useState(initial.name);
  const [rules, setRules] = useState<Rules>(initial.rules);
  const [errors, setErrors] = useState<string[]>([]);

  const set = <K extends keyof Rules>(key: K, value: Rules[K]) => setRules((r) => ({ ...r, [key]: value }));
  const num = (v: string) => Number(v);

  async function save(e: FormEvent) {
    e.preventDefault();
    const errs = validateRules(rules);
    if (!name.trim()) errs.unshift('Name is required.');
    setErrors(errs);
    if (errs.length) return;
    const now = Date.now();
    await saveRecord('ruleSets', {
      ...initial,
      name: name.trim(),
      rules,
      createdAt: initial.createdAt ?? now,
    });
    navigate('/rules');
  }

  async function remove() {
    if (!confirm(`Delete "${initial.name}"? Matches already played keep their own copy of the rules.`)) return;
    await deleteRecord('ruleSets', initial.id);
    navigate('/rules');
  }

  return (
    <>
      <Header title={isNew ? 'New rules' : 'Edit rules'} back="/rules" />
      <main className="page">
        <form className="form" onSubmit={save}>
          <label>
            Name *
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Match format
            <select value={rules.bestOf} onChange={(e) => set('bestOf', num(e.target.value) as Rules['bestOf'])}>
              <option value={1}>One set</option>
              <option value={3}>Best of 3 sets</option>
              <option value={5}>Best of 5 sets</option>
            </select>
          </label>
          <label>
            Games to win a set
            <input
              type="number"
              inputMode="numeric"
              value={rules.gamesPerSet}
              onChange={(e) => {
                const games = num(e.target.value);
                setRules((r) => ({ ...r, gamesPerSet: games, tiebreakAt: r.tiebreakAt === null ? null : games }));
              }}
            />
          </label>
          <label>
            Tiebreak
            <select
              value={rules.tiebreakAt ?? 'none'}
              onChange={(e) => set('tiebreakAt', e.target.value === 'none' ? null : num(e.target.value))}
            >
              <option value={rules.gamesPerSet}>
                At {rules.gamesPerSet}-{rules.gamesPerSet}
              </option>
              <option value={rules.gamesPerSet - 1}>
                At {rules.gamesPerSet - 1}-{rules.gamesPerSet - 1}
              </option>
              <option value="none">No tiebreak (win by 2 games)</option>
            </select>
          </label>
          {rules.tiebreakAt !== null && (
            <label>
              Tiebreak to (points)
              <input
                type="number"
                inputMode="numeric"
                value={rules.tiebreakPoints}
                onChange={(e) => set('tiebreakPoints', num(e.target.value))}
              />
            </label>
          )}
          <label className="checkbox">
            <input type="checkbox" checked={rules.noAd} onChange={(e) => set('noAd', e.target.checked)} />
            No-ad scoring (deciding point at deuce)
          </label>
          <label>
            Deciding set
            <select value={rules.finalSet} onChange={(e) => set('finalSet', e.target.value as FinalSetFormat)}>
              <option value="regular">Regular set</option>
              <option value="matchTiebreak">Match tiebreak instead of set</option>
              <option value="noTiebreak">No tiebreak (win by 2 games)</option>
            </select>
          </label>
          {rules.finalSet === 'regular' && rules.tiebreakAt !== null && (
            <label>
              Deciding-set tiebreak to (points)
              <input
                type="number"
                inputMode="numeric"
                value={rules.finalSetTiebreakPoints}
                onChange={(e) => set('finalSetTiebreakPoints', num(e.target.value))}
              />
            </label>
          )}
          {rules.finalSet === 'matchTiebreak' && (
            <label>
              Match tiebreak to (points)
              <input
                type="number"
                inputMode="numeric"
                value={rules.matchTiebreakPoints}
                onChange={(e) => set('matchTiebreakPoints', num(e.target.value))}
              />
            </label>
          )}
          <p className="muted">{describeRules(rules)}</p>
          {errors.map((err) => (
            <p key={err} className="error">
              {err}
            </p>
          ))}
          <button className="btn btn-primary" type="submit">
            Save
          </button>
          {!isNew && (
            <button className="btn btn-danger" type="button" onClick={remove}>
              Delete rules
            </button>
          )}
        </form>
      </main>
    </>
  );
}
