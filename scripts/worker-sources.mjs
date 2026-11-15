import {readFile} from 'node:fs/promises';

const paths=['public/analysis-samples.js','public/story-tags-core.js','worker/story-tags.js','public/skin-spots-core.js','public/apparent-age-core.js','public/appearance-core.js','public/face-session-core.js','public/actiwatch-core.js','worker/actiwatch.js','worker/activity.js','worker/scheduler.js','public/health-rules-core.js','worker/health-analysis.js','worker/readings.js','worker/personal.js','worker/photos.js','worker/stories.js','worker/local-reply.js','worker/speech.js','worker/training.js','worker/book.js','worker/compose.js','worker/media-analysis.js','worker/index.js'];

export async function readWorkerSource(root=new URL('../',import.meta.url)){
  const sources=[...paths];sources.splice(sources.indexOf('worker/index.js'),0,'worker/research-evidence.js','public/research-core.js','worker/research.js');
  return (await Promise.all(sources.map(path=>readFile(new URL(path,root),'utf8')))).join('\n');
}
