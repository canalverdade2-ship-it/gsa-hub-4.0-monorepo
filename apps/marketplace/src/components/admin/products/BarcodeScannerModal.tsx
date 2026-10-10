import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Modal } from '../../ui/Modal';
import { Loader2, X, AlertCircle, CheckCircle2, Camera, RefreshCw, Zap, ZapOff } from 'lucide-react';
import { mapNativeFormat, mapZXingFormat, processBarcodeValue, ProcessedBarcodeResult } from '../../../lib/barcodeScanner';
import { toast } from 'react-hot-toast';
import { isLocalDevHost } from '../../../lib/utils';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDetected: (result: {
    rawValue: string;
    normalizedValue: string;
    detectedFormat: string;
  }) => void;
}

// Global declaration for experimental BarcodeDetector API
declare global {
  interface Window {
    BarcodeDetector?: any;
    isSecureContext: boolean;
  }
}

export function BarcodeScannerModal({ isOpen, onClose, onDetected }: BarcodeScannerModalProps) {
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);
  
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isHttpsSecure, setIsHttpsSecure] = useState<boolean>(true);
  
  const [scanning, setScanning] = useState(false);
  const [detectionCompleted, setDetectionCompleted] = useState(false);
  const [detectedData, setDetectedData] = useState<ProcessedBarcodeResult | null>(null);
  
  const [canUseTorch, setCanUseTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [initializing, setInitializing] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const zxingControlsRef = useRef<any>(null);
  const animationFrameRef = useRef<number | null>(null);
  const componentMounted = useRef(false);

  // Stop everything
  const stopAll = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (zxingControlsRef.current) {
      zxingControlsRef.current.stop();
      zxingControlsRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        if (track.readyState === 'live') {
          // Attempt to turn off torch before stopping
          try {
            track.applyConstraints({ advanced: [{ torch: false }] as any }).catch(() => {});
          } catch (e) { console.error("Erro capturado:", e); }
          track.stop();
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Handle cleanup on unmount or close
  useEffect(() => {
    componentMounted.current = true;
    
    if (!isOpen) {
      stopAll();
      setScanning(false);
      setInitializing(true);
      setErrorMsg(null);
      setHasPermission(null);
      setDetectionCompleted(false);
      setDetectedData(null);
    } else {
      checkContextAndInit();
    }
    
    return () => {
      componentMounted.current = false;
      stopAll();
    };
  }, [isOpen, stopAll]);

  const checkContextAndInit = async () => {
    // Verificar HTTPS ou localhost
    const isLocalhost = isLocalDevHost();
    if (!window.isSecureContext && !isLocalhost) {
      setIsHttpsSecure(false);
      setErrorMsg('A câmera só pode ser utilizada em uma conexão segura HTTPS ou em localhost.');
      setInitializing(false);
      return;
    }
    setIsHttpsSecure(true);
    await startCamera();
  };

  const requestPermissions = async () => {
    try {
      // Pedimos com ambiente por padrão
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: { ideal: 'environment' } }, 
        audio: false 
      });
      // Paramos imediatamente, foi só para garantir permissão
      stream.getTracks().forEach(track => track.stop());
      setHasPermission(true);
      return true;
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setErrorMsg('Permissão da câmera negada. Libere o acesso à câmera nas configurações do navegador ou digite o código manualmente.');
      } else if (err.name === 'NotFoundError') {
        setErrorMsg('Nenhuma câmera foi encontrada neste dispositivo.');
      } else if (err.name === 'NotReadableError') {
        setErrorMsg('A câmera está sendo utilizada por outro aplicativo.');
      } else {
        setErrorMsg(`Não foi possível acessar a câmera: ${err.message || 'Desconhecido'}`);
      }
      setHasPermission(false);
      setInitializing(false);
      return false;
    }
  };

  const startCamera = async (specificDeviceId?: string) => {
    setInitializing(true);
    setErrorMsg(null);
    stopAll(); // Clear any existing stream
    
    let hasPerm = hasPermission;
    if (hasPerm === null) {
      hasPerm = await requestPermissions();
    }
    
    if (!hasPerm) return;

    try {
      // List cameras
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      setCameras(videoDevices);

      let constraints: MediaStreamConstraints = { audio: false };
      
      if (specificDeviceId) {
        constraints.video = { deviceId: { exact: specificDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } };
        setActiveCameraId(specificDeviceId);
      } else {
        // Try to find a back camera
        const backCamera = videoDevices.find(d => 
          d.label.toLowerCase().includes('back') || 
          d.label.toLowerCase().includes('rear') || 
          d.label.toLowerCase().includes('traseira') ||
          d.label.toLowerCase().includes('environment')
        );
        
        if (backCamera) {
          constraints.video = { deviceId: { exact: backCamera.deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } };
          setActiveCameraId(backCamera.deviceId);
        } else {
          constraints.video = { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } };
          setActiveCameraId(videoDevices[0]?.deviceId || null);
        }
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err: any) {
        // OverconstrainedError fallback
        if (err.name === 'OverconstrainedError' || err.name === 'ConstraintNotSatisfiedError') {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } else {
          throw err;
        }
      }
      
      if (!componentMounted.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Wait for video to be ready
        await new Promise((resolve) => {
          if (!videoRef.current) return resolve(false);
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch(console.error);
            resolve(true);
          };
        });
      }

      // Check torch capability
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const capabilities = typeof videoTrack.getCapabilities === 'function' ? videoTrack.getCapabilities() : {};
        if (capabilities && (capabilities as any).torch) {
          setCanUseTorch(true);
          setIsTorchOn(false); // Default to off
        } else {
          setCanUseTorch(false);
        }
      }

      setInitializing(false);
      setScanning(true);
      startDetectionLoop();

    } catch (err: any) {
      if (!componentMounted.current) return;
      console.error('Start camera error:', err);
      setErrorMsg('Falha ao iniciar a câmera. Tente novamente ou digite manualmente.');
      setInitializing(false);
    }
  };

  const handleValidDetection = (result: ProcessedBarcodeResult, rawValue: string, mappedFormat: string) => {
    if (!componentMounted.current || detectionCompleted) return;
    
    setDetectionCompleted(true);
    setScanning(false);
    setDetectedData(result);
    
    // Play sound & vibrate
    if (navigator.vibrate) {
      try { navigator.vibrate(100); } catch (e) { console.error("Erro capturado:", e); }
    }
    playBeep();

    // Stop streams
    stopAll();

    // Wait 700ms then trigger callback
    setTimeout(() => {
      if (componentMounted.current) {
        onDetected({
          rawValue: rawValue,
          normalizedValue: result.value,
          detectedFormat: mappedFormat
        });
        onClose();
      }
    }, 700);
  };

  const playBeep = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContext) {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.1);
        osc.stop(ctx.currentTime + 0.1);
      }
    } catch (e) { console.error("Erro capturado:", e); } // ignore audio errors
  };

  const startDetectionLoop = async () => {
    if (!videoRef.current || !streamRef.current || !componentMounted.current) return;

    let useNative = false;
    let nativeDetector: any = null;

    // 1. Try Native
    if (window.BarcodeDetector) {
      try {
        const supportedFormats = await window.BarcodeDetector.getSupportedFormats();
        if (supportedFormats && supportedFormats.length > 0) {
          // We limit to the ones we care about
          const desired = ['ean_8', 'upc_a', 'ean_13', 'itf', 'code_128', 'code_39', 'qr_code'];
          const formats = supportedFormats.filter((f: string) => desired.includes(f));
          
          if (formats.length > 0) {
            nativeDetector = new window.BarcodeDetector({ formats });
            useNative = true;
          }
        }
      } catch (e) {
        console.warn('Native BarcodeDetector support check failed, falling back to ZXing.', e);
      }
    }

    if (useNative && nativeDetector) {
      // Native Loop
      let isDetecting = false;
      const loop = async () => {
        if (!componentMounted.current || detectionCompleted || !scanning) return;
        
        if (!isDetecting && videoRef.current && videoRef.current.readyState >= 2) {
          isDetecting = true;
          try {
            const barcodes = await nativeDetector.detect(videoRef.current);
            if (barcodes.length > 0 && componentMounted.current && !detectionCompleted) {
              for (const barcode of barcodes) {
                const mappedFormat = mapNativeFormat(barcode.format);
                const rawValue = barcode.rawValue;
                
                const processResult = processBarcodeValue(rawValue, mappedFormat);
                
                if (processResult.isValid) {
                  handleValidDetection(processResult, rawValue, mappedFormat);
                  return; // Stop processing further barcodes
                } else if (processResult.isQrCode) {
                  toast.error(processResult.error || 'QR Code não permitido.', { id: 'qrcode-warn' });
                }
              }
            }
          } catch (e) {
            // Ignore detect errors
          }
          isDetecting = false;
        }
        
        // Loop again via timer to avoid freezing
        if (componentMounted.current && !detectionCompleted) {
          animationFrameRef.current = requestAnimationFrame(() => {
            setTimeout(loop, 200); // 200ms interval
          });
        }
      };
      loop();

    } else {
      // 2. Fallback ZXing
      try {
        const { BrowserMultiFormatReader, BarcodeFormat } = await import('@zxing/browser');
        // We can optionally set hints, but MultiFormatReader default is usually fine for these standard formats
        
        const hints = new Map();
        // Just standard linear codes
        hints.set(2, [ // DecodeHintType.POSSIBLE_FORMATS = 2
          BarcodeFormat.EAN_8,
          BarcodeFormat.EAN_13,
          BarcodeFormat.UPC_A,
          BarcodeFormat.ITF,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.QR_CODE
        ]);
        
        const reader = new BrowserMultiFormatReader(hints);
        
        if (!componentMounted.current || detectionCompleted) return;
        
        // ZXing's decodeFromVideoElement will run its own loop.
        zxingControlsRef.current = await reader.decodeFromVideoElement(videoRef.current, (result, error, controls) => {
          if (!componentMounted.current || detectionCompleted) {
            controls.stop();
            return;
          }
          
          if (result) {
            const mappedFormat = mapZXingFormat(result.getBarcodeFormat());
            const rawValue = result.getText();
            
            const processResult = processBarcodeValue(rawValue, mappedFormat);
            
            if (processResult.isValid) {
              handleValidDetection(processResult, rawValue, mappedFormat);
              controls.stop(); // Stop ZXing
            } else if (processResult.isQrCode) {
              toast.error(processResult.error || 'QR Code não permitido.', { id: 'qrcode-warn' });
            }
          }
        });
      } catch (e: any) {
        console.error('ZXing init error:', e);
        if (componentMounted.current) {
          setErrorMsg('Não foi possível iniciar o leitor de fallback.');
          setScanning(false);
        }
      }
    }
  };

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track) {
      try {
        const newTorchState = !isTorchOn;
        await track.applyConstraints({ advanced: [{ torch: newTorchState }] as any });
        setIsTorchOn(newTorchState);
      } catch (e) {
        console.error('Torch error', e);
      }
    }
  };

  const switchCamera = () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex(c => c.deviceId === activeCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    startCamera(cameras[nextIndex].deviceId);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Ler código de barras" size="md">
      <div className="relative flex flex-col bg-neutral-900 overflow-hidden rounded-b-xl" style={{ minHeight: '400px', maxHeight: '75vh' }}>
        
        {!isHttpsSecure && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-neutral-900 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
            <h3 className="text-lg font-bold text-white mb-2">Conexão Insegura</h3>
            <p className="text-sm text-neutral-400 mb-6">A câmera só pode ser utilizada em uma conexão segura HTTPS. Por favor, digite o código manualmente.</p>
            <button onClick={onClose} className="px-6 py-3 bg-neutral-800 text-white font-bold rounded-xl border border-neutral-700">Fechar</button>
          </div>
        )}

        {errorMsg && isHttpsSecure && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-neutral-900 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
            <p className="text-sm font-medium text-white mb-6">{errorMsg}</p>
            <div className="flex gap-3">
              <button onClick={() => startCamera()} className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-lg">Tentar Novamente</button>
              <button onClick={onClose} className="px-4 py-2 bg-neutral-800 text-white font-bold rounded-lg border border-neutral-700">Cancelar</button>
            </div>
          </div>
        )}

        {initializing && !errorMsg && isHttpsSecure && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-neutral-900">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
            <p className="text-sm font-medium text-neutral-400">Abrindo câmera...</p>
          </div>
        )}

        {/* Câmera Vídeo */}
        <video 
          ref={videoRef} 
          className="w-full h-full object-cover absolute inset-0 z-0 bg-black"
          playsInline
          muted
        />

        {/* Overlay escurecido e moldura (somente quando scaneando) */}
        {scanning && !errorMsg && isHttpsSecure && (
          <div className="absolute inset-0 z-10 pointer-events-none flex flex-col">
            <div className="flex-1 bg-black/60" />
            <div className="flex justify-center items-center w-full">
              <div className="w-[10%] bg-black/60 h-40 md:h-48" />
              <div className="w-[80%] max-w-[400px] h-40 md:h-48 relative shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]">
                {/* Bordas */}
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-lg" />
                
                {/* Animação laser */}
                <div className="absolute left-4 right-4 h-0.5 bg-indigo-500 shadow-[0_0_8px_2px_rgba(99,102,241,0.5)] animate-[scan_2s_ease-in-out_infinite]" />
              </div>
              <div className="w-[10%] bg-black/60 h-40 md:h-48" />
            </div>
            <div className="flex-1 bg-black/60" />
            
            <div className="absolute inset-x-0 top-1/2 -mt-28 text-center px-4">
              <p className="text-white text-sm font-medium drop-shadow-md bg-black/40 inline-block px-4 py-1.5 rounded-full backdrop-blur-sm">
                Procurando código...
              </p>
            </div>
            
            <div className="absolute inset-x-0 bottom-24 text-center px-6">
              <p className="text-white text-xs opacity-75 drop-shadow-md">Posicione o código de barras dentro da área destacada.</p>
            </div>
          </div>
        )}

        {/* Mensagem de Sucesso */}
        {detectionCompleted && detectedData && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-emerald-500/20 p-4 rounded-full mb-4">
              <CheckCircle2 className="w-16 h-16 text-emerald-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Código Identificado!</h3>
            <div className="bg-neutral-800 border border-neutral-700 px-6 py-3 rounded-xl text-center">
              <p className="text-xs text-neutral-400 uppercase tracking-widest font-bold mb-1">{detectedData.type}</p>
              <p className="text-2xl font-mono text-emerald-400 font-black tracking-widest">{detectedData.value}</p>
            </div>
          </div>
        )}

        {/* Controles de Câmera na base */}
        <div className="absolute bottom-0 left-0 right-0 z-20 p-4 bg-gradient-to-t from-black/80 to-transparent flex justify-between items-center">
          <button 
            onClick={onClose}
            className="flex items-center gap-2 px-4 py-2 bg-neutral-800/80 hover:bg-neutral-700 text-white rounded-full text-sm font-bold backdrop-blur-md transition-colors"
          >
            <X className="w-4 h-4" /> Cancelar
          </button>
          
          <div className="flex gap-2">
            {canUseTorch && !detectionCompleted && (
              <button 
                onClick={toggleTorch}
                className={`p-3 rounded-full backdrop-blur-md transition-colors ${isTorchOn ? 'bg-yellow-500 text-black' : 'bg-neutral-800/80 text-white hover:bg-neutral-700'}`}
                aria-label="Lanterna"
              >
                {isTorchOn ? <ZapOff className="w-5 h-5" /> : <Zap className="w-5 h-5" />}
              </button>
            )}
            
            {cameras.length > 1 && !detectionCompleted && (
              <button 
                onClick={switchCamera}
                className="p-3 bg-neutral-800/80 hover:bg-neutral-700 text-white rounded-full backdrop-blur-md transition-colors"
                aria-label="Trocar câmera"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
        
        {/* Privacidade */}
        <div className="absolute top-2 left-0 right-0 text-center z-20 pointer-events-none opacity-50">
          <p className="text-[9px] text-white font-medium px-4 leading-tight shadow-black drop-shadow-md">A câmera é utilizada somente para identificar o código de barras. Nenhuma gravação é salva.</p>
        </div>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes scan {
          0%, 100% { transform: translateY(0); opacity: 0; }
          10% { opacity: 1; }
          50% { transform: translateY(140px); }
          90% { opacity: 1; }
        }
        @media (min-width: 768px) {
          @keyframes scan {
            0%, 100% { transform: translateY(0); opacity: 0; }
            10% { opacity: 1; }
            50% { transform: translateY(170px); }
            90% { opacity: 1; }
          }
        }
      `}} />
    </Modal>
  );
}
