(() => {
  const cyan = '#79e9ff', amber = '#f9b65c';
  function line(c, points, color, width = 1) {
    c.strokeStyle = color; c.lineWidth = width; c.beginPath();
    points.forEach(([x,y], i) => i ? c.lineTo(x,y) : c.moveTo(x,y)); c.stroke();
  }
  function ring(c, x, y, radius, time, color) {
    c.save(); c.translate(x,y); c.strokeStyle = color; c.shadowColor = color; c.shadowBlur = 8;
    for (let i = 0; i < 3; i++) {
      c.lineWidth = i === 1 ? 3 : 1; c.beginPath();
      c.arc(0,0,radius+i*8,time*.00008*(i%2?-1:1)+i*2,time*.00008*(i%2?-1:1)+i*2+4.1); c.stroke();
    }
    c.shadowBlur = 0; c.lineWidth = 1;
    for (let i=0;i<48;i++) { const a=i*Math.PI/24; line(c,[[Math.cos(a)*(radius+22),Math.sin(a)*(radius+22)],[Math.cos(a)*(radius+(i%4?26:31)),Math.sin(a)*(radius+(i%4?26:31))]],color); }
    c.restore();
  }
  function backdrop(c) {
    const glow=c.createRadialGradient(640,310,30,640,360,700);
    glow.addColorStop(0,'#17303a'); glow.addColorStop(.55,'#061016'); glow.addColorStop(1,'#010305');
    c.fillStyle=glow;c.fillRect(0,0,1280,720);
    c.fillStyle='#04080c';
    for(const points of [[[0,0],[395,0],[320,70],[235,140],[170,300],[0,360]],[[1280,0],[885,0],[960,70],[1045,140],[1110,300],[1280,360]]]) {
      c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill();
    }
  }
  function portrait(c, image, zoom = 1.45) {
    const w=image.width,h=image.height,scale=Math.max(1280/w,720/h)*Math.max(1,Math.min(2.5,zoom));
    c.save();c.filter='brightness(.8) contrast(1.08) saturate(.78)';
    c.translate(1280,0);c.scale(-1,1);
    c.drawImage(image,(1280-w*scale)/2,300-h*.38*scale,w*scale,h*scale);c.restore();
  }
  function hud(c, {time, active, recording, seconds, name, location, entry, audio}) {
    c.save();
    const shade=c.createRadialGradient(640,305,150,640,345,610);
    shade.addColorStop(0,'#01070b00');shade.addColorStop(.58,'#01070b18');shade.addColorStop(.83,'#01070bd9');shade.addColorStop(1,'#010305');
    c.fillStyle=shade;c.fillRect(0,0,1280,720);
    // Боковая оптика и дуги повторяют композицию референса, числовых медицинских показателей нет.
    for(const side of [-1,1]) {
      c.save();c.translate(side===-1?0:1280,0);c.scale(side===-1?1:-1,1);
      line(c,[[25,36],[260,36],[332,83],[365,151]],'#467688',2);
      line(c,[[14,56],[240,56],[300,100]],'#163541',5);
      line(c,[[18,658],[245,658],[306,603],[350,603]],cyan,1.5);
      line(c,[[35,640],[245,640],[287,600]],'#28647a',4);
      line(c,[[20,205],[95,235],[125,352],[88,470],[20,494]],'#22546b',2);
      for(let i=0;i<5;i++)line(c,[[25,249+i*29],[65,257+i*29]],i===2?amber:'#3c7e93',i===2?3:1);
      c.restore();
    }
    ring(c,197,303,60,time,cyan);ring(c,1095,408,76,-time,cyan);ring(c,1045,171,30,time,amber);
    c.font='12px monospace';c.fillStyle='#9de9f5';
    c.fillText('CAMERA / '+(active?'CONNECTED':'OFFLINE'),86,411);
    c.fillText('AUDIO / '+(audio?'CONNECTED':'OFFLINE'),86,433);
    c.fillText('LOCAL VIDEO LOG',991,537);
    line(c,[[112,455],[256,455],[286,480],[339,480]],'#62d6ed');
    line(c,[[948,557],[1082,557],[1150,586]],'#62d6ed');
    c.fillStyle=amber;c.font='11px monospace';c.fillText('MISSION HEALTH / HELMET',89,100);
    c.fillStyle=cyan;c.font='bold 18px monospace';c.fillText('LOG '+String(entry).padStart(3,'0'),89,128);
    c.fillStyle=recording?'#ff674f':amber;c.font='bold 18px monospace';
    const duration=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
    c.fillText(recording?'REC  '+duration:active?'STANDBY':'CAMERA OFF',988,100);
    if(recording){c.beginPath();c.arc(970,94,5,0,Math.PI*2);c.fill();}
    const bottom=c.createLinearGradient(0,535,0,720);bottom.addColorStop(0,'#01060900');bottom.addColorStop(1,'#010609f2');c.fillStyle=bottom;c.fillRect(0,535,1280,185);
    c.fillStyle='#8ab2bc';c.font='11px monospace';c.fillText('RESEARCHER / PERSONAL DIARY',402,615);
    c.fillStyle='#d7faff';c.font='24px monospace';c.fillText(name,402,648,560);
    c.fillStyle=cyan;c.font='13px monospace';c.fillText('LOCATION: '+location,402,677,560);
    c.fillStyle='#77b6c5';c.font='11px monospace';c.fillText(new Date().toLocaleTimeString('en-GB',{hour12:false}),1090,678);
    if(!active){c.fillStyle='#70a1b0';c.font='14px monospace';c.textAlign='center';c.fillText('ВКЛЮЧИ КАМЕРУ / ЛИЦО ПО ЦЕНТРУ',640,363);}
    c.restore();
  }
  window.missionHelmet={backdrop,portrait,hud};
})();
