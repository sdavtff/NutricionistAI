import { Camera, Crop, ImagePlus, RotateCcw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CropRect } from '../lib/image';
import { isNative } from '../lib/platform';
import { nativePhoto } from '../services/native';
import { Alert, Button, Modal } from './ui';

/** Câmera ao vivo (getUserMedia) com fallback para o seletor nativo do celular. */
export function CameraModal({ open, onClose, onCapture }: { open: boolean; onClose: () => void; onCapture: (blob: Blob) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Seu navegador não permite acesso direto à câmera. Use “Escolher da galeria” — no celular, ele também oferece a opção de tirar foto.');
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 } }, audio: false })
      .then((s) => {
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
      })
      .catch((e: Error) => setError(e.name === 'NotAllowedError'
        ? 'Permissão da câmera negada. Libere o acesso nas configurações do navegador ou escolha uma foto da galeria.'
        : 'Não foi possível abrir a câmera neste dispositivo.'));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [open, facing]);

  function snap() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')!.drawImage(v, 0, 0);
    c.toBlob((b) => b && (onCapture(b), onClose()), 'image/jpeg', 0.92);
  }

  return (
    <Modal open={open} onClose={onClose} title="Tirar foto">
      {error ? <Alert kind="warning">{error}</Alert> : (
        <div className="stack">
          <video ref={video} playsInline muted style={{ width: '100%', borderRadius: 16, background: '#000' }} aria-label="Pré-visualização da câmera" />
          <p className="tiny muted">Dica: fotografe de cima, com boa luz e um talher ou a mão como referência de tamanho.</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <Button onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}><RotateCcw size={18} />Virar</Button>
            <Button variant="primary" onClick={snap}><Camera size={18} />Capturar</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Recorte simples: arrastar a área e redimensionar pelo canto. Valores em frações (0..1). */
export function Cropper({ src, onApply, onCancel }: { src: string; onApply: (c: CropRect) => void; onCancel: () => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<CropRect>({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
  const drag = useRef<{ mode: 'move' | 'resize'; sx: number; sy: number; start: CropRect } | null>(null);

  function onDown(e: React.PointerEvent, mode: 'move' | 'resize') {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, sx: e.clientX, sy: e.clientY, start: rect };
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    const box = stage.current?.getBoundingClientRect();
    if (!d || !box) return;
    const dx = (e.clientX - d.sx) / box.width;
    const dy = (e.clientY - d.sy) / box.height;
    if (d.mode === 'move') {
      setRect({ ...d.start, x: clamp(d.start.x + dx, 0, 1 - d.start.w), y: clamp(d.start.y + dy, 0, 1 - d.start.h) });
    } else {
      setRect({ ...d.start, w: clamp(d.start.w + dx, 0.15, 1 - d.start.x), h: clamp(d.start.h + dy, 0.15, 1 - d.start.y) });
    }
  }
  return (
    <div className="stack">
      <div className="crop-stage" ref={stage} onPointerMove={onMove} onPointerUp={() => (drag.current = null)}>
        <img src={src} alt="Imagem a recortar" />
        <div className="crop-box" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }}
          onPointerDown={(e) => onDown(e, 'move')} role="slider" aria-label="Área de recorte (arraste para mover)" aria-valuetext={`${Math.round(rect.w * 100)}% × ${Math.round(rect.h * 100)}%`} tabIndex={0}
          onKeyDown={(e) => {
            const s = 0.02;
            if (e.key === 'ArrowLeft') setRect((r) => ({ ...r, x: clamp(r.x - s, 0, 1 - r.w) }));
            if (e.key === 'ArrowRight') setRect((r) => ({ ...r, x: clamp(r.x + s, 0, 1 - r.w) }));
            if (e.key === 'ArrowUp') setRect((r) => ({ ...r, y: clamp(r.y - s, 0, 1 - r.h) }));
            if (e.key === 'ArrowDown') setRect((r) => ({ ...r, y: clamp(r.y + s, 0, 1 - r.h) }));
          }}>
          <span className="crop-handle" onPointerDown={(e) => onDown(e, 'resize')} aria-hidden />
        </div>
      </div>
      <p className="tiny muted">Arraste a área para mover e use o círculo no canto para redimensionar.</p>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button onClick={onCancel}><X size={18} />Cancelar</Button>
        <Button onClick={() => setRect({ x: 0, y: 0, w: 1, h: 1 })}>Imagem inteira</Button>
        <Button variant="primary" onClick={() => onApply(rect)}><Crop size={18} />Aplicar recorte</Button>
      </div>
    </div>
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

export function PickButtons({ onFile, onCamera, onError }: { onFile: (f: Blob) => void; onCamera: () => void; onError?: (msg: string) => void }) {
  const gallery = useRef<HTMLInputElement>(null);
  const native = useRef<HTMLInputElement>(null);
  const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

  async function fromApp(source: 'camera' | 'galeria') {
    try {
      const blob = await nativePhoto(source);
      if (blob) onFile(blob);
    } catch (e) {
      onError?.((e as Error).message);
    }
  }

  if (isNative()) {
    return (
      <div className="row-wrap" style={{ justifyContent: 'center' }}>
        <Button variant="primary" onClick={() => fromApp('camera')}><Camera size={20} />Tirar foto</Button>
        <Button onClick={() => fromApp('galeria')}><ImagePlus size={20} />Escolher da galeria</Button>
      </div>
    );
  }
  return (
    <div className="row-wrap" style={{ justifyContent: 'center' }}>
      <Button variant="primary" onClick={() => (isTouch ? native.current?.click() : onCamera())}><Camera size={20} />Tirar foto</Button>
      <Button onClick={() => gallery.current?.click()}><ImagePlus size={20} />Escolher da galeria</Button>
      <input ref={native} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
      <input ref={gallery} type="file" accept="image/jpeg,image/png,image/webp,image/heic" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
    </div>
  );
}
