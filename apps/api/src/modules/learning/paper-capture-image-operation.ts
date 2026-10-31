import {ServiceUnavailableException} from '@nestjs/common';
let operations=0;
/** Upload completion and page editing share the same process-wide image budget. */
export function beginPaperImageOperation(){
 if(operations>=2)throw new ServiceUnavailableException('图片正在处理中，请稍后继续原操作。');operations++;
 let released=false;return()=>{if(!released){released=true;operations--;}};
}
