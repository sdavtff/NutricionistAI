// Integrações nativas (Android via Capacitor). No navegador, nada aqui é executado.
import { App } from '@capacitor/app';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { isNative } from '../lib/platform';

/** Pilha de diálogos abertos: o botão "voltar" do Android fecha o mais recente antes de navegar. */
const backHandlers: (() => void)[] = [];
export function pushBackHandler(fn: () => void) {
  backHandlers.push(fn);
  return () => {
    const i = backHandlers.lastIndexOf(fn);
    if (i >= 0) backHandlers.splice(i, 1);
  };
}

let initialized = false;
export function initNative() {
  if (!isNative() || initialized) return;
  initialized = true;
  void App.addListener('backButton', ({ canGoBack }) => {
    const top = backHandlers[backHandlers.length - 1];
    if (top) return top();
    const atHome = window.location.hash === '' || window.location.hash === '#/' || window.location.hash === '#/login';
    if (canGoBack && !atHome) window.history.back();
    else void App.exitApp();
  });
  void SplashScreen.hide().catch(() => undefined);
}

export async function applyNativeTheme(dark: boolean) {
  if (!isNative()) return;
  try {
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setBackgroundColor({ color: dark ? '#0c1511' : '#f6f8f6' });
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
  } catch {
    /* plugin indisponível */
  }
}

/** Abre a câmera ou a galeria nativa e devolve a imagem como Blob (ou null se cancelado). */
export async function nativePhoto(source: 'camera' | 'galeria'): Promise<Blob | null> {
  try {
    const photo = await Camera.getPhoto({
      source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
      resultType: CameraResultType.Uri,
      quality: 90,
      width: 2000,
      correctOrientation: true,
      saveToGallery: false,
      promptLabelHeader: 'Foto da refeição',
      promptLabelPhoto: 'Galeria',
      promptLabelPicture: 'Câmera',
      promptLabelCancel: 'Cancelar',
    });
    if (!photo.webPath) return null;
    return await (await fetch(photo.webPath)).blob();
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (/cancel/i.test(msg)) return null;
    if (/denied|permission/i.test(msg)) throw new Error('Permissão negada. Libere o acesso à câmera/fotos nas configurações do Android.');
    throw new Error('Não foi possível obter a foto.');
  }
}

/** Salva um arquivo de texto no cache do app e abre o menu de compartilhamento do Android. */
export async function shareTextFile(name: string, content: string) {
  const res = await Filesystem.writeFile({ path: name, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 });
  await Share.share({ title: name, text: 'Exportação de dados do Nutricionist AI', files: [res.uri], dialogTitle: 'Salvar ou enviar seus dados' });
}
