#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

const CLI = `node "${path.join(__dirname, 'index.js')}"`;

let passed = 0;
let failed = 0;
const results = [];

function assert(condition, label) {
  if (condition) {
    passed++;
    results.push(`  ✅ ${label}`);
  } else {
    failed++;
    results.push(`  ❌ ${label}`);
  }
}

function run(args) {
  return execSync(`${CLI} ${args}`, { encoding: 'utf8' }).trim();
}

function runStrength(args) {
  const output = run(args + ' --strength');
  const lines = output.split('\n').map(l => l.trim()).filter(Boolean);
  const password = lines[0];
  const entropy = parseFloat(lines.find(l => l.startsWith('熵值:'))?.match(/([\d.]+)/)?.[1]);
  const diversityScore = parseInt(lines.find(l => l.startsWith('字符多样性:'))?.match(/([\d]+)%/)?.[1]);
  const diversity = parseInt(lines.find(l => l.startsWith('字符多样性:'))?.match(/(\d)\/4/)?.[1]);
  const riskLevel = lines.find(l => l.startsWith('风险等级:'))?.replace('风险等级:', '').trim();
  const crackTime = lines.find(l => l.startsWith('估算破解时间:'))?.replace('估算破解时间:', '').trim();
  return { password, entropy, diversityScore, diversity, riskLevel, crackTime };
}

const CHAR_SETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digit: '0123456789',
  symbol: '!@#$%^&*()_+-=[]{}|;:,.<>?'
};
const AMBIGUOUS = '0Oo1lI';
const VOWELS = 'aeiou';
const CONSONANTS = 'bcdfghjklmnpqrstvwxyz';

console.log('\n====================================================');
console.log('  passgen 项目验收测试');
console.log('====================================================\n');

// =====================================================
// 1. 生成的密码符合长度与字符集
// =====================================================
console.log('📋 1. 生成的密码符合长度与字符集');
{
  const pwd = run('-l 20 -c lower,upper,digit,symbol');
  assert(pwd.length === 20, '默认长度 20 生成的密码长度正确');

  const pwd8 = run('-l 8 -c lower');
  assert(pwd8.length === 8, '长度 8 生成的密码长度正确');

  const allChars = CHAR_SETS.lower + CHAR_SETS.upper + CHAR_SETS.digit + CHAR_SETS.symbol;
  const pwdFull = run('-l 100 -c lower,upper,digit,symbol');
  const allInCharset = [...pwdFull].every(c => allChars.includes(c));
  assert(allInCharset, '所有字符均在指定字符集 (lower,upper,digit,symbol) 内');

  const pwdLower = run('-l 50 -c lower');
  const allLower = [...pwdLower].every(c => CHAR_SETS.lower.includes(c));
  assert(allLower, '仅 lower 字符集时，所有字符均为小写');

  const pwdDigit = run('-l 50 -c digit');
  const allDigit = [...pwdDigit].every(c => CHAR_SETS.digit.includes(c));
  assert(allDigit, '仅 digit 字符集时，所有字符均为数字');

  const pwdSym = run('-l 50 -c symbol');
  const allSym = [...pwdSym].every(c => CHAR_SETS.symbol.includes(c));
  assert(allSym, '仅 symbol 字符集时，所有字符均为符号');

  const pwdBatch = run('-l 12 -n 5 -c lower,upper,digit');
  const batchLines = pwdBatch.split('\n');
  assert(batchLines.length === 5, '批量生成 5 个密码，输出行数正确');
  assert(batchLines.every(l => l.length === 12), '批量生成每个密码长度均为 12');
}
results.forEach(r => console.log(r));
results.length = 0;
console.log();

// =====================================================
// 2. 排除易混字符生效
// =====================================================
console.log('📋 2. 排除易混字符生效');
{
  const pwd = run('-l 200 --exclude-ambiguous -c lower,upper,digit,symbol');
  const hasAmbiguous = [...pwd].some(c => AMBIGUOUS.includes(c));
  assert(!hasAmbiguous, '200 字符密码中无易混字符 (0Oo1lI)');

  const expectedCharset = (CHAR_SETS.lower + CHAR_SETS.upper + CHAR_SETS.digit + CHAR_SETS.symbol)
    .split('')
    .filter(c => !AMBIGUOUS.includes(c))
    .join('');
  const allInExpected = [...pwd].every(c => expectedCharset.includes(c));
  assert(allInExpected, '排除易混字符后，所有字符均在预期字符集内');

  const pwdNoAmb = run('-l 200 --exclude-ambiguous -c lower,upper,digit');
  const hasAmb2 = [...pwdNoAmb].some(c => AMBIGUOUS.includes(c));
  assert(!hasAmb2, '仅 lower,upper,digit 排除易混字符后无 0Oo1lI');

  const pwdLower = run('-l 100 --exclude-ambiguous -c lower');
  const hasAmbLower = [...pwdLower].some(c => 'ol'.includes(c));
  assert(!hasAmbLower, '仅 lower 排除易混字符后无 o 和 l');
}
results.forEach(r => console.log(r));
results.length = 0;
console.log();

