#!/usr/bin/env node

const crypto = require('crypto');
const { execSync, spawnSync } = require('child_process');
const os = require('os');

if (os.platform() === 'win32') {
  try {
    process.stdout.setEncoding('utf8');
    execSync('chcp 65001', { stdio: 'ignore' });
  } catch (e) {}
}

const CHAR_SETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digit: '0123456789',
  symbol: '!@#$%^&*()_+-=[]{}|;:,.<>?'
};

const AMBIGUOUS = '0Oo1lI';

const SIMPLE_ONSETS = 'bcdfghjklmnpqrstvwxyz'.split('');
const CLUSTER_ONSETS = [
  'bl','br','ch','cl','cr','dr','fl','fr','gl','gr','pl','pr',
  'qu','sc','sh','sk','sl','sm','sn','sp','st','sw','th','tr','tw','wh'
];
const SHORT_VOWELS = 'aeiou'.split('');
const LONG_VOWELS = [
  'ai','au','aw','ay','ea','ee','ei','ew','ey','ie','oa','oi','oo','ou','ow','oy','ue'
];
const SINGLE_CODAS = 'bcd fgh klmnprst wx  y'.replace(/ /g, '').split('');
const CLUSTER_CODAS = [
  'ch','ck','ct','ft','gh','ld','lf','lk','ll','lm','lp','lt',
  'mb','mp','nd','ng','nk','nt','pt','rb','rd','rf','rg','rk',
  'rl','rm','rn','rp','rt','sh','sk','sp','ss','st','th'
];

function parseArgs(argv) {
  const args = {
    length: 16,
    count: 1,
    chars: ['lower', 'upper', 'digit', 'symbol'],
    excludeAmbiguous: false,
    pronounceable: false,
    copy: false,
    strength: false
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '-l':
        args.length = parseInt(argv[++i], 10);
        break;
      case '-n':
        args.count = parseInt(argv[++i], 10);
        break;
      case '-c':
        args.chars = argv[++i].split(',').map(s => s.trim());
        break;
      case '--exclude-ambiguous':
        args.excludeAmbiguous = true;
        break;
      case '--pronounceable':
        args.pronounceable = true;
        break;
      case '--copy':
        args.copy = true;
        break;
      case '--strength':
        args.strength = true;
        break;
      default:
        console.error(`Unknown argument: ${arg}`);
        process.exit(1);
    }
  }

  if (isNaN(args.length) || args.length < 1) {
    console.error('Invalid length');
    process.exit(1);
  }
  if (isNaN(args.count) || args.count < 1) {
    console.error('Invalid count');
    process.exit(1);
  }

  return args;
}

function secureRandomInt(max) {
  if (max < 1) return 0;
  const bits = Math.ceil(Math.log2(max));
  const bytes = Math.ceil(bits / 8);
  const mask = (1 << bits) - 1;

  while (true) {
    const buf = crypto.randomBytes(bytes);
    let value = 0;
    for (let i = 0; i < bytes; i++) {
      value = (value << 8) | buf[i];
    }
    value = value & mask;
    if (value < max) {
      return value;
    }
  }
}

function buildCharset(chars, excludeAmbiguous) {
  let charset = '';
  for (const type of chars) {
    if (!CHAR_SETS[type]) {
      console.error(`Unknown character set: ${type}`);
      process.exit(1);
    }
    charset += CHAR_SETS[type];
  }
  if (excludeAmbiguous) {
    charset = charset.split('').filter(c => !AMBIGUOUS.includes(c)).join('');
  }
  if (charset.length === 0) {
    console.error('Empty character set');
    process.exit(1);
  }
  return charset;
}

function generatePassword(length, charset) {
  const chars = charset.split('');
  const result = [];
  for (let i = 0; i < length; i++) {
    result.push(chars[secureRandomInt(chars.length)]);
  }
  return result.join('');
}

