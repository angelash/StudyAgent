import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { normalizeImage,withMediaDecoder } from '../student-media/media-normalization';
import { retentionDigest } from '../diagnostics/retention-anchor';

import {paperImageSourceSchema,paperImageTransformSchema,type PaperImageSource,type PaperImageTransform,type PaperImageVersion} from '@study-agent/contracts';
export {paperImageSourceSchema,paperImageTransformSchema,type PaperImageSource,type PaperImageTransform,type PaperImageVersion} from '@study-agent/contracts';

const boxSchema=z.object({x:z.number().min(0),y:z.number().min(0),width:z.number().positive(),height:z.number().positive()}).strict();
const digest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');

/** A verified original supplies identity. Cropping never replaces it or changes its coordinate system. */
export function paperImageVersion(original:PaperImageSource,value:unknown):PaperImageVersion{
 const source=paperImageSourceSchema.parse(original),transform=paperImageTransformSchema.parse(value),{crop,rotation}=transform;
 if(retentionDigest(source)!==retentionDigest(original)||source.width*source.height>20_000_000||crop.x+crop.width>source.width||crop.y+crop.height>source.height)throw Error('invalid_paper_image_bounds');
 const result={protocol:'paper-image-version-v1' as const,pageId:source.pageId,originalSha256:source.originalSha256,baselineSha256:source.baselineSha256,coordinateSpace:'normalized-original-pixels-v1' as const,transform,width:rotation%180?crop.height:crop.width,height:rotation%180?crop.width:crop.height};
 return{...result,fingerprint:retentionDigest(result)};
}
export function assertPaperImageVersion(value:PaperImageVersion,source:PaperImageSource){
 const original=paperImageVersion(source,value.transform);if(retentionDigest(original)!==retentionDigest(value))throw Error('paper_image_source_version_mismatch');return original;
}

/** Continuous pixel-edge coordinates, so boxes map exactly across all four right-angle rotations. */
export function captureBoxToOriginal(source:PaperImageSource,version:PaperImageVersion,box:{x:number;y:number;width:number;height:number}){
 assertPaperImageVersion(version,source);box=boxSchema.parse(box);if(box.x+box.width>version.width||box.y+box.height>version.height)throw Error('invalid_paper_capture_box');
 const{crop,rotation}=version.transform,point=(x:number,y:number)=>{const local=rotation===0?[x,y]:rotation===90?[y,crop.height-x]:rotation===180?[crop.width-x,crop.height-y]:[crop.width-y,x];return{x:crop.x+local[0],y:crop.y+local[1]};},corners=[point(box.x,box.y),point(box.x+box.width,box.y),point(box.x,box.y+box.height),point(box.x+box.width,box.y+box.height)],x=Math.min(...corners.map(row=>row.x)),y=Math.min(...corners.map(row=>row.y));
 return{coordinateSpace:version.coordinateSpace,pageId:version.pageId,originalSha256:source.originalSha256,baselineSha256:source.baselineSha256,x,y,width:Math.max(...corners.map(row=>row.x))-x,height:Math.max(...corners.map(row=>row.y))-y};
}

/** Bytes only. The future upload service must separately authorize and bind its actual stored original. */
export async function renderPaperCaptureImage(input:Buffer,declared:PaperImageSource['originalMediaType'],expectedSha256:string,pageId:string,transform?:unknown){
 if(!Buffer.isBuffer(input)||input.length<5||input.length>12*1024*1024||!['image/png','image/jpeg'].includes(declared)||digest(input)!==expectedSha256)throw Error('paper_image_original_bytes_mismatch');
 return withMediaDecoder(async()=>{
  const baseline=await normalizeImage(input,declared),source:PaperImageSource={protocol:'paper-image-source-v1',pageId,originalSha256:expectedSha256,originalBytes:input.length,originalMediaType:declared,baselineSha256:digest(baseline.bytes),width:baseline.width,height:baseline.height},version=paperImageVersion(source,transform===undefined?{crop:{x:0,y:0,width:baseline.width,height:baseline.height},rotation:0}:transform);
  // Explicitly finish extraction before rotation. Sharp can reorder operations
  // in one pipeline; using two buffers preserves the original crop coordinate frame.
  const cropped=await sharp(baseline.bytes,{limitInputPixels:20_000_000,failOn:'warning'}).extract({left:version.transform.crop.x,top:version.transform.crop.y,width:version.transform.crop.width,height:version.transform.crop.height}).png().toBuffer();
  const{data,info}=await sharp(cropped,{limitInputPixels:20_000_000,failOn:'warning'}).rotate(version.transform.rotation).png({compressionLevel:6}).toBuffer({resolveWithObject:true});
  if(info.width!==version.width||info.height!==version.height||!data.length||data.length>40*1024*1024)throw Error('paper_image_rendered_dimensions_mismatch');
  return{source,version,bytes:data,baselineBytes:baseline.bytes,receipt:{protocol:'paper-image-render-v1' as const,versionFingerprint:version.fingerprint,sha256:digest(data),bytes:data.length,width:info.width,height:info.height,mediaType:'image/png' as const,renderer:'sharp-'+sharp.versions.sharp+'/vips-'+sharp.versions.vips}};
 });
}
