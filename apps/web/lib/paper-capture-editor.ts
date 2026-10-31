import type {PaperCaptureEditor,PaperCaptureGroupView,PaperCapturePageView} from '@study-agent/contracts';

/** These checks never rebase saved input. The caller may establish a new base
 * only after the user has compared the actual original page or group. */
export function requirePaperCapturePageBase(editor:PaperCaptureEditor|undefined,page:PaperCapturePageView){
 const base=editor?.pageBases.find(base=>base.pageId===page.id);
 if(!base||base.revision!==page.revision||base.selectedVersionFingerprint!==page.selectedVersionFingerprint)throw Error('这张原页的编辑依据已变化或尚未核对。当前输入仍保留，请先对照原页确认。');
 if(!page.canEdit)throw Error('当前账号可以核对这张原页；采用新处理版本需要原作者确认。');
 return base;
}
export function requirePaperCaptureGroupBase(editor:PaperCaptureEditor|undefined,group:PaperCaptureGroupView,writing=false){
 const base=editor?.groupBases.find(base=>base.groupId===group.id);
 if(!base||base.revision!==group.revision||base.fingerprint!==group.current.fingerprint)throw Error('这个采集组的编辑依据已变化或尚未核对。当前页序和输入仍保留，请先对照原组确认。');
 if(writing&&!group.canEdit)throw Error('修改采集组的页序和用途需要原作者确认。');
 return base;
}
