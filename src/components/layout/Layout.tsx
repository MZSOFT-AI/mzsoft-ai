import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { motion } from 'motion/react';

const Layout: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-100 flex">
      <Sidebar />
      <main className="flex-1 transition-all duration-300 ease-in-out pl-[260px]">
        <div className="p-6 min-h-screen">
           <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