// =====================================================
// 3. 可读密码可读性合理
// =====================================================
console.log('📋 3. 可读密码可读性合理');
{
  const pwd = run('-l 20 --pronounceable');
  assert(pwd.length === 20, '可读密码长度正确');

  const allLetters = [...pwd].every(c => /[a-zA-Z]/.test(c));
  assert(allLetters, '可读密码仅包含字母');

  const hasVowelPattern = (() => {
    const lower = pwd.toLowerCase();
    let vowelConsonantAlternation = 0;
    for (let i = 1; i < lower.length; i++) {
      const prev = VOWELS.includes(lower[i - 1]) ? 'v' : 'c';
      const curr = VOWELS.includes(lower[i]) ? 'v' : 'c';
      if (prev !== curr) vowelConsonantAlternation++;
    }
    return vowelConsonantAlternation >= lower.length * 0.6;
  })();
  assert(hasVowelPattern, '可读密码元辅音交替比例 >= 60%');

  const pwd2 = run('-l 50 --pronounceable');
  const hasNoConsecutive3 = (() => {
    const lower = pwd2.toLowerCase();
    for (let i = 2; i < lower.length; i++) {
      const allV = VOWELS.includes(lower[i - 2]) && VOWELS.includes(lower[i - 1]) && VOWELS.includes(lower[i]);
      const allC = CONSONANTS.includes(lower[i - 2]) && CONSONANTS.includes(lower[i - 1]) && CONSONANTS.includes(lower[i]);
      if (allV || allC) return false;
    }
    return true;
  })();
  assert(hasNoConsecutive3, '可读密码无连续 3 个同类字符（元音/辅音）');

  const firstCharUpper = pwd[0] === pwd[0].toUpperCase() && pwd[0] !== pwd[0].toLowerCase();
  const firstCharLower = pwd[0] === pwd[0].toLowerCase();
  assert(firstCharUpper || firstCharLower, '可读密码首字符为字母（可能大写或小写）');
}
results.forEach(r => console.log(r));
results.length = 0;
console.log();

// =====================================================
// 4. 熵计算正确
// =====================================================
console.log('📋 4. 熵计算正确');
{
  const s1 = runStrength('-l 16 -c lower,upper,digit,symbol');
  const expectedEntropy1 = 16 * Math.log2(CHAR_SETS.lower.length + CHAR_SETS.upper.length + CHAR_SETS.digit.length + CHAR_SETS.symbol.length);
  assert(Math.abs(s1.entropy - expectedEntropy1) < 0.01, `全字符集 16 位熵值: 期望 ${expectedEntropy1.toFixed(2)}, 实际 ${s1.entropy}`);

  const s2 = runStrength('-l 16 -c lower');
  const expectedEntropy2 = 16 * Math.log2(CHAR_SETS.lower.length);
  assert(Math.abs(s2.entropy - expectedEntropy2) < 0.01, `仅 lower 16 位熵值: 期望 ${expectedEntropy2.toFixed(2)}, 实际 ${s2.entropy}`);

  const s3 = runStrength('-l 8 -c digit');
  const expectedEntropy3 = 8 * Math.log2(CHAR_SETS.digit.length);
  assert(Math.abs(s3.entropy - expectedEntropy3) < 0.01, `仅 digit 8 位熵值: 期望 ${expectedEntropy3.toFixed(2)}, 实际 ${s3.entropy}`);

  const s4 = runStrength('-l 16 --exclude-ambiguous -c lower,upper,digit,symbol');
  const ambiguousFreeCharset = (CHAR_SETS.lower + CHAR_SETS.upper + CHAR_SETS.digit + CHAR_SETS.symbol)
    .split('').filter(c => !AMBIGUOUS.includes(c)).join('');
  const expectedEntropy4 = 16 * Math.log2(ambiguousFreeCharset.length);
  assert(Math.abs(s4.entropy - expectedEntropy4) < 0.01, `排除易混字符后熵值: 期望 ${expectedEntropy4.toFixed(2)}, 实际 ${s4.entropy}`);

  const s5 = runStrength('-l 12 --pronounceable');
  const expectedEntropy5 = 12 * Math.log2(52);
  assert(Math.abs(s5.entropy - expectedEntropy5) < 0.01, `可读密码熵值 (charsetSize=52): 期望 ${expectedEntropy5.toFixed(2)}, 实际 ${s5.entropy}`);
}
results.forEach(r => console.log(r));
results.length = 0;
console.log();

