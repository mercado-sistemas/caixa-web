import { useEffect, useRef, useState } from 'react';

/*
 * Leitor de código de barras pela câmera do próprio aparelho (Fase 1 — modo A).
 *
 * Abre a câmera traseira, procura um código no vídeo e, ao achar, chama
 * onDetected(codigo) e fecha. Usa o BarcodeDetector nativo do navegador quando
 * existe (Android/Chrome — rápido e bom com EAN-13) e cai para uma
 * implementação em WASM (carregada só quando necessário) nos demais.
 *
 * Precisa de HTTPS (ou localhost) para a permissão de câmera.
 */
const FORMATOS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'codabar', 'qr_code'];

async function criarDetector() {
  if ('BarcodeDetector' in window) {
    try {
      const suportados = await window.BarcodeDetector.getSupportedFormats?.();
      const formats = suportados ? FORMATOS.filter((f) => suportados.includes(f)) : FORMATOS;
      return new window.BarcodeDetector({ formats });
    } catch { /* cai para o ponyfill */ }
  }
  const { BarcodeDetector } = await import('barcode-detector/pure');
  return new BarcodeDetector({ formats: FORMATOS });
}

function mensagemDeErro(e) {
  const n = e?.name || '';
  if (n === 'NotAllowedError') return 'Permissão de câmera negada. Autorize o acesso e tente de novo.';
  if (n === 'NotFoundError') return 'Nenhuma câmera encontrada neste aparelho. Use um leitor USB ou digite o código.';
  if (n === 'NotReadableError') return 'A câmera está em uso por outro aplicativo.';
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
    return 'A câmera só funciona em HTTPS.';
  }
  return 'Não foi possível abrir a câmera: ' + (e?.message || e);
}

export default function ScannerCamera({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const ativoRef = useRef(true);
  const [erro, setErro] = useState('');
  const [temLanterna, setTemLanterna] = useState(false);
  const [lanternaOn, setLanternaOn] = useState(false);

  useEffect(() => {
    ativoRef.current = true;

    (async () => {
      let detector;
      try {
        detector = await criarDetector();
      } catch (e) {
        setErro('Leitor indisponível: ' + (e?.message || e));
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } }, audio: false,
        });
        if (!ativoRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;

        const track = stream.getVideoTracks()[0];
        if (track?.getCapabilities?.().torch) setTemLanterna(true);

        const v = videoRef.current;
        v.srcObject = stream;
        await v.play();
        laco(detector);
      } catch (e) {
        setErro(mensagemDeErro(e));
      }
    })();

    return () => { ativoRef.current = false; pararCamera(); };
  }, []); // eslint-disable-line

  async function laco(detector) {
    if (!ativoRef.current) return;
    const v = videoRef.current;
    if (v && v.readyState >= 2) {
      try {
        const codigos = await detector.detect(v);
        const bruto = codigos?.[0]?.rawValue;
        if (bruto) { pararCamera(); onDetected(String(bruto)); return; }
      } catch { /* frame ruim; tenta o próximo */ }
    }
    // ~8 leituras/s: suficiente e leve na CPU
    setTimeout(() => laco(detector), 120);
  }

  function pararCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function alternarLanterna() {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !lanternaOn }] });
      setLanternaOn((v) => !v);
    } catch { /* sem suporte */ }
  }

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2147483000, background: 'rgba(0,0,0,.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'relative', width: 'min(92vw, 480px)', aspectRatio: '4 / 3', background: '#000', borderRadius: 10, overflow: 'hidden' }}>
        <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        {/* moldura-alvo */}
        <div style={{ position: 'absolute', inset: '22% 10%', border: '3px solid var(--amarelo, #FFD60A)', borderRadius: 8, boxShadow: '0 0 0 100vmax rgba(0,0,0,.35)' }} />
      </div>

      <div style={{ color: '#fff', marginTop: 14, fontSize: 14, textAlign: 'center', maxWidth: 480 }}>
        {erro
          ? <span style={{ color: '#FFB4A2' }}>{erro}</span>
          : 'Aponte a câmera para o código de barras do produto.'}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        {temLanterna && !erro && (
          <button className="btn-acao" onClick={alternarLanterna}>{lanternaOn ? '🔦 Desligar' : '🔦 Lanterna'}</button>
        )}
        <button className="btn-acao primario" onClick={onClose}>Fechar</button>
      </div>
    </div>
  );
}
