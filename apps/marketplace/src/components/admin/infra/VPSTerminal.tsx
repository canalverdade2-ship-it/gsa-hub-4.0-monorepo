import { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { Power, Terminal as TerminalIcon } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { toast } from 'react-hot-toast';

export function VPSTerminal() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const xtermRef = useRef<Terminal | null>(null);

  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (xtermRef.current) xtermRef.current.dispose();
    };
  }, []);

  const connect = async () => {
    if (!terminalRef.current) return;
    setConnecting(true);
    
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Sessão expirada');

      const functionUrl = import.meta.env.VITE_SUPABASE_URL 
        ? import.meta.env.VITE_SUPABASE_URL.replace('http', 'ws') + '/functions/v1/ssh-proxy' 
        : 'ws://localhost:54321/functions/v1/ssh-proxy';
        
      const ws = new WebSocket(`${functionUrl}?token=${token}`);
      wsRef.current = ws;

      const term = new Terminal({
        cursorBlink: true,
        theme: {
          background: '#0a0a0a',
          foreground: '#f3f4f6',
          cursor: '#10b981',
          black: '#000000',
          red: '#ef4444',
          green: '#10b981',
          yellow: '#f59e0b',
          blue: '#3b82f6',
          magenta: '#8b5cf6',
          cyan: '#06b6d4',
          white: '#ffffff',
        },
        fontFamily: 'monospace',
      });
      
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(terminalRef.current);
      fitAddon.fit();
      xtermRef.current = term;

      ws.onopen = () => {
        setConnected(true);
        setConnecting(false);
        term.writeln('\x1b[1;32mConexão estabelecida com a Oracle VPS (Proxy Edge SSH)...\x1b[0m');
      };

      ws.onmessage = (event) => {
        term.write(event.data);
      };

      ws.onclose = () => {
        setConnected(false);
        term.writeln('\x1b[1;31m\nConexão encerrada.\x1b[0m');
      };

      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      });

      const handleResize = () => fitAddon.fit();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
      
    } catch (e: any) {
      toast.error('Erro ao conectar: ' + e.message);
      setConnecting(false);
    }
  };

  const disconnect = () => {
    if (wsRef.current) wsRef.current.close();
    setConnected(false);
  };

  return (
    <div className="flex flex-col bg-neutral-950 rounded-2xl overflow-hidden border border-neutral-800 shadow-2xl">
      <div className="flex justify-between items-center bg-neutral-900 px-4 py-3 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <TerminalIcon className="text-emerald-500 w-4 h-4" />
          <span className="text-white text-xs font-bold uppercase tracking-widest">Acesso Root (Oracle Linux)</span>
          {connected ? (
            <span className="ml-2 flex items-center gap-1 text-[10px] text-emerald-400 font-mono"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> CONECTADO</span>
          ) : (
            <span className="ml-2 flex items-center gap-1 text-[10px] text-red-400 font-mono"><span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> OFFLINE</span>
          )}
        </div>
        <div>
          {!connected ? (
            <button disabled={connecting} onClick={() => void connect()} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold transition-colors disabled:opacity-50">
              {connecting ? 'CONECTANDO...' : 'INICIAR SESSÃO'}
            </button>
          ) : (
            <button onClick={disconnect} className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded text-xs font-bold flex items-center gap-1 transition-colors">
              <Power className="w-3 h-3" /> DESCONECTAR
            </button>
          )}
        </div>
      </div>
      <div className="p-2 h-[400px]" ref={terminalRef}>
        {!connected && !connecting && (
          <div className="flex h-full items-center justify-center text-neutral-600 font-mono text-sm">
            Clique em "Iniciar Sessão" para abrir o terminal SSH.
          </div>
        )}
      </div>
    </div>
  );
}