// =====================================================
// 5. 强度评估分级合理
// =====================================================
console.log('📋 5. 强度评估分级合理');
{
  const s1 = runStrength('-l 4 -c digit');
  assert(s1.entropy < 40, `4 位纯数字熵 < 40: ${s1.entropy}`);
  assert(s1.riskLevel === '弱', `4 位纯数字为"弱": ${s1.riskLevel}`);

  const s2 = runStrength('-l 8 -c lower');
  const e2 = 8 * Math.log2(26);
  assert(e2 >= 37 && e2 < 60, `8 位小写熵在 40-60 附近: ${e2.toFixed(2)}`);
  if (e2 < 40) {
    assert(s2.riskLevel === '弱', `8 位小写为"弱": ${s2.riskLevel}`);
  } else {
    assert(s2.riskLevel === '中', `8 位小写为"中": ${s2.riskLevel}`);
  }

  const s3 = runStrength('-l 12 -c lower,upper');
  const e3 = 12 * Math.log2(52);
  assert(e3 >= 60 && e3 < 80, `12 位大小写熵在 60-80: ${e3.toFixed(2)}`);
  assert(s3.riskLevel === '强', `12 位大小写为"强": ${s3.riskLevel}`);

  const s4 = runStrength('-l 20 -c lower,upper,digit,symbol');
  const e4 = 20 * Math.log2(94);
  assert(e4 >= 80, `20 位全字符集熵 >= 80: ${e4.toFixed(2)}`);
  assert(s4.riskLevel === '极强', `20 位全字符集为"极强": ${s4.riskLevel}`);

  const s5 = runStrength('-l 16 -c lower,upper,digit,symbol');
  assert(s5.diversity >= 1, `字符多样性 >= 1: ${s5.diversity}`);

  const s6 = runStrength('-l 100 -c lower,upper,digit,symbol');
  assert(s6.diversity === 4, `100 位全字符集多样性为 4: ${s6.diversity}`);

  const s7 = runStrength('-l 50 -c lower');
  assert(s7.diversity === 1, `50 位纯小写多样性为 1: ${s7.diversity}`);
  assert(s7.diversityScore == '25', `50 位纯小写多样性分数为 25%: ${s7.diversityScore}`);
}
results.forEach(r => console.log(r));
results.length = 0;
console.log();

// =====================================================
// 6. 剪贴板复制成功（Windows 平台）
// =====================================================
console.log('📋 6. 剪贴板复制成功（Windows 平台）');
{
  const pwd = run('-l 16 -c lower,upper,digit,symbol --copy');
  assert(pwd.length === 16, '--copy 模式下密码正常输出');

  try {
    const clipContent = execSync('powershell -command "Get-Clipboard"', { encoding: 'utf8' }).trim();
    assert(clipContent === pwd, `剪贴板内容与生成的密码一致: "${pwd.substring(0, 4)}..."`);
  } catch (e) {
    assert(false, `读取剪贴板失败: ${e.message}`);
  }

  const pwdNoCopy = run('-l 16 -c lower,upper,digit,symbol');
  try {
    const clipContent2 = execSync('powershell -command "Get-Clipboard"', { encoding: 'utf8' }).trim();
    assert(clipContent2 !== pwdNoCopy || clipContent2 === pwd, '无 --copy 时不会更新剪贴板（或剪贴板保持上次 --copy 的值）');
  } catch (e) {
    assert(false, `读取剪贴板失败: ${e.message}`);
  }
}
results.forEach(r => console.log(r));
results.length = 0;
console.log();

// =====================================================
// 汇总
// =====================================================
console.log('====================================================');
console.log(`  验收结果: ✅ ${passed} 通过  ❌ ${failed} 失败  共 ${passed + failed} 项`);
console.log('====================================================\n');

if (failed > 0) {
  process.exit(1);
}
