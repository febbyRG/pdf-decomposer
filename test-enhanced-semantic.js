import { decomposePdf } from './dist/index.js';

(async () => {
  console.log('🚀 TESTING ENHANCED SEMANTIC BLOCK COMPOSITION...\n');
  
  const result = await decomposePdf('./scripts/test-input/demo.pdf', {
    elementComposer: true,
    assetPath: './test-enhanced-semantic'
  });
  
  const page2 = result.find(p => p.pageNumber === 2);
  if (!page2) {
    console.log('❌ Page 2 not found');
    return;
  }
  
  console.log(`📊 Enhanced Page 2 Analysis:`);
  console.log(`Total elements: ${page2.elements.length} (target: 5)`);
  console.log('\n=== CURRENT ELEMENTS ===');
  
  page2.elements.forEach((el, index) => {
    const preview = el.data.substring(0, 80).replace(/\s+/g, ' ').replace(/\n/g, ' ').trim();
    console.log(`[${index + 1}] ${el.data.length} chars: "${preview}${el.data.length > 80 ? '...' : ''}"`);
  });
  
  console.log('\n=== 5-PART VALIDATION ===');
  
  // Expected Part 1: Opening paragraph about Saudi Arabia
  const part1Pattern = /In the midst of Saudi Arabia.*?of The Point's Journey/s;
  const part1Element = page2.elements.find(el => part1Pattern.test(el.data));
  console.log(`✅ Part 1 (Opening): ${part1Element ? `Found (${part1Element.data.length} chars)` : '❌ Missing'}`);
  
  // Expected Part 2: Interview question  
  const part2Pattern = /Can you share a brief background.*?retail industry\?/s;
  const part2Element = page2.elements.find(el => part2Pattern.test(el.data));
  console.log(`✅ Part 2 (Question): ${part2Element ? `Found (${part2Element.data.length} chars)` : '❌ Missing'}`);
  
  // Expected Part 3: Answer paragraph
  const part3Pattern = /My path into the shopping centre.*?(ICSC and|retail property)/s;
  const part3Element = page2.elements.find(el => part3Pattern.test(el.data));
  console.log(`✅ Part 3 (Answer): ${part3Element ? `Found (${part3Element.data.length} chars)` : '❌ Missing'}`);
  
  // Expected Part 4: Name/Title block
  const part4Pattern = /MOHAMMAD ALAWI.*?COMPANY LIMITED/s;
  const part4Element = page2.elements.find(el => part4Pattern.test(el.data));
  console.log(`✅ Part 4 (Name/Title): ${part4Element ? `Found (${part4Element.data.length} chars)` : '❌ Missing'}`);
  
  // Expected Part 5: Bio paragraph
  const part5Pattern = /With over 30 years.*?conferences.*?seminars/s;
  const part5Element = page2.elements.find(el => part5Pattern.test(el.data));
  console.log(`✅ Part 5 (Bio): ${part5Element ? `Found (${part5Element.data.length} chars)` : '❌ Missing'}`);
  
  // Show improvement metrics
  console.log(`\n📈 IMPROVEMENT METRICS:`);
  console.log(`Previous: 28 elements → Current: ${page2.elements.length} elements`);
  console.log(`Target: 5 semantic parts`);
  console.log(`${page2.elements.length <= 5 ? '🎉 TARGET ACHIEVED!' : `🔄 Need ${page2.elements.length - 5} more reduction`}`);
  
})();
