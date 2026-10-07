const translations={
  "en": {
    "locale": "en-GB",
    "missionDay": "Mission day 142",
    "simulated": "Simulated data",
    "appearance": "Appearance",
    "lightTheme": "Light theme",
    "darkTheme": "Dark theme",
    "language": "Language",
    "eyebrow": "Mission dashboard",
    "headline": "Crew health overview",
    "intro": "Review readings, compare personal baselines, and explore the research behind each signal.",
    "challenge": "2026 challenge brief",
    "crewMembers": "Astronaut profiles",
    "crew": "Astronauts",
    "memberCount": "3 profiles",
    "missionContext": "Mission context",
    "demoMission": "Demo mission, day 142",
    "latestSample": "Latest crew sample: 08:42 UTC",
    "fictional": "Real NASA profiles. All health readings and journal scenarios are simulated.",
    "dashboard": "Health dashboard",
    "measurements": "Current measurements",
    "trend": "Reading trend",
    "chartPeriod": "Chart period",
    "periodDay": "24 hours",
    "periodWeek": "7 days",
    "sampleReadings": "Sample readings",
    "readingContext": "Reading context",
    "recentActivity": "Recent activity",
    "assessmentResearch": "Assessment and research",
    "currentAssessment": "Current assessment",
    "signals": "Signals to review",
    "nextCheck": "Next check",
    "disclaimer": "Demo rules compare fictional readings with fictional baselines. This is not a medical device or diagnosis.",
    "researchContext": "Research context",
    "researchIntro": "Public NASA material related to the selected signal. It does not interpret an individual's reading.",
    "findMaterial": "Find background material",
    "find": "Find",
    "placeholder": "e.g. cardiovascular risk",
    "footer": "Mission Health concept prototype. No live telemetry or clinical decision support.",
    "sourcesLabel": "Sources:",
    "sourceProgram": "NASA Human Research Program",
    "deepSpace": "Demo scenario",
    "sampleAt": "Sample at",
    "changed": "Changed from baseline",
    "near": "Near baseline",
    "baseline": "Personal baseline",
    "restingBaseline": "Resting baseline",
    "reportedBaseline": "Reported baseline",
    "metrics": {
      "hr": "Heart rate",
      "spo2": "Blood oxygen",
      "temp": "Body temperature",
      "fatigue": "Fatigue index"
    },
    "units": {
      "hr": "bpm"
    },
    "status": {
      "attention": "ATTENTION",
      "normal": "NORMAL",
      "review": "REVIEW"
    },
    "contextLabels": [
      "Last activity",
      "Sleep",
      "Mission day",
      "Sensor quality"
    ],
    "good": "Good",
    "hoursShort": "h",
    "minutesShort": "min",
    "yesterday": "Yesterday",
    "activities": [
      "Exercise",
      "Maintenance",
      "EVA preparation"
    ],
    "events": [
      "Several readings changed together",
      "Routine sample received",
      "Trend change detected"
    ],
    "activityLogged": "Activity session logged",
    "previousSample": "Previous baseline sample",
    "axisDay": [
      "24 h ago",
      "18 h",
      "12 h",
      "6 h",
      "Now"
    ],
    "axisWeek": [
      "7 days ago",
      "5 days",
      "3 days",
      "Yesterday",
      "Now"
    ],
    "sourceTitles": [
      "Risks of human spaceflight",
      "Risk of cardiovascular adaptations",
      "Human Research Program"
    ],
    "sourceDescriptions": [
      "Overview of physiological and behavioral risks researched for long-duration missions.",
      "How weightlessness can change circulation and cardiovascular function.",
      "NASA's research program for astronaut health and performance."
    ],
    "noMatch": "No match in this prototype",
    "searchHint": "Try heart, oxygen, fatigue, or health.",
    "openSource": "Open NASA source",
    "metaDescription": "Mission health monitoring with simulated readings, personal baselines, and NASA research context.",
    "people": [
      {
        "name": "Jessica Meir",
        "role": "Active NASA astronaut",
        "assessment": "Multiple changes need review",
        "description": "Several values differ in this simulated scenario. Repeat the sample and review the mission protocol.",
        "signals": [
          "Heart rate is above personal baseline",
          "Blood oxygen is below personal baseline",
          "Temperature is above personal baseline"
        ],
        "next": "Repeat the measurements, confirm sensor placement, and follow the crew's established medical procedure."
      },
      {
        "name": "Jack Hathaway",
        "role": "Active NASA astronaut",
        "assessment": "Readings near baseline",
        "description": "This simulated scenario remains close to the fictional baseline.",
        "signals": [
          "No significant change in the latest sample"
        ],
        "next": "Continue routine monitoring and review after the next scheduled sample."
      },
      {
        "name": "Christina Koch",
        "role": "Active NASA astronaut",
        "assessment": "Trend merits a second look",
        "description": "This simulated heart-rate trend is gradually changing. Other readings remain near baseline.",
        "signals": [
          "Heart rate has risen across recent samples",
          "Other measurements remain near baseline"
        ],
        "next": "Check activity context and repeat the reading at the next scheduled interval."
      }
    ],
    "biography": "NASA biography",
    "profileSimulation": "Simulated health readings",
    "healthTab": "Health overview",
    "journalTab": "Chat & diary",
    "viewLabel": "Profile view",
    "periodMinute": "1 minute",
    "periodHour": "1 hour",
    "periodMonth": "1 month",
    "periodYear": "1 year",
    "journalTitle": "Personal journal",
    "journalIntro": "Your prototype journal for this profile. These are not the astronaut’s real entries.",
    "journalEmpty": "Start with a daily check-in",
    "journalEmptyText": "Record sleep, energy, activity or a question. Each profile has a separate history.",
    "noteMode": "Diary entry",
    "askMode": "Ask assistant",
    "composerLabel": "Write a diary entry or question",
    "composerPlaceholder": "How did you sleep? How do you feel after exercise?",
    "send": "Save entry",
    "sendAsk": "Send question",
    "sending": "Saving…",
    "loading": "Loading journal…",
    "you": "You",
    "assistant": "Assistant",
    "journalSaved": "Saved on server",
    "memoryReady": "Semantic memory connected",
    "memoryOffline": "Semantic memory is not connected",
    "aiReady": "Assistant connected",
    "aiOffline": "Assistant is not connected",
    "pendingIndex": "Awaiting memory indexing",
    "indexed": "Added to memory",
    "saved": "Entry saved",
    "loadError": "Could not load the journal. Try again.",
    "saveError": "Could not save. Your draft is still here.",
    "retry": "Try again",
    "searchDiary": "Search this journal",
    "searchDiaryPlaceholder": "e.g. sleep after exercise",
    "searchDiaryButton": "Search",
    "searchEmpty": "No matching entries yet.",
    "memoryMatches": "Relevant journal entries",
    "memoryUnavailable": "Semantic search is not connected yet.",
    "aiUnavailable": "The assistant needs a connected language model. You can still save diary entries.",
    "promptSleep": "Log sleep",
    "promptExercise": "After exercise",
    "promptRecall": "Recall this week",
    "promptTextSleep": "I slept for 6 hours. My energy is 4 out of 10. Today’s activity:",
    "promptTextExercise": "After exercise I felt: . My heart rate returned to baseline after: .",
    "promptTextRecall": "What did I record about sleep and fatigue this week?",
    "demoNote": "Prototype journal",
    "photoCredit": "Profile photos: NASA. This prototype is not endorsed by NASA.",
    "journalOlder": "Load earlier entries",
    "noOlder": "Beginning of journal",
    "searching": "Searching…",
    "history": "History",
    "periods": {
      "1m": "1 minute",
      "1h": "1 hour",
      "24h": "24 hours",
      "7d": "7 days",
      "1mo": "1 month",
      "1y": "1 year"
    },
    "axes": {
      "1m": [
        "60 s ago",
        "45 s",
        "30 s",
        "15 s",
        "Now"
      ],
      "1h": [
        "60 min ago",
        "45 min",
        "30 min",
        "15 min",
        "Now"
      ],
      "1mo": [
        "30 days ago",
        "22 days",
        "15 days",
        "7 days",
        "Now"
      ],
      "1y": [
        "1 year ago",
        "9 months",
        "6 months",
        "3 months",
        "Now"
      ],
      "24h": [
        "24 h ago",
        "18 h",
        "12 h",
        "6 h",
        "Now"
      ],
      "7d": [
        "7 days ago",
        "5 days",
        "3 days",
        "Yesterday",
        "Now"
      ]
    }
  },
  "zh": {
    "locale": "zh-CN",
    "missionDay": "任务第142天",
    "simulated": "模拟数据",
    "appearance": "外观",
    "lightTheme": "浅色主题",
    "darkTheme": "深色主题",
    "language": "语言",
    "eyebrow": "任务仪表板",
    "headline": "乘组健康概览",
    "intro": "查看健康读数，对比个人基线，并了解各项信号相关的研究资料。",
    "challenge": "2026年挑战说明",
    "crewMembers": "航天员档案",
    "crew": "航天员",
    "memberCount": "3个档案",
    "missionContext": "任务背景",
    "demoMission": "演示任务，第142天",
    "latestSample": "最新乘组样本：08:42 UTC",
    "fictional": "真实NASA档案。所有健康读数和日记场景均为模拟。",
    "dashboard": "健康仪表板",
    "measurements": "当前测量值",
    "trend": "读数趋势",
    "chartPeriod": "图表时间范围",
    "periodDay": "24小时",
    "periodWeek": "7天",
    "sampleReadings": "模拟读数",
    "readingContext": "读数背景",
    "recentActivity": "近期活动",
    "assessmentResearch": "评估与研究",
    "currentAssessment": "当前评估",
    "signals": "需复核的信号",
    "nextCheck": "下一项检查",
    "disclaimer": "演示规则将虚构读数与虚构基线进行比较。本原型并非医疗设备，也不提供诊断。",
    "researchContext": "研究背景",
    "researchIntro": "与所选信号相关的NASA公开资料。这些资料不用于解读个人读数。",
    "findMaterial": "查找背景资料",
    "find": "查找",
    "placeholder": "例如：心血管风险",
    "footer": "Mission Health概念原型。未接入实时遥测或临床决策支持。",
    "sourcesLabel": "资料来源：",
    "sourceProgram": "NASA人体研究计划",
    "deepSpace": "演示场景",
    "sampleAt": "采样时间",
    "changed": "偏离基线",
    "near": "接近基线",
    "baseline": "个人基线",
    "restingBaseline": "静息基线",
    "reportedBaseline": "自报基线",
    "metrics": {
      "hr": "心率",
      "spo2": "血氧饱和度",
      "temp": "体温",
      "fatigue": "疲劳指数"
    },
    "units": {
      "hr": "次/分"
    },
    "status": {
      "attention": "注意",
      "normal": "正常",
      "review": "复核"
    },
    "contextLabels": [
      "最近活动",
      "睡眠",
      "任务天数",
      "传感器质量"
    ],
    "good": "良好",
    "hoursShort": "小时",
    "minutesShort": "分钟",
    "yesterday": "昨天",
    "activities": [
      "锻炼",
      "维护",
      "舱外活动准备"
    ],
    "events": [
      "多项读数同时发生变化",
      "收到常规样本",
      "检测到趋势变化"
    ],
    "activityLogged": "已记录活动",
    "previousSample": "前一次基线样本",
    "axisDay": [
      "24小时前",
      "18小时",
      "12小时",
      "6小时",
      "现在"
    ],
    "axisWeek": [
      "7天前",
      "5天",
      "3天",
      "昨天",
      "现在"
    ],
    "sourceTitles": [
      "载人航天风险",
      "心血管适应变化风险",
      "人体研究计划"
    ],
    "sourceDescriptions": [
      "长期航天任务相关生理与行为风险的研究概览。",
      "失重如何改变血液循环及心血管功能。",
      "NASA针对航天员健康与表现的研究计划。"
    ],
    "noMatch": "本原型中未找到匹配资料",
    "searchHint": "可尝试搜索心率、血氧、疲劳或健康。",
    "openSource": "打开NASA资料",
    "metaDescription": "健康监测概念原型，提供模拟读数、个人基线和NASA研究背景。",
    "people": [
      {
        "name": "杰西卡·梅尔",
        "role": "NASA现役航天员",
        "assessment": "多项变化需要复核",
        "description": "模拟场景中的多个数值偏离虚构基线。请重复采样并检查任务规程。",
        "signals": [
          "心率高于个人基线",
          "血氧低于个人基线",
          "体温高于个人基线"
        ],
        "next": "重复测量，确认传感器佩戴位置，并遵循乘组既定的医疗程序。"
      },
      {
        "name": "杰克·哈撒韦",
        "role": "NASA现役航天员",
        "assessment": "读数接近基线",
        "description": "此模拟场景的读数接近虚构基线。",
        "signals": [
          "最新样本没有显著变化"
        ],
        "next": "继续常规监测，在下一次计划采样后复核。"
      },
      {
        "name": "克里斯蒂娜·科赫",
        "role": "NASA现役航天员",
        "assessment": "趋势值得再次查看",
        "description": "模拟心率趋势逐渐变化，其他读数仍接近基线。",
        "signals": [
          "近期多个样本中的心率持续升高",
          "其他测量值仍接近基线"
        ],
        "next": "核查活动背景，并在下一个计划间隔重复测量。"
      }
    ],
    "biography": "NASA个人简介",
    "profileSimulation": "模拟健康读数",
    "healthTab": "健康概览",
    "journalTab": "聊天与日记",
    "viewLabel": "档案视图",
    "periodMinute": "1分钟",
    "periodHour": "1小时",
    "periodMonth": "1个月",
    "periodYear": "1年",
    "journalTitle": "个人日记",
    "journalIntro": "此档案的原型日记，并非该航天员的真实记录。",
    "journalEmpty": "开始每日记录",
    "journalEmptyText": "记录睡眠、精力、活动或问题。每个档案都有独立历史。",
    "noteMode": "日记记录",
    "askMode": "询问助手",
    "composerLabel": "撰写日记或问题",
    "composerPlaceholder": "睡得怎么样？运动后感觉如何？",
    "send": "保存记录",
    "sendAsk": "发送问题",
    "sending": "正在保存…",
    "loading": "正在加载日记…",
    "you": "你",
    "assistant": "助手",
    "journalSaved": "已保存到服务器",
    "memoryReady": "语义记忆已连接",
    "memoryOffline": "语义记忆尚未连接",
    "aiReady": "助手已连接",
    "aiOffline": "助手尚未连接",
    "pendingIndex": "等待记忆索引",
    "indexed": "已加入记忆",
    "saved": "记录已保存",
    "loadError": "无法加载日记，请重试。",
    "saveError": "无法保存，草稿仍保留。",
    "retry": "重试",
    "searchDiary": "搜索此日记",
    "searchDiaryPlaceholder": "例如：运动后的睡眠",
    "searchDiaryButton": "搜索",
    "searchEmpty": "暂无匹配记录。",
    "memoryMatches": "相关日记记录",
    "memoryUnavailable": "语义搜索尚未连接。",
    "aiUnavailable": "助手需要连接语言模型。你仍可保存日记。",
    "promptSleep": "记录睡眠",
    "promptExercise": "运动之后",
    "promptRecall": "回顾本周",
    "promptTextSleep": "我睡了6小时。精力为4/10。今天的活动：",
    "promptTextExercise": "运动后我的感觉：。心率恢复基线所需时间：。",
    "promptTextRecall": "本周我记录了哪些睡眠和疲劳情况？",
    "demoNote": "原型日记",
    "photoCredit": "档案照片：NASA。本原型未获NASA背书。",
    "journalOlder": "加载更早的记录",
    "noOlder": "日记起点",
    "searching": "正在搜索…",
    "history": "历史",
    "periods": {
      "1m": "1分钟",
      "1h": "1小时",
      "24h": "24小时",
      "7d": "7天",
      "1mo": "1个月",
      "1y": "1年"
    },
    "axes": {
      "1m": [
        "60秒前",
        "45秒",
        "30秒",
        "15秒",
        "现在"
      ],
      "1h": [
        "60分钟前",
        "45分钟",
        "30分钟",
        "15分钟",
        "现在"
      ],
      "1mo": [
        "30天前",
        "22天",
        "15天",
        "7天",
        "现在"
      ],
      "1y": [
        "1年前",
        "9个月",
        "6个月",
        "3个月",
        "现在"
      ],
      "24h": [
        "24小时前",
        "18小时",
        "12小时",
        "6小时",
        "现在"
      ],
      "7d": [
        "7天前",
        "5天",
        "3天",
        "昨天",
        "现在"
      ]
    }
  },
  "ar": {
    "locale": "ar-AE",
    "missionDay": "اليوم 142 من المهمة",
    "simulated": "بيانات محاكاة",
    "appearance": "المظهر",
    "lightTheme": "المظهر الفاتح",
    "darkTheme": "المظهر الداكن",
    "language": "اللغة",
    "eyebrow": "لوحة المهمة",
    "headline": "نظرة عامة على صحة الطاقم",
    "intro": "راجع القراءات وقارنها بالقيم المرجعية الشخصية واستكشف الأبحاث المرتبطة بكل مؤشر.",
    "challenge": "تفاصيل تحدي 2026",
    "crewMembers": "ملفات رواد الفضاء",
    "crew": "رواد الفضاء",
    "memberCount": "3 ملفات",
    "missionContext": "سياق المهمة",
    "demoMission": "مهمة تجريبية، اليوم 142",
    "latestSample": "أحدث عينة للطاقم: 08:42 UTC",
    "fictional": "ملفات NASA حقيقية. جميع القراءات الصحية وسيناريوهات اليوميات محاكاة.",
    "dashboard": "لوحة متابعة الصحة",
    "measurements": "القياسات الحالية",
    "trend": "اتجاه القراءات",
    "chartPeriod": "الفترة الزمنية للرسم",
    "periodDay": "24 ساعة",
    "periodWeek": "7 أيام",
    "sampleReadings": "قراءات تجريبية",
    "readingContext": "سياق القراءات",
    "recentActivity": "النشاط الأخير",
    "assessmentResearch": "التقييم والأبحاث",
    "currentAssessment": "التقييم الحالي",
    "signals": "مؤشرات للمراجعة",
    "nextCheck": "الفحص التالي",
    "disclaimer": "تقارن قواعد العرض قراءات افتراضية بقيم مرجعية افتراضية. هذا النموذج ليس جهازا طبيا ولا يقدم تشخيصا.",
    "researchContext": "السياق البحثي",
    "researchIntro": "مواد عامة من NASA مرتبطة بالمؤشر المحدد. لا تفسر هذه المواد قراءة فردية.",
    "findMaterial": "البحث عن مواد مرجعية",
    "find": "بحث",
    "placeholder": "مثال: مخاطر القلب",
    "footer": "نموذج مفاهيمي لـMission Health. لا توجد بيانات مباشرة أو دعم للقرارات السريرية.",
    "sourcesLabel": "المصادر:",
    "sourceProgram": "برنامج NASA للأبحاث البشرية",
    "deepSpace": "سيناريو تجريبي",
    "sampleAt": "وقت العينة",
    "changed": "تغير عن القيمة المرجعية",
    "near": "قريب من القيمة المرجعية",
    "baseline": "القيمة المرجعية الشخصية",
    "restingBaseline": "القيمة المرجعية أثناء الراحة",
    "reportedBaseline": "القيمة المرجعية المبلغ عنها",
    "metrics": {
      "hr": "معدل ضربات القلب",
      "spo2": "تشبع الأكسجين",
      "temp": "درجة حرارة الجسم",
      "fatigue": "مؤشر التعب"
    },
    "units": {
      "hr": "نبضة/دقيقة"
    },
    "status": {
      "attention": "انتباه",
      "normal": "طبيعي",
      "review": "مراجعة"
    },
    "contextLabels": [
      "آخر نشاط",
      "النوم",
      "يوم المهمة",
      "جودة المستشعر"
    ],
    "good": "جيدة",
    "hoursShort": "س",
    "minutesShort": "د",
    "yesterday": "أمس",
    "activities": [
      "تمرين",
      "صيانة",
      "التحضير للسير في الفضاء"
    ],
    "events": [
      "تغيرت عدة قراءات معا",
      "استلام عينة روتينية",
      "رصد تغير في الاتجاه"
    ],
    "activityLogged": "تسجيل جلسة نشاط",
    "previousSample": "العينة المرجعية السابقة",
    "axisDay": [
      "قبل 24 ساعة",
      "18 ساعة",
      "12 ساعة",
      "6 ساعات",
      "الآن"
    ],
    "axisWeek": [
      "قبل 7 أيام",
      "5 أيام",
      "3 أيام",
      "أمس",
      "الآن"
    ],
    "sourceTitles": [
      "مخاطر رحلات الفضاء البشرية",
      "مخاطر التكيفات القلبية الوعائية",
      "برنامج الأبحاث البشرية"
    ],
    "sourceDescriptions": [
      "نظرة عامة على الأبحاث المتعلقة بالمخاطر الفسيولوجية والسلوكية في المهام الطويلة.",
      "كيف يمكن لانعدام الوزن أن يغير الدورة الدموية ووظائف القلب والأوعية.",
      "برنامج NASA البحثي لصحة رواد الفضاء وأدائهم."
    ],
    "noMatch": "لم يتم العثور على نتيجة في هذا النموذج",
    "searchHint": "جرب القلب أو الأكسجين أو التعب أو الصحة.",
    "openSource": "فتح مصدر NASA",
    "metaDescription": "نموذج لمتابعة صحة الطاقم باستخدام قراءات محاكاة وقيم مرجعية شخصية وأبحاث NASA.",
    "people": [
      {
        "name": "جيسيكا مير",
        "role": "رائد فضاء نشط في NASA",
        "assessment": "عدة تغيرات تحتاج إلى مراجعة",
        "description": "تختلف عدة قيم في هذا السيناريو المحاكى. أعد العينة وراجع بروتوكول المهمة.",
        "signals": [
          "معدل القلب أعلى من القيمة المرجعية الشخصية",
          "الأكسجين أقل من القيمة المرجعية الشخصية",
          "الحرارة أعلى من القيمة المرجعية الشخصية"
        ],
        "next": "أعد القياسات وتحقق من وضع المستشعر واتبع الإجراء الطبي المعتمد للطاقم."
      },
      {
        "name": "جاك هاثاواي",
        "role": "رائد فضاء نشط في NASA",
        "assessment": "القراءات قريبة من القيم المرجعية",
        "description": "تظل القراءات المحاكاة قريبة من القيم المرجعية الافتراضية.",
        "signals": [
          "لا يوجد تغير ملحوظ في أحدث عينة"
        ],
        "next": "واصل المتابعة الروتينية وراجع القياسات بعد العينة المجدولة التالية."
      },
      {
        "name": "كريستينا كوخ",
        "role": "رائد فضاء نشط في NASA",
        "assessment": "الاتجاه يستحق مراجعة ثانية",
        "description": "يتغير اتجاه القلب المحاكى تدريجيا وتظل القراءات الأخرى قرب المرجع.",
        "signals": [
          "ارتفع معدل القلب عبر العينات الأخيرة",
          "القياسات الأخرى قريبة من القيم المرجعية"
        ],
        "next": "راجع سياق النشاط وأعد القراءة في الموعد المجدول التالي."
      }
    ],
    "biography": "سيرة NASA",
    "profileSimulation": "قراءات صحية محاكاة",
    "healthTab": "نظرة صحية",
    "journalTab": "الدردشة واليوميات",
    "viewLabel": "عرض الملف",
    "periodMinute": "دقيقة",
    "periodHour": "ساعة",
    "periodMonth": "شهر",
    "periodYear": "سنة",
    "journalTitle": "اليوميات الشخصية",
    "journalIntro": "يومياتك التجريبية لهذا الملف، وليست السجلات الحقيقية لرائد الفضاء.",
    "journalEmpty": "ابدأ بتسجيل يومك",
    "journalEmptyText": "سجل النوم والطاقة والنشاط أو سؤالا. لكل ملف سجل مستقل.",
    "noteMode": "تدوين يومية",
    "askMode": "اسأل المساعد",
    "composerLabel": "اكتب يومية أو سؤالا",
    "composerPlaceholder": "كيف كان نومك؟ كيف تشعر بعد التمرين؟",
    "send": "حفظ اليومية",
    "sendAsk": "إرسال السؤال",
    "sending": "جار الحفظ…",
    "loading": "جار تحميل اليوميات…",
    "you": "أنت",
    "assistant": "المساعد",
    "journalSaved": "محفوظ على الخادم",
    "memoryReady": "الذاكرة الدلالية متصلة",
    "memoryOffline": "الذاكرة الدلالية غير متصلة",
    "aiReady": "المساعد متصل",
    "aiOffline": "المساعد غير متصل",
    "pendingIndex": "بانتظار فهرسة الذاكرة",
    "indexed": "أضيف إلى الذاكرة",
    "saved": "تم الحفظ",
    "loadError": "تعذر تحميل اليوميات. حاول مجددا.",
    "saveError": "تعذر الحفظ. المسودة ما زالت هنا.",
    "retry": "حاول مجددا",
    "searchDiary": "ابحث في هذه اليوميات",
    "searchDiaryPlaceholder": "مثال: النوم بعد التمرين",
    "searchDiaryButton": "بحث",
    "searchEmpty": "لا توجد يوميات مطابقة بعد.",
    "memoryMatches": "يوميات ذات صلة",
    "memoryUnavailable": "البحث الدلالي غير متصل بعد.",
    "aiUnavailable": "يحتاج المساعد إلى نموذج لغوي متصل. يمكنك حفظ اليوميات.",
    "promptSleep": "تسجيل النوم",
    "promptExercise": "بعد التمرين",
    "promptRecall": "تذكر هذا الأسبوع",
    "promptTextSleep": "نمت 6 ساعات. طاقتي 4 من 10. نشاط اليوم:",
    "promptTextExercise": "بعد التمرين شعرت بـ: . عاد معدل القلب إلى المرجع بعد: .",
    "promptTextRecall": "ماذا سجلت عن النوم والتعب هذا الأسبوع؟",
    "demoNote": "يوميات تجريبية",
    "photoCredit": "صور الملفات: NASA. لا تعتمد NASA هذا النموذج.",
    "journalOlder": "تحميل يوميات أقدم",
    "noOlder": "بداية اليوميات",
    "searching": "جار البحث…",
    "history": "السجل",
    "periods": {
      "1m": "دقيقة",
      "1h": "ساعة",
      "24h": "24 ساعة",
      "7d": "7 أيام",
      "1mo": "شهر",
      "1y": "سنة"
    },
    "axes": {
      "1m": [
        "قبل 60 ث",
        "45 ث",
        "30 ث",
        "15 ث",
        "الآن"
      ],
      "1h": [
        "قبل 60 د",
        "45 د",
        "30 د",
        "15 د",
        "الآن"
      ],
      "1mo": [
        "قبل 30 يوما",
        "22 يوما",
        "15 يوما",
        "7 أيام",
        "الآن"
      ],
      "1y": [
        "قبل سنة",
        "9 أشهر",
        "6 أشهر",
        "3 أشهر",
        "الآن"
      ],
      "24h": [
        "قبل 24 ساعة",
        "18 ساعة",
        "12 ساعة",
        "6 ساعات",
        "الآن"
      ],
      "7d": [
        "قبل 7 أيام",
        "5 أيام",
        "3 أيام",
        "أمس",
        "الآن"
      ]
    }
  },
  "es": {
    "locale": "es-ES",
    "missionDay": "Día de misión 142",
    "simulated": "Datos simulados",
    "appearance": "Apariencia",
    "lightTheme": "Tema claro",
    "darkTheme": "Tema oscuro",
    "language": "Idioma",
    "eyebrow": "Panel de misión",
    "headline": "Salud de la tripulación",
    "intro": "Revisa las lecturas, compara las referencias personales y consulta los estudios relacionados con cada señal.",
    "challenge": "Resumen del reto 2026",
    "crewMembers": "Perfiles de astronautas",
    "crew": "Astronautas",
    "memberCount": "3 perfiles",
    "missionContext": "Contexto de la misión",
    "demoMission": "Misión de demostración, día 142",
    "latestSample": "Última muestra: 08:42 UTC",
    "fictional": "Perfiles reales de NASA. Todas las lecturas de salud y los escenarios del diario son simulados.",
    "dashboard": "Panel de salud",
    "measurements": "Mediciones actuales",
    "trend": "Tendencia de las lecturas",
    "chartPeriod": "Periodo del gráfico",
    "periodDay": "24 horas",
    "periodWeek": "7 días",
    "sampleReadings": "Lecturas de muestra",
    "readingContext": "Contexto de las lecturas",
    "recentActivity": "Actividad reciente",
    "assessmentResearch": "Evaluación y estudios",
    "currentAssessment": "Evaluación actual",
    "signals": "Señales por revisar",
    "nextCheck": "Próxima comprobación",
    "disclaimer": "Las reglas de demostración comparan lecturas y referencias ficticias. Este prototipo no es un dispositivo médico ni un diagnóstico.",
    "researchContext": "Contexto de investigación",
    "researchIntro": "Material público de NASA relacionado con la señal seleccionada. No interpreta una lectura individual.",
    "findMaterial": "Buscar material de referencia",
    "find": "Buscar",
    "placeholder": "p. ej., riesgo cardiovascular",
    "footer": "Prototipo conceptual de Mission Health. Sin telemetría en directo ni apoyo a decisiones clínicas.",
    "sourcesLabel": "Fuentes:",
    "sourceProgram": "Programa de Investigación Humana de NASA",
    "deepSpace": "Escenario de prueba",
    "sampleAt": "Muestra a las",
    "changed": "Cambio respecto a la referencia",
    "near": "Cerca de la referencia",
    "baseline": "Referencia personal",
    "restingBaseline": "Referencia en reposo",
    "reportedBaseline": "Referencia declarada",
    "metrics": {
      "hr": "Frecuencia cardiaca",
      "spo2": "Oxígeno en sangre",
      "temp": "Temperatura corporal",
      "fatigue": "Índice de fatiga"
    },
    "units": {
      "hr": "lpm"
    },
    "status": {
      "attention": "ATENCIÓN",
      "normal": "NORMAL",
      "review": "REVISAR"
    },
    "contextLabels": [
      "Última actividad",
      "Sueño",
      "Día de misión",
      "Calidad del sensor"
    ],
    "good": "Buena",
    "hoursShort": "h",
    "minutesShort": "min",
    "yesterday": "Ayer",
    "activities": [
      "Ejercicio",
      "Mantenimiento",
      "Preparación de EVA"
    ],
    "events": [
      "Varias lecturas cambiaron a la vez",
      "Muestra rutinaria recibida",
      "Cambio de tendencia detectado"
    ],
    "activityLogged": "Actividad registrada",
    "previousSample": "Muestra de referencia anterior",
    "axisDay": [
      "Hace 24 h",
      "18 h",
      "12 h",
      "6 h",
      "Ahora"
    ],
    "axisWeek": [
      "Hace 7 días",
      "5 días",
      "3 días",
      "Ayer",
      "Ahora"
    ],
    "sourceTitles": [
      "Riesgos del vuelo espacial humano",
      "Riesgo de adaptaciones cardiovasculares",
      "Programa de Investigación Humana"
    ],
    "sourceDescriptions": [
      "Resumen de los riesgos fisiológicos y de conducta estudiados para misiones largas.",
      "Cómo la ingravidez puede cambiar la circulación y la función cardiovascular.",
      "Programa de NASA dedicado a la salud y al rendimiento de los astronautas."
    ],
    "noMatch": "Sin coincidencias en este prototipo",
    "searchHint": "Prueba corazón, oxígeno, fatiga o salud.",
    "openSource": "Abrir fuente de NASA",
    "metaDescription": "Prototipo de salud de la tripulación con lecturas simuladas, referencias personales y estudios de NASA.",
    "people": [
      {
        "name": "Jessica Meir",
        "role": "Astronauta activo de NASA",
        "assessment": "Varios cambios requieren revisión",
        "description": "Varios valores difieren en este escenario simulado. Repite la muestra y revisa el protocolo.",
        "signals": [
          "La frecuencia cardiaca supera la referencia",
          "El oxígeno está por debajo de la referencia",
          "La temperatura supera la referencia"
        ],
        "next": "Repite las mediciones, confirma la colocación del sensor y sigue el procedimiento médico del equipo."
      },
      {
        "name": "Jack Hathaway",
        "role": "Astronauta activo de NASA",
        "assessment": "Lecturas cercanas a la referencia",
        "description": "Este escenario simulado sigue cerca de la referencia ficticia.",
        "signals": [
          "Sin cambios importantes en la última muestra"
        ],
        "next": "Continúa la supervisión rutinaria y revisa la próxima muestra programada."
      },
      {
        "name": "Christina Koch",
        "role": "Astronauta activo de NASA",
        "assessment": "La tendencia merece otra revisión",
        "description": "Esta tendencia simulada del pulso cambia gradualmente. Las otras lecturas siguen cerca de la referencia.",
        "signals": [
          "La frecuencia cardiaca aumenta en muestras recientes",
          "Las otras mediciones siguen cerca de la referencia"
        ],
        "next": "Revisa el contexto de actividad y repite la lectura en el próximo intervalo programado."
      }
    ],
    "biography": "Biografía de NASA",
    "profileSimulation": "Lecturas de salud simuladas",
    "healthTab": "Resumen de salud",
    "journalTab": "Chat y diario",
    "viewLabel": "Vista del perfil",
    "periodMinute": "1 minuto",
    "periodHour": "1 hora",
    "periodMonth": "1 mes",
    "periodYear": "1 año",
    "journalTitle": "Diario personal",
    "journalIntro": "Tu diario del prototipo para este perfil. No son entradas reales del astronauta.",
    "journalEmpty": "Empieza tu registro diario",
    "journalEmptyText": "Anota sueño, energía, actividad o una pregunta. Cada perfil tiene su propia historia.",
    "noteMode": "Entrada de diario",
    "askMode": "Preguntar al asistente",
    "composerLabel": "Escribe una entrada o pregunta",
    "composerPlaceholder": "¿Cómo dormiste? ¿Cómo te sientes tras el ejercicio?",
    "send": "Guardar entrada",
    "sendAsk": "Enviar pregunta",
    "sending": "Guardando…",
    "loading": "Cargando diario…",
    "you": "Tú",
    "assistant": "Asistente",
    "journalSaved": "Guardado en el servidor",
    "memoryReady": "Memoria semántica conectada",
    "memoryOffline": "Memoria semántica sin conectar",
    "aiReady": "Asistente conectado",
    "aiOffline": "Asistente sin conectar",
    "pendingIndex": "Pendiente de indexación",
    "indexed": "Añadido a la memoria",
    "saved": "Entrada guardada",
    "loadError": "No se pudo cargar el diario. Inténtalo otra vez.",
    "saveError": "No se pudo guardar. El borrador sigue aquí.",
    "retry": "Reintentar",
    "searchDiary": "Buscar en este diario",
    "searchDiaryPlaceholder": "p. ej. sueño después del ejercicio",
    "searchDiaryButton": "Buscar",
    "searchEmpty": "Aún no hay entradas relacionadas.",
    "memoryMatches": "Entradas relacionadas",
    "memoryUnavailable": "La búsqueda semántica aún no está conectada.",
    "aiUnavailable": "El asistente necesita un modelo de lenguaje conectado. Puedes guardar entradas de diario.",
    "promptSleep": "Registrar sueño",
    "promptExercise": "Tras el ejercicio",
    "promptRecall": "Recordar la semana",
    "promptTextSleep": "Dormí 6 horas. Mi energía es 4 de 10. Actividad de hoy:",
    "promptTextExercise": "Después del ejercicio sentí: . El pulso volvió a la referencia tras: .",
    "promptTextRecall": "¿Qué anoté sobre sueño y fatiga esta semana?",
    "demoNote": "Diario del prototipo",
    "photoCredit": "Fotos de perfiles: NASA. NASA no respalda este prototipo.",
    "journalOlder": "Cargar entradas anteriores",
    "noOlder": "Inicio del diario",
    "searching": "Buscando…",
    "history": "Historial",
    "periods": {
      "1m": "1 minuto",
      "1h": "1 hora",
      "24h": "24 horas",
      "7d": "7 días",
      "1mo": "1 mes",
      "1y": "1 año"
    },
    "axes": {
      "1m": [
        "Hace 60 s",
        "45 s",
        "30 s",
        "15 s",
        "Ahora"
      ],
      "1h": [
        "Hace 60 min",
        "45 min",
        "30 min",
        "15 min",
        "Ahora"
      ],
      "1mo": [
        "Hace 30 días",
        "22 días",
        "15 días",
        "7 días",
        "Ahora"
      ],
      "1y": [
        "Hace 1 año",
        "9 meses",
        "6 meses",
        "3 meses",
        "Ahora"
      ],
      "24h": [
        "Hace 24 h",
        "18 h",
        "12 h",
        "6 h",
        "Ahora"
      ],
      "7d": [
        "Hace 7 días",
        "5 días",
        "3 días",
        "Ayer",
        "Ahora"
      ]
    }
  }
};
