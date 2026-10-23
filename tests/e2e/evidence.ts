import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
/** A test run must never replace a dated, committed delivery archive. */
export function browserEvidence(suite:string){const directory=join('data','qa','browser-evidence',suite);mkdirSync(directory,{recursive:true});return directory;}
