import { AppProvider, useApp } from '@/context/AppContext';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Projects from '@/pages/Projects';
import NewSurvey from '@/pages/NewSurvey';
import AIProcessing from '@/pages/AIProcessing';
import WebGIS from '@/pages/WebGIS';
import ConflictAnalysis from '@/pages/ConflictAnalysis';
import TopologyValidation from '@/pages/TopologyValidation';
import FieldVerification from '@/pages/FieldVerification';
import Reports from '@/pages/Reports';
import Settings from '@/pages/Settings';
import ArchitectureOutputs from '@/pages/ArchitectureOutputs';

function AppContent() {
  const { isAuthenticated, currentPage } = useApp();

  if (!isAuthenticated) {
    return <Login />;
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard': return <Dashboard />;
      case 'projects': return <Projects />;
      case 'new-survey': return <NewSurvey />;
      case 'ai-processing': return <AIProcessing />;
      case 'cadastral-map': return <WebGIS />;
      case 'conflicts': return <ConflictAnalysis />;
      case 'field-verification': return <FieldVerification />;
      case 'topology': return <TopologyValidation />;
      case 'reports': return <Reports />;
      case 'settings': return <Settings />;
      case 'outputs': return <ArchitectureOutputs />;
      default: return <Dashboard />;
    }
  };

  const isFullHeightPage = currentPage === 'cadastral-map';
  const showSidebar = currentPage !== 'cadastral-map';

  return (
    <div className="flex bg-slate-100 min-h-screen">
      {showSidebar && <Sidebar />}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className={isFullHeightPage ? 'flex-1 overflow-hidden' : 'flex-1 overflow-y-auto'}>
          {renderPage()}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
