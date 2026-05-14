import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { motion } from 'motion/react';
import { useSession } from '../../context/SessionContext';
import StartSessionModal from '../StartSessionModal';

const Layout: React.FC = () => {
  const { activeSession, loading } = useSession();
  const location = useLocation();

  // Pages that require an active session
  const sessionPages = ['/pos'];
  const needsSession = sessionPages.includes(location.pathname);

  return (
    <div className="min-h-screen bg-slate-100 flex">
      <Sidebar />
      <main className="flex-1 transition-all duration-300 ease-in-out pl-[260px]">
        <div className="p-6 min-h-screen">
           <Outlet />
        </div>
      </main>
      <StartSessionModal isOpen={!loading && !activeSession && needsSession} />
    </div>
  );
};

export default Layout;
