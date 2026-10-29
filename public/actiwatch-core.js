(function (root) {
  'use strict';

  const MAX_ROWS = 50000;
  const DAY_MS = 86400000;
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const fail = message => { throw new Error(message); };
  const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const missing = value => value === '' || /^(?:nan|n\/a|null)$/i.test(value);
  const name = value => String(value).replace(/^\uFEFF/, '').trim().toLowerCase().replace(/\s+/g, ' ');

  function epoch(value) {
    if (!Number.isInteger(value) || value < 1 || value > 120) fail('Длительность эпохи должна быть целым числом от 1 до 120 секунд.');
    return value;
  }

  function number(value, label) {
    if (value === null) return null;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) fail(`${label}: требуется неотрицательное число или null.`);
    return value;
  }

  function calendar(year, month, day, hour, minute, second, millisecond = 0) {
    if (year < 0 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) fail('Некорректная дата или время в записи.');
    const check = new Date(0);
    check.setUTCFullYear(year, month - 1, day);
    check.setUTCHours(hour, minute, second, millisecond);
    const value = check.getTime();
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) fail('Несуществующая календарная дата в записи.');
    return value;
  }

  function iso(value) {
    if (typeof value !== 'string') fail('Время эпохи должно быть строкой ISO с часовым поясом.');
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/);
    if (!match) fail('Время эпохи должно быть строкой ISO с часовым поясом.');
    const [, year, month, day, hour, minute, second, fraction, zone] = match;
    let offset = 0;
    if (zone !== 'Z') {
      const hours = Number(zone.slice(1, 3)), minutes = Number(zone.slice(4, 6));
      if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) fail('Некорректный часовой пояс ISO.');
      offset = (zone[0] === '-' ? -1 : 1) * (hours * 60 + minutes);
    }
    return calendar(+year, +month, +day, +hour, +minute, +second, Number((fraction || '').padEnd(3, '0'))) - offset * 60000;
  }

  function localTime(date, time, options) {
    if (!['MDY', 'DMY', 'YMD'].includes(options.dateOrder)) fail('Для Date и Time явно выбери формат даты MDY, DMY или YMD.');
    const offset = options.utcOffsetMinutes;
    if (!own(options, 'utcOffsetMinutes') || !Number.isInteger(offset) || Math.abs(offset) > 840) fail('Для Date и Time явно укажи смещение UTC в минутах.');
    const parts = date.match(/^(\d{1,4})[\/.\-](\d{1,2})[\/.\-](\d{1,4})$/);
    if (!parts) fail('Дата не соответствует выбранному числовому формату.');
    const values = parts.slice(1), ordered = Object.fromEntries(options.dateOrder.split('').map((key, index) => [key, values[index]]));
    if (ordered.Y.length !== 4) fail('Год должен содержать четыре цифры.');
    const clock = time.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
    if (!clock) fail('Некорректное время в столбце Time.');
    let hours = Number(clock[1]);
    if (clock[4]) {
      if (hours < 1 || hours > 12) fail('Некорректное время AM/PM.');
      hours = hours % 12 + (clock[4].toUpperCase() === 'PM' ? 12 : 0);
    }
    return calendar(+ordered.Y, +ordered.M, +ordered.D, hours, +clock[2], +(clock[3] || 0)) - offset * 60000;
  }

  function csv(text) {
    if (typeof text !== 'string' || text.length > 16000000) fail('CSV должен быть текстом размером не более 16 МБ.');
    const rows = [];
    let row = [], field = '', quoted = false, closed = false;
    for (let index = 0; index < text.length; index++) {
      const character = text[index];
      if (quoted) {
        if (character === '"' && text[index + 1] === '"') { field += '"'; index++; }
        else if (character === '"') { quoted = false; closed = true; }
        else field += character;
      } else if (character === ',' || character === '\n' || character === '\r') {
        row.push(field.trim()); field = ''; closed = false;
        if (character !== ',') {
          if (character === '\r' && text[index + 1] === '\n') index++;
          if (row.some(value => value !== '')) rows.push(row);
          row = [];
        }
      } else if (character === '"') {
        if (field.trim() || closed) fail('Некорректные кавычки CSV.');
        field = ''; quoted = true;
      } else {
        if (closed && !/\s/.test(character)) fail('Некорректный текст после кавычек CSV.');
        field += character;
      }
      if (rows.length > MAX_ROWS + 1000) fail('Слишком много строк CSV.');
    }
    if (quoted) fail('Незакрытые кавычки CSV.');
    row.push(field.trim());
    if (row.some(value => value !== '')) rows.push(row);
    return rows;
  }

  function numericCell(value, label) {
    if (missing(value)) return null;
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) fail(`${label}: некорректное числовое значение.`);
    return number(Number(value), label);
  }

  function metadataEpoch(rows) {
    for (const row of rows) {
      const key = name(row[0]), value = row.slice(1).join(',').trim();
      let seconds;
      if (/^epoch (?:length|duration) \((?:seconds|sec|s)\)$/.test(key) && /^\d+$/.test(value)) seconds = Number(value);
      if (/^epoch (?:length|duration) \((?:minutes|min)\)$/.test(key) && /^\d+(?:\.\d+)?$/.test(value)) seconds = Number(value) * 60;
      if (/^epoch (?:length|duration)$/.test(key)) {
        const unit = value.match(/^(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?)$/i);
        const clock = value.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
        if (unit) seconds = Number(unit[1]) * (/^m/i.test(unit[2]) ? 60 : 1);
        if (clock && +clock[2] < 60 && +clock[3] < 60) seconds = +clock[1] * 3600 + +clock[2] * 60 + +clock[3];
      }
      if (seconds !== undefined) return epoch(seconds);
    }
    fail('Укажи длительность эпохи в секундах: в файле нет однозначной метадаты.');
  }

  function validate(recording) {
    if (!plain(recording) || recording.version !== 1 || recording.sourceFormat !== 'actiware-csv') fail('Неподдерживаемый формат записи Actiwatch.');
    const epochSeconds = epoch(recording.epochSeconds);
    if (!Array.isArray(recording.rows) || recording.rows.length < 2 || recording.rows.length > MAX_ROWS) fail('Запись должна содержать от 2 до 50000 эпох.');
    if (!Array.isArray(recording.warnings) || recording.warnings.length > 30 || recording.warnings.some(value => typeof value !== 'string' || value.length > 250)) fail('Некорректный список предупреждений.');
    const rows = recording.rows.map(row => {
      if (!plain(row)) fail('Некорректная строка эпохи.');
      const timestamp = new Date(iso(row.timestamp)).toISOString();
      if (!['sleep', 'wake', 'unknown'].includes(row.sleepState)) fail('Некорректная классификация сна.');
      if (row.offWrist !== null && typeof row.offWrist !== 'boolean') fail('Статус ношения должен быть boolean или null.');
      if (typeof row.excluded !== 'boolean') fail('Признак исключения должен быть boolean.');
      return { timestamp, activity: number(row.activity, 'Активность'), lightLux: number(row.lightLux, 'Освещенность'), sleepState: row.sleepState, offWrist: row.offWrist, excluded: row.excluded };
    }).sort((left, right) => left.timestamp.localeCompare(right.timestamp));
    for (let index = 1; index < rows.length; index++) {
      if (iso(rows[index].timestamp) - iso(rows[index - 1].timestamp) < epochSeconds * 1000) fail('Обнаружены дубликаты или перекрывающиеся эпохи.');
    }
    return { version: 1, sourceFormat: 'actiware-csv', epochSeconds, rows, warnings: [...new Set(recording.warnings)] };
  }

  function parseCSV(text, options = {}) {
    if (!plain(options)) fail('Параметры импорта должны быть объектом.');
    const data = csv(text);
    const aliases = {
      timestamp: ['timestamp', 'datetime', 'date time'], date: ['date'], time: ['time'], activity: ['activity'],
      lightLux: ['white light', 'white light (lux)', 'photopic light', 'photopic light (lux)'],
      sleepState: ['sleep/wake score', 'sleep/wake'], offWrist: ['off-wrist status'], excluded: ['interval status']
    };
    let headerIndex = -1, columns;
    for (let index = 0; index < data.length; index++) {
      const header = data[index].map(name), candidate = {};
      for (const [key, names] of Object.entries(aliases)) {
        const matches = header.flatMap((value, position) => names.includes(value) ? [position] : []);
        if (matches.length > 1) fail('Повторяющиеся столбцы в заголовке CSV.');
        if (matches.length) candidate[key] = matches[0];
      }
      if (own(candidate, 'activity') && (own(candidate, 'timestamp') || own(candidate, 'date') && own(candidate, 'time'))) { headerIndex = index; columns = candidate; break; }
    }
    if (headerIndex < 0) fail('Не найден английский заголовок с Activity и Date/Time или Timestamp.');
    const epochSeconds = own(options, 'epochSeconds') ? epoch(options.epochSeconds) : metadataEpoch(data.slice(0, headerIndex));
    const warnings = new Set();
    if (!own(columns, 'sleepState')) warnings.add('В файле нет классификации сна.');
    if (!own(columns, 'lightLux')) warnings.add('В файле нет белого или фотопического света в lux.');
    if (!own(columns, 'offWrist')) warnings.add('В файле нет признака снятых часов.');
    const rows = data.slice(headerIndex + 1).map(values => {
      const cell = key => own(columns, key) ? (values[columns[key]] || '').trim() : '';
      const timestamp = own(columns, 'timestamp') ? iso(cell('timestamp')) : localTime(cell('date'), cell('time'), options);
      const sleep = cell('sleepState'), wrist = cell('offWrist'), interval = name(cell('excluded'));
      let sleepState = 'unknown', offWrist = null;
      if (sleep === '0') sleepState = 'sleep';
      else if (sleep === '1') sleepState = 'wake';
      else if (!missing(sleep)) warnings.add('Неизвестные метки сна оставлены без классификации.');
      if (wrist === '0') offWrist = false;
      else if (wrist === '1') offWrist = true;
      else if (!missing(wrist)) warnings.add('Неизвестные метки ношения оставлены без классификации.');
      const excluded = interval === 'excluded';
      if (interval && !['active', 'rest', 'rest-sleep', 'rest-s', 'excluded', 'n/a', 'nan'].includes(interval)) fail('Неизвестный Interval Status: требуется текстовый экспорт Actiware.');
      return { timestamp: new Date(timestamp).toISOString(), activity: numericCell(cell('activity'), 'Активность'), lightLux: numericCell(cell('lightLux'), 'Освещенность'), sleepState, offWrist, excluded };
    });
    const result = validate({ version: 1, sourceFormat: 'actiware-csv', epochSeconds, rows, warnings: [...warnings] });
    if (result.rows.some((row, index) => index && iso(row.timestamp) - iso(result.rows[index - 1].timestamp) > epochSeconds * 1000)) result.warnings.push('В записи есть пропуски между эпохами.');
    return result;
  }

  function summarize(recording) {
    const value = validate(recording), duration = value.epochSeconds * 1000;
    const start = iso(value.rows[0].timestamp), end = iso(value.rows[value.rows.length - 1].timestamp) + duration, windowStart = end - DAY_MS;
    let validSeconds = 0, offWristSeconds = 0, excludedSeconds = 0, coveredSeconds = 0, sleepScoredSeconds = 0, sleepSeconds = 0, wakeSeconds = 0, activityCounts = 0, activityEpochs = 0, lightSum = 0, lightSeconds = 0, maxLightLux = null;
    for (const row of value.rows) {
      const time = iso(row.timestamp), suitable = !row.excluded && row.offWrist !== true;
      if (suitable && row.activity !== null) validSeconds += value.epochSeconds;
      if (row.offWrist === true) offWristSeconds += value.epochSeconds;
      if (row.excluded) excludedSeconds += value.epochSeconds;
      const seconds = Math.max(0, Math.min(time + duration, end) - Math.max(time, windowStart)) / 1000;
      if (!seconds) continue;
      coveredSeconds += seconds;
      if (!suitable) continue;
      if (row.activity !== null) {
        // Counts нельзя делить пропорционально времени без исходных отсчетов внутри эпохи.
        if (seconds === value.epochSeconds) { activityCounts += row.activity; activityEpochs++; }
        if (row.sleepState !== 'unknown') {
          sleepScoredSeconds += seconds;
          if (row.sleepState === 'sleep') sleepSeconds += seconds;
          else wakeSeconds += seconds;
        }
      }
      if (row.lightLux !== null) {
        lightSum += row.lightLux * seconds; lightSeconds += seconds;
        maxLightLux = maxLightLux === null ? row.lightLux : Math.max(maxLightLux, row.lightLux);
      }
    }
    if (!Number.isFinite(activityCounts) || !Number.isFinite(lightSum)) fail('Слишком большие значения: числовой итог Actiwatch выходит за допустимый диапазон.');
    return { start: new Date(start).toISOString(), end: new Date(end).toISOString(), epochSeconds: value.epochSeconds, rowCount: value.rows.length, validSeconds, offWristSeconds, excludedSeconds, latest24h: {
      start: new Date(windowStart).toISOString(), end: new Date(end).toISOString(), coveredSeconds, sleepScoredSeconds,
      sleepSeconds: sleepScoredSeconds ? sleepSeconds : null, wakeSeconds: sleepScoredSeconds ? wakeSeconds : null,
      activityCounts: activityEpochs ? activityCounts : null, meanLightLux: lightSeconds ? lightSum / lightSeconds : null, maxLightLux
    } };
  }

  root.MissionActiwatch = { parseCSV, validate, summarize };
})(globalThis);
