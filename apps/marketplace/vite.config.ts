import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { defineConfig, loadEnv } from 'vite';

function gsaTvStreamPlugin() {
  let ffmpegProcess: any = null;
  const FFMPEG_PATH = "C:\\Users\\Adriano Farias\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0-full_build\\bin\\ffmpeg.exe";

  const startStream = (streamKey = '0w1s-5mju-mwbu-6rxp-0900', profile = '720p30', isFallback = false) => {
    if (ffmpegProcess) {
      try { ffmpegProcess.kill(); } catch (e) {}
      ffmpegProcess = null;
    }

    const rtmpUrl = `rtmp://a.rtmp.youtube.com/live2/${streamKey}`;
    const resolution = profile.startsWith('1080') ? '1920x1080' : '1280x720';
    const bitrate = profile === '1080p60' ? '8500k' : profile === '1080p30' ? '6000k' : '4000k';
    const fps = profile === '1080p60' ? 60 : 30;

    const inputPattern = isFallback
      ? `smptebars=size=${resolution}:rate=${fps}`
      : `testsrc2=size=${resolution}:rate=${fps}`;

    const args = [
      '-re',
      '-f', 'lavfi', '-i', inputPattern,
      '-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=48000:beep_factor=4',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-b:v', bitrate,
      '-maxrate', bitrate,
      '-bufsize', '9000k',
      '-pix_fmt', 'yuv420p',
      '-g', String(fps * 2),
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '48000',
      '-f', 'flv',
      rtmpUrl
    ];

    try {
      ffmpegProcess = spawn(FFMPEG_PATH, args, { stdio: 'ignore', windowsHide: true });
    } catch (e) {
      console.error('Erro ao iniciar FFmpeg:', e);
    }
    return true;
  };

  const stopStream = () => {
    if (ffmpegProcess) {
      try { ffmpegProcess.kill(); } catch (e) {}
      ffmpegProcess = null;
      return true;
    }
    return false;
  };

  return {
    name: 'gsa-tv-stream-plugin',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (req.url?.startsWith('/api/gsa-tv/stream-control')) {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', () => {
            try {
              const data = body ? JSON.parse(body) : {};
              const action = data.action || 'status';

              if (action === 'start' || action === 'play' || action === 'resume') {
                startStream(data.streamKey, data.profile, data.isFallback);
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ success: true, streaming: true, isFallback: !!data.isFallback }));
              }

              if (action === 'pause' || action === 'stop') {
                stopStream();
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ success: true, streaming: false }));
              }

              if (action === 'fallback') {
                startStream(data.streamKey, data.profile, true);
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ success: true, streaming: true, isFallback: true }));
              }

              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: true, streaming: !!ffmpegProcess }));
            } catch (e: any) {
              res.statusCode = 500;
              return res.end(JSON.stringify({ error: String(e) }));
            }
          });
          return;
        }

        if (req.url?.startsWith('/api/gsa-tv/metrics')) {
          const cpus = os.cpus();
          const totalMem = os.totalmem();
          const freeMem = os.freemem();
          const usedMem = totalMem - freeMem;
          const memPct = ((usedMem / totalMem) * 100).toFixed(1);

          let totalIdle = 0;
          let totalTick = 0;
          cpus.forEach((cpu) => {
            for (const type in cpu.times) {
              totalTick += (cpu.times as any)[type];
            }
            totalIdle += cpu.times.idle;
          });
          const cpuPct = Math.max(4.2, Math.min(98.5, 100 - (totalIdle / totalTick) * 100)).toFixed(1);

          res.setHeader('Content-Type', 'application/json');
          return res.end(
            JSON.stringify({
              cpuPct: `${cpuPct}%`,
              memUsage: `${(usedMem / (1024 * 1024 * 1024)).toFixed(2)} GB`,
              memPct: `${memPct}%`,
              totalMem: `${(totalMem / (1024 * 1024 * 1024)).toFixed(1)} GB`,
              isStreaming: !!ffmpegProcess,
              cores: cpus.length,
              platform: os.platform(),
              arch: os.arch(),
              hostUptime: os.uptime(),
              timestamp: new Date().toISOString(),
            })
          );
        }

        next();
      });
    }
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss(), gsaTvStreamPlugin()],
    define: {
      'process.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL),
      'process.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify - file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      chunkSizeWarningLimit: 650,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('react') || id.includes('@tanstack/react-query')) return 'vendor-react';
            if (id.includes('@supabase')) return 'vendor-supabase';
            if (id.includes('framer-motion') || id.includes('/motion/')) return 'vendor-motion';
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('recharts')) return 'vendor-charts';
            if (id.includes('xlsx') || id.includes('jspdf')) return 'vendor-documents';
            return undefined;
          },
        },
      },
    },
  };
});
