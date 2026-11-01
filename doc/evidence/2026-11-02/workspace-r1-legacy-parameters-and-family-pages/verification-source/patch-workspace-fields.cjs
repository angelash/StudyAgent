const fs=require('node:fs'),path=require('node:path');const f=path.resolve(__dirname,'../../../apps/web/components/workspace-shell.css');let s=fs.readFileSync(f,'utf8');
const from="body[data-study-navigation] .workspace-page :is(select,input) { border-color:#e9ecf1;background:#fff; }";
const nl=s.includes('\r\n')?'\r\n':'\n';
const to=from+nl+"/* Older page bodies inside a workspace page inherit the workspace field and secondary button, outranking their original learning-studio rules. */"+nl+"body[data-study-navigation] .workspace-page :is(input:not([type=checkbox]):not([type=radio]),select,textarea) { background:#fff;border:1px solid #e9ecf1;border-radius:8px;color:#172031; }"+nl+"body[data-study-navigation] .workspace-page .studio-secondary { background:#fff;color:#4c6696;border-color:#e9ecf1;font-weight:500; }";
const n=s.split(from).length-1;if(n!==1)throw Error('expected one match, found '+n);fs.writeFileSync(f,s.replace(from,to));console.log('workspace field rules added');
