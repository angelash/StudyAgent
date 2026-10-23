/* Project-local image runtime. Does not modify the installed Xiaojiu skill or global Python packages. */
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),directory=path.join(root,'data/runtime/imagegen');
if(!directory.startsWith(root+path.sep))throw new Error('Image runtime must stay in this project');
let current=path.parse(directory).root;for(const part of path.relative(current,directory).split(path.sep)){current=path.join(current,part);if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw new Error('Linked runtime directory refused');}
function run(command,args){const result=spawnSync(command,args,{cwd:root,windowsHide:true,shell:false,stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);}
const python=path.join(directory,process.platform==='win32'?'Scripts/python.exe':'bin/python');
if(!fs.existsSync(python))run(process.env.STUDY_IMAGE_BOOTSTRAP_PYTHON||'python',['-m','venv',directory]);
run(python,['-m','pip','install','--disable-pip-version-check','-r',path.join(root,'scripts/processing/requirements-imagegen.txt')]);
run(python,['-c',"import openai,inspect,PIL; assert 'output_format' in inspect.signature(openai.resources.images.Images.generate).parameters;print('Image runtime ready; openai='+openai.__version__)"]);