function filterAmbiguous(arr) {
  return arr.filter(s => {
    for (const c of s) {
      if (AMBIGUOUS.includes(c)) return false;
    }
    return true;
  });
}

function isConsonant(c) {
  return c && 'bcdfghjklmnpqrstvwxyz'.includes(c.toLowerCase());
}

function maxConsonantRun(s) {
  let maxRun = 0, currentRun = 0;
  for (const c of s) {
    if (isConsonant(c)) {
      currentRun++;
      if (currentRun > maxRun) maxRun = currentRun;
    } else {
      currentRun = 0;
    }
  }
  return maxRun;
}

function generatePronounceable(length, excludeAmbiguous) {
  let simpleOnsets = SIMPLE_ONSETS;
  let clusterOnsets = CLUSTER_ONSETS;
  let shortVowels = SHORT_VOWELS;
  let longVowels = LONG_VOWELS;
  let singleCodas = SINGLE_CODAS;
  let clusterCodas = CLUSTER_CODAS;

  if (excludeAmbiguous) {
    simpleOnsets = filterAmbiguous(simpleOnsets);
    clusterOnsets = filterAmbiguous(clusterOnsets);
    shortVowels = filterAmbiguous(shortVowels);
    longVowels = filterAmbiguous(longVowels);
    singleCodas = filterAmbiguous(singleCodas);
    clusterCodas = filterAmbiguous(clusterCodas);
  }

  const result = [];
  let currentLen = 0;
  let prevHadCoda = false;

  while (currentLen < length) {
    const remaining = length - currentLen;
    const isHeavy = !prevHadCoda;

    let onset, vowel, coda;

    if (prevHadCoda) {
      onset = simpleOnsets[secureRandomInt(simpleOnsets.length)];
    } else if (remaining >= 5 && secureRandomInt(3) === 0) {
      onset = clusterOnsets[secureRandomInt(clusterOnsets.length)];
    } else {
      onset = simpleOnsets[secureRandomInt(simpleOnsets.length)];
    }

    const afterOnset = remaining - onset.length;
    if (afterOnset < 1) {
      const fallback = simpleOnsets.filter(o => o.length <= remaining - 1);
      onset = fallback.length > 0 ? fallback[secureRandomInt(fallback.length)] : simpleOnsets[0];
    }

    const afterOnsetFixed = remaining - onset.length;
    const usedClusterOnset = onset.length > 1;

    if (isHeavy && afterOnsetFixed >= 2 && secureRandomInt(3) !== 0) {
      const available = longVowels.filter(v => v.length <= afterOnsetFixed - 1);
      vowel = available.length > 0
        ? available[secureRandomInt(available.length)]
        : shortVowels[secureRandomInt(shortVowels.length)];
    } else {
      vowel = shortVowels[secureRandomInt(shortVowels.length)];
    }

    const afterVowel = remaining - onset.length - vowel.length;
    const maxCodaLen = usedClusterOnset ? 1 : 2;

    if (isHeavy && afterVowel >= 1) {
      if (maxCodaLen >= 2 && afterVowel >= 2 && secureRandomInt(4) === 0) {
        const available = clusterCodas.filter(c => c.length <= Math.min(afterVowel, maxCodaLen));
        coda = available.length > 0
          ? available[secureRandomInt(available.length)]
          : singleCodas[secureRandomInt(singleCodas.length)];
      } else {
        coda = singleCodas[secureRandomInt(singleCodas.length)];
      }
    } else {
      coda = '';
    }

    const syllable = onset + vowel + coda;
    let formatted = syllable;

    if (currentLen === 0 && secureRandomInt(2) === 0) {
      formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
    }

    result.push(formatted);
    currentLen += formatted.length;
    prevHadCoda = coda.length > 0;
  }

  let password = result.join('');

  while (maxConsonantRun(password) > 3) {
    let run = 0;
    let fixed = false;
    for (let i = 0; i < password.length; i++) {
      if (isConsonant(password[i])) {
        run++;
        if (run === 4) {
          const prev = password.substring(0, i - 1);
          const rest = password.substring(i + 1);
          password = prev + rest;
          fixed = true;
          break;
        }
      } else {
        run = 0;
      }
    }
    if (!fixed) break;
  }

  return password;
}

