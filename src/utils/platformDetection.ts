// Platform detection utility
export const isMobileApp = (): boolean => {
  // Check if running in Capacitor (mobile native app)
  if ((window as any).Capacitor) {
    return true;
  }
  
  // Check if app is running inside a native container
  if ((window as any).cordova || (window as any).phonegap) {
    return true;
  }
  
  // Check user agent for mobile indicators
  const userAgent = navigator.userAgent.toLowerCase();
  const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
  
  return isMobileUA && !window.location.hostname.includes('localhost');
};

export const getPlatform = () => {
  if ((window as any).Capacitor?.isNativePlatform?.()) {
    return (window as any).Capacitor.getPlatform();
  }
  return 'web';
};
