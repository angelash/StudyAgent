export const adminWorkspaceEntries = [
  { id:'curriculum',label:'课程与覆盖',path:'/admin/curriculum',roles:['teacher','admin'] },
  { id:'content',label:'内容与题目',path:'/admin/content',roles:['admin'] },
  { id:'imports',label:'资料导入',path:'/admin/imports',roles:['admin'] },
  { id:'reviews',label:'作答复核',path:'/admin/reviews',roles:['teacher','admin'] },
  { id:'measurement',label:'测量素材',path:'/admin/measurement',roles:['teacher','admin'] },
  { id:'analytics',label:'运营分析',path:'/admin/analytics',roles:['admin'] },
  { id:'gesp',label:'GESP教研',path:'/admin/gesp',roles:['teacher','admin'] },
  { id:'ai-tools',label:'AI教研',path:'/admin/ai-tools',roles:['admin'] },
  { id:'accounts',label:'账号权限',path:'/admin/accounts',roles:['admin'] },
] as const;
export function allowedAdminWorkspace(role: string, pathname: string) {
  const entry=adminWorkspaceEntries.find(item=>item.path===pathname);
  return Boolean(entry&&(entry.roles as readonly string[]).includes(role));
}
