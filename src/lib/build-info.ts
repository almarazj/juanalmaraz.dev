import pkg from '../../package.json';

export const buildInfo = {
  version: import.meta.env.PUBLIC_VERSION || pkg.version,
  commit: (import.meta.env.PUBLIC_COMMIT || '0000000').slice(0, 7),
  branch: import.meta.env.PUBLIC_BRANCH || 'local',
};
