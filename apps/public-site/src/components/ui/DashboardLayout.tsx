import React, { useState, useEffect } from 'react';
import { Menu, Maximize, Minimize } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface DashboardLayoutProps {
  children: React.ReactNode;
  sidebarContent: React.ReactNode;
  headerContent?: React.ReactNode;
  headerTitle?: React.ReactNode;
  
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
  
  // Admin sidebar uses motion and different state logic
  isSidebarOpen?: boolean;
  setIsSidebarOpen?: (open: boolean) => void;
  
  // Theme options to toggle between Client and Admin styles
  theme?: 'client' | 'admin';

  // Sidebar collapse & pin states for Client dashboard
  isSidebarCollapsed?: boolean;
  setIsSidebarCollapsed?: (collapsed: boolean) => void;
  isSidebarPinned?: boolean;
  setIsSidebarPinned?: (pinned: boolean) => void;
}

export function DashboardLayout({
  children,
  sidebarContent,
  headerContent,
  headerTitle,
  isMobileMenuOpen,
  setIsMobileMenuOpen,
  isSidebarOpen = true,
  setIsSidebarOpen,
  theme = 'client',
  isSidebarCollapsed = false,
  setIsSidebarCollapsed,
  isSidebarPinned = true,
  setIsSidebarPinned
}: DashboardLayoutProps) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    let resizeTimer: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        setIsMobile(window.innerWidth < 1024);
      }, 150);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimer);
    };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else if (document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn('Fullscreen failed:', err);
    }
  };

  const isClient = theme === 'client';
  const isAdmin = theme === 'admin';
  const isEffectiveExpanded = isSidebarPinned || !isSidebarCollapsed || isHovered;

  return (
    <div className={`flex h-screen font-sans ${isAdmin ? 'admin-dashboard-shell bg-[#f8fafc] overflow-hidden' : isClient ? 'bg-[#f8f7f5] overflow-hidden min-h-screen' : 'bg-neutral-100 overflow-hidden'}`}>
      
      {/* Mobile overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className={`fixed inset-0 z-40 backdrop-blur-sm lg:hidden ${isClient ? 'bg-black/40' : 'bg-black/60'}`}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      {isAdmin ? (
        <motion.aside
          initial={false}
          animate={{
            width: (isMobileMenuOpen || (isSidebarOpen && !isMobile)) ? 240 : 72,
            x: isMobileMenuOpen ? 0 : (isMobile ? -280 : 0)
          }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="admin-dashboard-sidebar fixed inset-y-0 left-0 z-50 flex flex-col lg:relative lg:translate-x-0"
          style={{ background: '#ffffff', borderRight: '1px solid #e7eaf0' }}
        >
          {sidebarContent}
        </motion.aside>
      ) : (
        <aside 
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-black/5 bg-[#fdfcfb] transition-all duration-300 ease-in-out lg:relative lg:translate-x-0 
            ${isMobileMenuOpen ? 'translate-x-0 w-[22rem] max-w-[calc(100vw-56px)]' : (isMobile ? '-translate-x-full w-[22rem] max-w-[calc(100vw-56px)]' : '')} 
            ${!isMobile ? (isEffectiveExpanded ? 'lg:w-80' : 'lg:w-20') : ''}
          `}
        >
          {sidebarContent}
        </aside>
      )}

      {/* Main Content */}
      <main id={!isAdmin ? "main-scroll-container" : undefined} className={isAdmin ? "flex-1 flex flex-col overflow-hidden" : "flex-1 overflow-y-auto"}>
        
        {/* Header */}
        {isAdmin ? (
          <header className="admin-dashboard-topbar shrink-0 h-[60px] bg-white flex items-center justify-between px-4 lg:px-7"
            style={{ borderBottom: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
          >
            <div className="flex items-center gap-4">
              <button
                onClick={() => isMobile ? setIsMobileMenuOpen(true) : setIsSidebarOpen?.(!isSidebarOpen)}
                className="rounded-xl bg-neutral-100 p-2.5 text-neutral-600 hover:bg-neutral-200 transition-all lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
              {headerTitle}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={toggleFullscreen}
                className="hidden sm:flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-black/5 transition-all hover:bg-black/5 hover:text-black text-neutral-500"
                title={isFullscreen ? "Sair da Tela Cheia" : "Tela Cheia"}
              >
                {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
              </button>
              {headerContent}
            </div>
          </header>
        ) : (
          <header className="sticky top-0 z-30 flex h-24 items-center justify-between bg-[#f8f7f5]/80 px-6 backdrop-blur-md lg:px-12">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => isMobile ? setIsMobileMenuOpen(true) : setIsSidebarCollapsed?.(!isSidebarCollapsed)}
                className="rounded-full bg-white p-2.5 shadow-sm ring-1 ring-black/5 transition-all hover:bg-black/5"
              >
                <Menu className="h-5 w-5 text-[#1a1a1a]" />
              </button>
              {headerTitle}
            </div>
            
            <div className="flex items-center gap-4">
              <button
                onClick={toggleFullscreen}
                className="group hidden sm:flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-all hover:bg-black/5"
                title={isFullscreen ? "Sair da Tela Cheia" : "Tela Cheia"}
              >
                {isFullscreen ? (
                  <Minimize className="h-5 w-5 text-[#1a1a1a]/60 group-hover:text-[#1a1a1a]" />
                ) : (
                  <Maximize className="h-5 w-5 text-[#1a1a1a]/60 group-hover:text-[#1a1a1a]" />
                )}
              </button>
              {headerContent}
            </div>
          </header>
        )}

        {/* Content Body */}
        {isAdmin ? (
          <div id="main-scroll-container" className="admin-dashboard-content flex-1 overflow-y-auto custom-scrollbar">
            {children}
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
