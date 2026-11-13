(() => {
  const domain=['Space','NASA','AstronautLife','MissionHealth','BugBusters'];
  const normalize=value=>String(value||'').normalize('NFKC').replace(/[\u2013\u2014]/g,'-');
  const meaningful=value=>/[\p{L}]{2}/u.test(normalize(value));
  const cat=/\b(?:cats?|kittens?|feline)\b/iu;
  const kitten=/\bkittens?\b/iu;
  const animal=/\b(?:cats?|kittens?|dogs?|pupp(?:y|ies)|birds?|pets?)\b/iu;
  const themes=[
    ['SleepHealth',/\b(?:sleep|slept|nap|insomnia)\b/iu],
    ['RestAndRecovery',/\b(?:recovery|recover(?:ing|ed)?|rest(?:ing|ed)?|relax(?:ing|ed)?)\b/iu],
    ['CrewFitness',/\b(?:workout|exercise|training|fitness|cycling)\b/iu],
    ['Running',/\b(?:run|running|jogging)\b/iu],
    ['Wellbeing',/\b(?:wellbeing|well-being|feeling)\b/iu],
    ['FatigueAwareness',/\b(?:fatigue|tired|exhausted)\b/iu],
    ['Mindfulness',/\b(?:mindful|mindfulness|calm|quiet)\b/iu],
    ['MentalWellbeing',/\b(?:stress|anxiety|mood)\b/iu],
    ['Nutrition',/\b(?:nutrition|meal|food|breakfast|dinner)\b/iu],
    ['Hydration',/\b(?:water|hydration|thirst)\b/iu],
    ['EarthObservation',/\bearth\b|home\s*planet/iu],
    ['LifeOnISS',/\biss\b|microgravity|zero.?g/iu],
    ['Spacewalk',/\b(?:spacewalk|eva)\b/iu],
    ['Spaceflight',/\b(?:spaceflight|orbit|launch|rocket)\b/iu],
    ['MoonExploration',/\b(?:moon|lunar|artemis)\b/iu],
    ['MarsExploration',/\b(?:mars|martian)\b/iu],
    ['SpaceResearch',/\b(?:research|experiment|sample|science)\b/iu],
    ['Biomarkers',/\b(?:biomarker|glucose|blood.*test)\b/iu],
    ['VitalSigns',/\b(?:heart.?rate|vital.?signs|blood.?pressure)\b/iu],
    ['Teamwork',/\b(?:crew|team|teammate|together)\b/iu],
    ['MissionControl',/\bmission.?control\b/iu],
    ['SpaceApps',/\b(?:hackathon|space.?apps)\b/iu],
    ['ArtificialIntelligence',/\b(?:ai|machine.?learning|embedding|neural)\b/iu],
    ['Engineering',/\b(?:code|coding|development|sensor|robot|engineering)\b/iu],
    ['Photography',/\b(?:photo|photography|camera)\b/iu],
    ['Nature',/\b(?:nature|forest|flowers)\b/iu],
    ['Learning',/\b(?:learning|studying|reading|learned)\b/iu],
    ['Music',/\b(?:music|song|guitar)\b/iu],
    ['Gratitude',/\b(?:gratitude|thankful|thanks)\b/iu]
  ];
  function englishTag(value){
    if(typeof value!=='string')return null;
    const raw=value.trim().replace(/^#/,'');if(!/^[A-Za-z][A-Za-z0-9 ]{1,45}$/.test(raw))return null;
    const tag=raw.includes(' ')?raw.split(/ +/).map(word=>word[0].toUpperCase()+word.slice(1)).join(''):raw;
    return tag.length<=36?tag:null;
  }
  function finalize(values){
    const seen=new Set(domain.map(tag=>tag.toLowerCase())),tags=[];
    for(const value of Array.isArray(values)?values:[]){const tag=englishTag(value),key=tag?.toLowerCase();if(tag&&!seen.has(key)){seen.add(key);tags.push(tag);}if(tags.length===3)break;}
    return [...tags,...domain].map(tag=>'#'+tag);
  }
  function generate(value){
    const text=normalize(value);if(!meaningful(text))return [];
    const tags=[];
    if(cat.test(text)){
      if(/\brescu(?:e|ed|ing)\b/iu.test(text))tags.push('CatRescue');
      if(/\b(?:adopt|adopted|adoption)\b/iu.test(text))tags.push('PetAdoption');
      tags.push(kitten.test(text)?'Kittens':'Cats');
    }else if(/\b(?:dogs?|pupp(?:y|ies))\b/iu.test(text))tags.push('Dogs');
    if(animal.test(text)&&/\b(?:caught|met|found)\b/iu.test(text))tags.push('AnimalEncounters');
    for(const [tag,pattern]of themes)if(pattern.test(text))tags.push(tag);
    if(!tags.length)tags.push('CrewStories');
    return finalize(tags);
  }
  function parse(value){
    if(typeof value!=='string'||value.length>5000)return [];
    try{const data=JSON.parse(value.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'')),tags=Array.isArray(data)?data:data?.tags;if(!Array.isArray(tags))return [];const seen=new Set(domain.map(tag=>tag.toLowerCase())),result=[];for(const value of tags){const tag=englishTag(value),key=tag?.toLowerCase();if(tag&&!seen.has(key)){seen.add(key);result.push(tag);}if(result.length===3)break;}return result;}catch{return [];}
  }
  globalThis.MissionStoryTagsCore=Object.freeze({normalize,meaningful,generate,finalize,parse});
})();
