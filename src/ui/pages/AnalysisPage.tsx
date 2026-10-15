import Header from '../components/Header';

export default function AnalysisPage() {
  return <>
    <Header title="Stats & Analysis" back="/" />
    <main className="page">
      <nav className="home-menu" aria-label="Stats and analysis">
        <a className="btn btn-big" href="#/stats/matches">Match stats</a>
        <a className="btn btn-big" href="#/stats/players">Player stats</a>
      </nav>
      <p className="muted">Player stats are available for System Players only.</p>
    </main>
  </>;
}
