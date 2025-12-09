import { App, URLOpenListenerEvent } from '@capacitor/app';

type DeepLinkHandler = (path: string, params: URLSearchParams) => void;

interface DeepLinkRoute {
  pattern: RegExp;
  handler: (matches: RegExpMatchArray, params: URLSearchParams) => void;
}

class DeepLinkManager {
  private routes: DeepLinkRoute[] = [];
  private defaultHandler: DeepLinkHandler | null = null;
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      App.addListener('appUrlOpen', (event: URLOpenListenerEvent) => {
        this.handleDeepLink(event.url);
      });

      const launchUrl = await App.getLaunchUrl();
      if (launchUrl?.url) {
        this.handleDeepLink(launchUrl.url);
      }

      this.isInitialized = true;
      console.log('[DeepLink] Manager initialized');
    } catch (error) {
      console.error('[DeepLink] Failed to initialize:', error);
    }
  }

  registerRoute(pattern: RegExp, handler: DeepLinkRoute['handler']): void {
    this.routes.push({ pattern, handler });
  }

  setDefaultHandler(handler: DeepLinkHandler): void {
    this.defaultHandler = handler;
  }

  private handleDeepLink(url: string): void {
    console.log('[DeepLink] Received:', url);

    try {
      let parsedUrl: URL;
      
      if (url.startsWith('pact://')) {
        const pathPart = url.replace('pact://', '');
        parsedUrl = new URL(`https://app.pact.io/${pathPart}`);
      } else {
        parsedUrl = new URL(url);
      }

      const path = parsedUrl.pathname;
      const params = parsedUrl.searchParams;

      for (const route of this.routes) {
        const matches = path.match(route.pattern);
        if (matches) {
          route.handler(matches, params);
          return;
        }
      }

      if (this.defaultHandler) {
        this.defaultHandler(path, params);
      }
    } catch (error) {
      console.error('[DeepLink] Failed to parse URL:', error);
    }
  }

  generateLink(path: string, params?: Record<string, string>): string {
    const baseUrl = 'https://pact-dashboard-831y.vercel.app';
    let url = `${baseUrl}${path}`;
    
    if (params) {
      const searchParams = new URLSearchParams(params);
      url += `?${searchParams.toString()}`;
    }
    
    return url;
  }

  generateAppLink(path: string, params?: Record<string, string>): string {
    let url = `pact://app${path}`;
    
    if (params) {
      const searchParams = new URLSearchParams(params);
      url += `?${searchParams.toString()}`;
    }
    
    return url;
  }
}

export const deepLinkManager = new DeepLinkManager();

export function setupDeepLinkRoutes(navigate: (path: string) => void): void {
  deepLinkManager.registerRoute(
    /^\/site-visits\/([a-zA-Z0-9-]+)$/,
    (matches, params) => {
      const visitId = matches[1];
      navigate(`/site-visits/${visitId}`);
    }
  );

  deepLinkManager.registerRoute(
    /^\/sites\/([a-zA-Z0-9-]+)$/,
    (matches, params) => {
      const siteId = matches[1];
      navigate(`/sites/${siteId}`);
    }
  );

  deepLinkManager.registerRoute(
    /^\/wallet$/,
    () => {
      navigate('/wallet');
    }
  );

  deepLinkManager.registerRoute(
    /^\/approvals$/,
    () => {
      navigate('/approvals');
    }
  );

  deepLinkManager.registerRoute(
    /^\/approvals\/([a-zA-Z0-9-]+)$/,
    (matches) => {
      const approvalId = matches[1];
      navigate(`/approvals/${approvalId}`);
    }
  );

  deepLinkManager.registerRoute(
    /^\/notifications$/,
    () => {
      navigate('/notifications');
    }
  );

  deepLinkManager.registerRoute(
    /^\/team\/([a-zA-Z0-9-]+)$/,
    (matches) => {
      const userId = matches[1];
      navigate(`/team/${userId}`);
    }
  );

  deepLinkManager.registerRoute(
    /^\/mmp\/([a-zA-Z0-9-]+)$/,
    (matches) => {
      const mmpId = matches[1];
      navigate(`/mmp/${mmpId}`);
    }
  );

  deepLinkManager.setDefaultHandler((path) => {
    console.log('[DeepLink] No route matched, navigating to:', path);
    if (path && path !== '/') {
      navigate(path);
    } else {
      navigate('/dashboard');
    }
  });
}

export function useDeepLinking(navigate: (path: string) => void): void {
  const React = require('react');

  React.useEffect(() => {
    setupDeepLinkRoutes(navigate);
    deepLinkManager.initialize();
  }, [navigate]);
}

export function createShareableLink(
  type: 'site-visit' | 'site' | 'approval' | 'user',
  id: string,
  params?: Record<string, string>
): { webLink: string; appLink: string } {
  const pathMap = {
    'site-visit': `/site-visits/${id}`,
    'site': `/sites/${id}`,
    'approval': `/approvals/${id}`,
    'user': `/team/${id}`,
  };

  const path = pathMap[type];

  return {
    webLink: deepLinkManager.generateLink(path, params),
    appLink: deepLinkManager.generateAppLink(path, params),
  };
}

export async function shareDeepLink(
  type: 'site-visit' | 'site' | 'approval' | 'user',
  id: string,
  title: string,
  message?: string
): Promise<boolean> {
  const { webLink } = createShareableLink(type, id);

  if (navigator.share) {
    try {
      await navigator.share({
        title,
        text: message || title,
        url: webLink,
      });
      return true;
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('[DeepLink] Share failed:', error);
      }
      return false;
    }
  }

  try {
    await navigator.clipboard.writeText(webLink);
    return true;
  } catch {
    return false;
  }
}
