export const APP_VERSION = import.meta.env.VITE_APP_VERSION || '1.0.0';
export const BUILD_TIMESTAMP = import.meta.env.VITE_BUILD_TIMESTAMP || Date.now().toString();

export const version = {
  getVersion: () => APP_VERSION,
  getBuildTime: () => BUILD_TIMESTAMP,
  getFormatted: () => `v${APP_VERSION} (${new Date(parseInt(BUILD_TIMESTAMP)).toISOString()})`,
};