function assessStrength(password, charsetSize) {
  const length = password.length;
  const entropy = length * Math.log2(charsetSize);

  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[^a-zA-Z0-9]/.test(password);

  const diversity = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;
  const diversityScore = (diversity / 4) * 100;

  let riskLevel;
  if (entropy < 40) {
    riskLevel = '弱';
  } else if (entropy < 60) {
    riskLevel = '中';
  } else if (entropy < 80) {
    riskLevel = '强';
  } else {
    riskLevel = '极强';
  }

  const guessesPerSecond = 1e8;
  const totalCombinations = Math.pow(charsetSize, length);
  const secondsToCrack = totalCombinations / guessesPerSecond / 2;

  const crackTime = formatTime(secondsToCrack);

  return {
    entropy: entropy.toFixed(2),
    diversityScore: diversityScore.toFixed(0),
    diversity,
    riskLevel,
    crackTime
  };
}

function formatTime(seconds) {
  if (seconds < 1) return '瞬间';
  if (seconds < 60) return `${seconds.toFixed(2)} 秒`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(2)} 分钟`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(2)} 小时`;
  if (seconds < 31536000) return `${(seconds / 86400).toFixed(2)} 天`;
  const years = seconds / 31536000;
  if (years < 1e6) return `${years.toFixed(2)} 年`;
  if (years < 1e9) return `${(years / 1e6).toFixed(2)} 百万年`;
  if (years < 1e12) return `${(years / 1e9).toFixed(2)} 十亿年`;
  return `${(years / 1e12).toFixed(2)} 万亿年`;
}

function copyToClipboard(text) {
  const platform = os.platform();
  try {
    if (platform === 'win32') {
      const cmd = `echo|set /p="${text}"| clip`;
      execSync(cmd, { stdio: 'ignore' });
    } else if (platform === 'darwin') {
      const proc = spawnSync('pbcopy', [], { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
      if (proc.error) throw proc.error;
    } else {
      const proc = spawnSync('xclip', ['-selection', 'clipboard'], { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
      if (proc.error) throw proc.error;
    }
    return true;
  } catch (e) {
    return false;
  }
}

function main() {
  const args = parseArgs(process.argv);
  const passwords = [];

  let charset, charsetSize;
  if (!args.pronounceable) {
    charset = buildCharset(args.chars, args.excludeAmbiguous);
    charsetSize = charset.length;
  }

  for (let i = 0; i < args.count; i++) {
    let password;
    if (args.pronounceable) {
      password = generatePronounceable(args.length, args.excludeAmbiguous);
      let baseCharset = CHAR_SETS.lower + CHAR_SETS.upper;
      if (args.excludeAmbiguous) {
        baseCharset = baseCharset.split('').filter(c => !AMBIGUOUS.includes(c)).join('');
      }
      charsetSize = baseCharset.length;
    } else {
      password = generatePassword(args.length, charset);
    }
    passwords.push(password);
  }

  if (args.copy && args.count === 1) {
    copyToClipboard(passwords[0]);
  }

  if (args.strength) {
    passwords.forEach((pwd, idx) => {
      const strength = assessStrength(pwd, charsetSize);
      if (args.count > 1) {
        console.log(`[${idx + 1}] ${pwd}`);
      } else {
        console.log(pwd);
      }
      console.log(`  熵值: ${strength.entropy} bits`);
      console.log(`  字符多样性: ${strength.diversityScore}% (${strength.diversity}/4 类)`);
      console.log(`  风险等级: ${strength.riskLevel}`);
      console.log(`  估算破解时间: ${strength.crackTime}`);
      console.log();
    });
  } else {
    console.log(passwords.join('\n'));
  }
}

main();
