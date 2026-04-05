import React, { useState } from 'react';
import './App.css';
import { Dashboard } from './pages/Dashboard';
import { Targets } from './pages/Targets';

type Page = 'dashboard' | 'targets';

function getInitialPage(): Page {
  const hash = window.location.hash.replace('#', '').replace('/', '');
  return hash === 'targets' ? 'targets' : 'dashboard';
}

const App: React.FC = () => {
  const [page, setPage] = useState<Page>(getInitialPage);

  const navigate = (p: Page) => {
    window.location.hash = p === 'dashboard' ? '/' : `/${p}`;
    setPage(p);
  };

  return (
    <>
      <nav className="sa-nav">
        <span className="sa-nav-logo">🛡️ ShadowAudit</span>
        <ul className="sa-nav-links">
          <li>
            <button
              className={`sa-nav-link${page === 'dashboard' ? ' active' : ''}`}
              onClick={() => navigate('dashboard')}
            >
              Dashboard
            </button>
          </li>
          <li>
            <button
              className={`sa-nav-link${page === 'targets' ? ' active' : ''}`}
              onClick={() => navigate('targets')}
            >
              Targets
            </button>
          </li>
        </ul>
      </nav>
      <main className="sa-main">
        {page === 'dashboard' && <Dashboard />}
        {page === 'targets' && <Targets />}
      </main>
    </>
  );
};

export default App;
