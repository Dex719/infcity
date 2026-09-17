import { buildShareUrl, type AppFlags } from '@/api/Seed';
import type { App } from '@/app/App';
import { ASSETS, GEN, UI } from '@/config';
import { About } from './About';
import type { ErrorOverlay } from './ErrorOverlay';
import { ShareControl } from './Share';
import { STRINGS } from './strings.ru';
import { el } from './theme';
import { Title } from './Title';
import { Toast } from './Toast';

export interface ShellOptions {
  readonly flags: AppFlags;
  readonly canvas: HTMLCanvasElement;
  /** Текст `CREDITS.md` для окна About. */
  readonly credits: string;
  readonly errorOverlay: ErrorOverlay;
  readonly parent?: HTMLElement;
}

/**
 * DOM-оболочка над канвасом (design C13, FR-10): заголовок, HUD с кнопками «Поделиться»
 * и «?», тосты, About, обработка потери WebGL-контекста (FR-11.4) и уведомления о seed.
 */
export class Shell {
  readonly root: HTMLElement;
  readonly hud: HTMLElement;
  readonly title: Title;
  readonly toast: Toast;
  readonly share: ShareControl;
  readonly about: About;

  private contextTimer = 0;
  private pausedByContext = false;
  private readonly offContext: () => void;
  private readonly offStarted: () => void;

  constructor(
    private readonly app: App,
    private readonly options: ShellOptions,
  ) {
    const parent = options.parent ?? document.body;
    const canvas = options.canvas;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', STRINGS.aria.canvas);

    this.root = el('div', 'ui');
    this.root.id = 'ui';
    this.hud = el('div', 'hud');
    this.hud.id = 'hud';
    this.hud.setAttribute('role', 'toolbar');
    this.hud.setAttribute('aria-label', STRINGS.aria.hud);

    this.title = new Title(this.root, STRINGS.title, STRINGS.subtitle);
    this.root.appendChild(this.hud);
    this.toast = new Toast(this.root);
    this.share = new ShareControl(this.hud, this.root, {
      url: () => buildShareUrl(window.location.href, app.flags.seed),
      toast: this.toast,
    });
    this.about = new About(this.hud, this.root, app, canvas, {
      credits: options.credits,
      author: UI.AUTHOR,
      inertWhileOpen: [canvas, this.hud],
      onOpen: () => {
        this.title.remove();
        this.share.hideFallback();
      },
      onClose: () => app.input.keys.clear(),
    });
    parent.appendChild(this.root);

    const onStarted = (): void => {
      this.title.show();
      this.announceSeed();
    };
    app.on('started', onStarted);
    this.offStarted = () => app.off('started', onStarted);
    this.offContext = app.renderer.onContext(this.onContextLost, this.onContextRestored);
  }

  dispose(): void {
    window.clearTimeout(this.contextTimer);
    this.offContext();
    this.offStarted();
    this.title.remove();
    this.toast.dispose();
    this.share.dispose();
    this.about.dispose();
    this.root.remove();
  }

  /** Тосты о нормализованном seed (FR-2.4) и о ссылке из другой версии генератора. */
  private announceSeed(): void {
    const flags = this.options.flags;
    const messages: string[] = [];
    if (flags.seedNormalized) {
      messages.push(STRINGS.toasts.seedNormalized);
    }
    if (flags.version !== null && flags.version !== GEN.VERSION) {
      messages.push(STRINGS.errors.versionMismatch);
    }
    messages.forEach((message, index) => {
      window.setTimeout(() => this.toast.show(message), index * (UI.TOAST_MS + 300));
    });
  }

  private readonly onContextLost = (): void => {
    this.pausedByContext = !this.app.isPaused;
    this.app.pause();
    this.options.errorOverlay.show({
      title: STRINGS.errors.contextTitle,
      body: STRINGS.errors.contextBody,
      translucent: true,
    });
    window.clearTimeout(this.contextTimer);
    this.contextTimer = window.setTimeout(() => {
      this.options.errorOverlay.show({
        title: STRINGS.errors.contextTitle,
        body: STRINGS.errors.contextTimeoutBody,
        action: { label: STRINGS.buttons.reload, onClick: () => window.location.reload() },
      });
    }, ASSETS.CONTEXT_RESTORE_TIMEOUT_MS);
  };

  private readonly onContextRestored = (): void => {
    window.clearTimeout(this.contextTimer);
    this.options.errorOverlay.hide();
    if (this.pausedByContext) {
      this.pausedByContext = false;
      this.app.resume();
    }
  };
}
