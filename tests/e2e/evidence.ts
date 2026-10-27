import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
/** A test run must never replace a dated, committed delivery archive. */
export function browserEvidence(suite:string){const run=process.env.E2E_EVIDENCE_RUN;
  if(run&&!/^[A-Za-z0-9_-]{1,120}$/.test(run))throw new Error('Invalid isolated screenshot run name');
  const directory=join('data','qa','browser-evidence',...(run?[run]:[]),suite);mkdirSync(directory,{recursive:true});return directory;}
