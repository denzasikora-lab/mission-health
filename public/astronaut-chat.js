(() => {
  const members=typeof crew==='undefined'?[]:crew.filter(person=>person&&person.id&&person.name&&person.photo).slice(0,3);
  const scenarios={
    'jessica-meir':'Good morning, crew. After checking the sensors, let’s review the shift plan.',
    'jack-hathaway':'Understood. I will start with equipment and log the results.',
    'christina-koch':'I will prepare the observation materials. Let’s compare notes after lunch.'
  };
  const create=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  const initials=name=>String(name||'Participant').trim().split(/\s+/).slice(0,2).map(part=>Array.from(part)[0]||'').join('').toUpperCase();
  function portrait(person){const image=create('img','astronaut-chat-avatar');image.src=person.photo;image.alt='';image.loading='lazy';image.width=32;image.height=32;return image;}
  function decorateHost(host,active){
    host.classList.toggle('astronaut-chat',Boolean(active));
    let participants=host.querySelector('.astronaut-chat-participants');
    if(!active){if(participants)participants.hidden=true;return;}
    if(!participants){
      participants=create('div','astronaut-chat-participants');
      const portraits=create('div','astronaut-chat-portraits');portraits.setAttribute('aria-hidden','true');
      for(const member of members)portraits.append(portrait(member));
      const details=create('div','astronaut-chat-participant-copy');details.append(create('strong','','Profiles NASA'),create('span','',members.map(person=>person.name.split(' ')[0]).join(' · ')));
      participants.append(portraits,details);
      const heading=host.querySelector('.personal-conversation-heading');if(heading)heading.after(participants);else host.prepend(participants);
    }
    participants.hidden=false;
  }
  function render(list,entries,messageNode){
    list.classList.add('astronaut-chat-messages');list.replaceChildren();
    if(members.length){
      list.append(create('div','astronaut-chat-scenario-title','Scripted astronaut conversation'));
      members.forEach((person,index)=>{
        const row=create('article','astronaut-chat-row astronaut-chat-row--scenario'),bubble=create('div','astronaut-chat-scenario-bubble'),header=create('header');
        header.append(create('strong','',person.name),create('span','astronaut-chat-scenario-badge','Scenario'));
        bubble.append(header,create('p','',scenarios[person.id]||'Let’s review the shift plan and save our observations in the log.'),create('time','',`09:${String(10+index*2).padStart(2,'0')}`));
        row.append(portrait(person),bubble);list.append(row);
      });
    }
    if(entries.length)list.append(create('div','astronaut-chat-live-title','Participant messages'));
    for(const entry of entries){
      const row=create('div','astronaut-chat-row'+(entry.isOwn?' astronaut-chat-row--own':'')),avatar=create('span','astronaut-chat-avatar astronaut-chat-initials',initials(entry.authorName));
      avatar.setAttribute('aria-hidden','true');
      const bubble=messageNode(entry);bubble.classList.add('astronaut-chat-live-bubble');row.append(avatar,bubble);list.append(row);
    }
  }
  window.missionAstronautChat={render,decorateHost};
})();
