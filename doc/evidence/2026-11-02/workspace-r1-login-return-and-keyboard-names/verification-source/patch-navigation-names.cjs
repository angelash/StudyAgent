// Replaces English sidebar names in browser tests with the visible Chinese labels now used as accessible names.
const fs=require('node:fs'),path=require('node:path');const root=path.resolve(__dirname,'../../..');const map={"Home":"首页","Courses":"课程","Calendar":"学习动态","History":"历史","Materials":"资料","AI Whiteboards":"AI白板"};
const files=['assistant-guidance','assistant-conversations','chemistry','course-assistant','learning-home','reference-navigation','studio-assistant','studio','workspace'].map(name=>'tests/e2e/'+name+'.spec.ts');
let total=0;for(const file of files){const full=path.join(root,file);let s=fs.readFileSync(full,'utf8'),count=0;
  // Only role/name locators and the studio view helper; keyboard presses such as press('Home') stay unchanged.
  s=s.replace(/(name: ?)'(Home|Courses|Calendar|History|Materials|AI Whiteboards)'/g,(m,p,n)=>{count++;return p+"'"+map[n]+"'";});
  if(file.endsWith('/studio.spec.ts')){s=s.replace("name: 'Home' | 'Courses' | 'Calendar' | 'Materials'",()=>{count++;return "name: '首页' | '课程' | '学习动态' | '资料'";});s=s.replace(/selectWorkspaceView\(page, '(Home|Courses|Calendar|Materials)'\)/g,(m,n)=>{count++;return "selectWorkspaceView(page, '"+map[n]+"')";});}
  if(!count)throw Error('no replacement in '+file);fs.writeFileSync(full,s);total+=count;console.log(file+' '+count);}
console.log('total '+total);
