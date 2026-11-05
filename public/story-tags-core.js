(() => {
  const domain=['Space','NASA','AstronautLife','MissionHealth','BugBusters'];
  const normalize=value=>String(value||'').normalize('NFKC').replaceAll('\u0451','\u0435').replaceAll('\u0401','\u0415').replace(/[\u2013\u2014]/g,'-');
  const meaningful=value=>/[\p{L}]{2}/u.test(normalize(value));
  const cat=/(?:кот[еаи]?н|кат[еа]?н|кошк|котик|(?<!\p{L})кот(?:а|у|ом|ы|ов)?(?!\p{L})|\b(?:cats?|kittens?|feline)\b)/iu;
  const kitten=/(?:кот[еа]?н|кат[еа]?н|\bkittens?\b)/iu;
  const animal=/(?:кот|катен|кошк|собак|щен|птиц|\b(?:cats?|kittens?|dogs?|pupp(?:y|ies)|birds?|pets?)\b)/iu;
  const themes=[
    ['SleepHealth',/(?<!\p{L})(?:сон|сна|сном|спал|спала|спать|сплю|уснул|проснулся)(?!\p{L})|\b(?:sleep|slept|nap|insomnia)\b/iu],
    ['RestAndRecovery',/восстан[оа]в|отдых|отдох|\b(?:recovery|recover|rest|relax)\b/iu],
    ['CrewFitness',/трениров|упражнен|физнагруз|спорт|\b(?:workout|exercise|training|fitness|cycling)\b/iu],
    ['Running',/пробеж|бег[ау]?\b|\b(?:run|running|jogging)\b/iu],
    ['Wellbeing',/самочувств|чувствую|состояни|\b(?:wellbeing|well-being|feeling)\b/iu],
    ['FatigueAwareness',/устал|утом|\b(?:fatigue|tired|exhausted)\b/iu],
    ['Mindfulness',/спокой|медитац|тишин|\b(?:mindful|mindfulness|calm|quiet)\b/iu],
    ['MentalWellbeing',/стресс|тревог|напряжен|настроен|\b(?:stress|anxiety|mood)\b/iu],
    ['Nutrition',/питани|поел|поела|обед|завтрак|ужин|еда\b|\b(?:nutrition|meal|food|breakfast|dinner)\b/iu],
    ['Hydration',/вода|воды|воду|пить|жажд|гидрат|\b(?:water|hydration|thirst)\b/iu],
    ['EarthObservation',/земл|\bearth\b|home\s*planet/iu],
    ['LifeOnISS',/иллюминатор|невесом|\biss\b|мкс|microgravity|zero.?g/iu],
    ['Spacewalk',/выход.*открыт.*космос|внекорабельн|\b(?:spacewalk|eva)\b/iu],
    ['Spaceflight',/космо|орбит|полет|запуск|\b(?:spaceflight|orbit|launch|rocket)\b/iu],
    ['MoonExploration',/лун[аеуы]|\b(?:moon|lunar|artemis)\b/iu],
    ['MarsExploration',/марс|\b(?:mars|martian)\b/iu],
    ['SpaceResearch',/исслед|эксперимент|образ[ецы]|наук|\b(?:research|experiment|sample|science)\b/iu],
    ['Biomarkers',/биомаркер|глюкоз|анализ.*кров|\b(?:biomarker|glucose|blood.*test)\b/iu],
    ['VitalSigns',/пульс|давлен|spo2|\b(?:heart.?rate|vital.?signs|blood.?pressure)\b/iu],
    ['Teamwork',/экипаж|команд|коллег|\b(?:crew|team|teammate|together)\b/iu],
    ['MissionControl',/центр.*управлен|\bmission.?control\b/iu],
    ['SpaceApps',/хакатон|\b(?:hackathon|space.?apps)\b/iu],
    ['ArtificialIntelligence',/нейро|искусственн.*интеллект|\b(?:ai|machine.?learning|embedding|neural)\b/iu],
    ['Engineering',/програм|разработ|датчик|робот|инженер|\b(?:code|coding|development|sensor|robot|engineering)\b/iu],
    ['Photography',/фото|снимок|съемк|\b(?:photo|photography|camera)\b/iu],
    ['Nature',/природ|лес[ау]?\b|цвет[уы]|\b(?:nature|forest|flowers)\b/iu],
    ['Learning',/учеб|изуч|узнал|прочитал|\b(?:learning|studying|reading|learned)\b/iu],
    ['Music',/музык|песн|\b(?:music|song|guitar)\b/iu],
    ['Gratitude',/благодар|спасибо|\b(?:gratitude|thankful|thanks)\b/iu]
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
      if(/спас|выручил|\brescu(?:e|ed|ing)\b/iu.test(text))tags.push('CatRescue');
      if(/приют|взял.*дом|\b(?:adopt|adopted|adoption)\b/iu.test(text))tags.push('PetAdoption');
      tags.push(kitten.test(text)?'Kittens':'Cats');
    }else if(/собак|щен|\b(?:dogs?|pupp(?:y|ies))\b/iu.test(text))tags.push('Dogs');
    if(animal.test(text)&&/пойма|встрет|наш[ео]л|\b(?:caught|met|found)\b/iu.test(text))tags.push('AnimalEncounters');
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
