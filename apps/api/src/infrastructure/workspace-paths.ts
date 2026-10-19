import { resolve } from 'node:path';
export const workspaceRoot = () => process.cwd().replace(/\\/g, '/').endsWith('/apps/api') ? resolve('../..') : process.cwd();
export const studyDataRoot = () => resolve(process.env.STUDY_DATA_DIR ?? resolve(workspaceRoot(), 'data'));
export const studyAssetRoot = () => resolve(process.env.STUDY_ASSET_ROOT ?? process.env.STUDY_ASSETS_DIR ?? resolve(workspaceRoot(), 'data/assets'));
