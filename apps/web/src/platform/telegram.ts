// Integración con Telegram Mini Apps. Solo se activa cuando el juego se abre
// desde Telegram (que añade tgWebAppData al hash de la URL); en la web normal
// no se carga nada.

interface TgButton {
  setText(text: string): void;
  show(): void;
  hide(): void;
  enable(): void;
  disable(): void;
  onClick(cb: () => void): void;
  setParams?(params: { color?: string; text_color?: string }): void;
}

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: { id: number; first_name?: string; username?: string } };
  platform: string;
  ready(): void;
  expand(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  disableVerticalSwipes?(): void;
  MainButton: TgButton;
  BackButton: Omit<TgButton, 'setText' | 'enable' | 'disable'>;
  HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function launchedFromTelegram(): boolean {
  return location.hash.includes('tgWebAppData') || new URLSearchParams(location.search).has('tgWebAppStartParam');
}

export async function initTelegram(): Promise<TelegramWebApp | null> {
  if (!launchedFromTelegram()) return null;
  try {
    await loadScript('https://telegram.org/js/telegram-web-app.js');
  } catch {
    return null;
  }
  const app = window.Telegram?.WebApp;
  if (!app?.initData) return null;
  app.ready();
  app.expand();
  app.setHeaderColor?.('#090a0f');
  app.setBackgroundColor?.('#090a0f');
  app.disableVerticalSwipes?.();
  app.MainButton.setParams?.({ color: '#e8c164', text_color: '#1a1004' });
  return app;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    document.head.append(s);
  });
}
