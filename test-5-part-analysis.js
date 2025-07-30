import { decomposePdf } from './dist/index.js';

(async () => {
  console.log('🔍 ANALYZING PAGE 2 STRUCTURE FOR 5-PART IMPROVEMENT...\n');
  
  const result = await decomposePdf('./scripts/test-input/demo.pdf', {
    elementComposer: true,
    assetPath: './test-5-part-analysis'
  });
  
  const page2 = result.find(p => p.pageNumber === 2);
  if (!page2) {
    console.log('❌ Page 2 not found');
    return;
  }
  
  console.log(`📊 Current Page 2 Analysis:`);
  console.log(`Total elements: ${page2.elements.length}`);
  console.log('\n=== CURRENT ELEMENTS (first 100 chars each) ===');
  
  page2.elements.forEach((el, index) => {
    const preview = el.data.substring(0, 100).replace(/\s+/g, ' ').trim();
    console.log(`[${index + 1}] ${el.data.length} chars: "${preview}${el.data.length > 100 ? '...' : ''}"`);
    
    // Show positioning and styling info
    console.log(`    Position: (${Math.round(el.x)}, ${Math.round(el.y)}) | Font: ${el.font_size}px | Color: ${el.fill_color || 'default'}`);
  });
  
  console.log('\n=== EXPECTED 5 PARTS ANALYSIS ===');
  
  // Expected Part 1: Opening paragraph about Saudi Arabia
  const part1Pattern = /In the midst of Saudi Arabia/i;
  const part1Element = page2.elements.find(el => part1Pattern.test(el.data));
  console.log(`Part 1 (Opening): ${part1Element ? '✅ Found' : '❌ Missing'}`);
  if (part1Element) {
    console.log(`  Length: ${part1Element.data.length} chars`);
    console.log(`  Content: "${part1Element.data.substring(0, 80)}..."`);
  }
  
  // Expected Part 2: Interview question
  const part2Pattern = /Can you share a brief background/i;
  const part2Element = page2.elements.find(el => part2Pattern.test(el.data));
  console.log(`Part 2 (Question): ${part2Element ? '✅ Found' : '❌ Missing'}`);
  if (part2Element) {
    console.log(`  Length: ${part2Element.data.length} chars`);
    console.log(`  Content: "${part2Element.data.substring(0, 80)}..."`);
  }
  
  // Expected Part 3: Answer paragraph
  const part3Pattern = /My path into the shopping centre/i;
  const part3Element = page2.elements.find(el => part3Pattern.test(el.data));
  console.log(`Part 3 (Answer): ${part3Element ? '✅ Found' : '❌ Missing'}`);
  if (part3Element) {
    console.log(`  Length: ${part3Element.data.length} chars`);  
    console.log(`  Content: "${part3Element.data.substring(0, 80)}..."`);
  }
  
  // Expected Part 4: Name/Title block
  const part4Pattern = /MOHAMMAD ALAWI/i;
  const part4Element = page2.elements.find(el => part4Pattern.test(el.data));
  console.log(`Part 4 (Name/Title): ${part4Element ? '✅ Found' : '❌ Missing'}`);
  if (part4Element) {
    console.log(`  Length: ${part4Element.data.length} chars`);
    console.log(`  Content: "${part4Element.data.substring(0, 80)}..."`);
  }
  
  // Expected Part 5: Bio paragraph
  const part5Pattern = /With over 30 years/i;
  const part5Element = page2.elements.find(el => part5Pattern.test(el.data));
  console.log(`Part 5 (Bio): ${part5Element ? '✅ Found' : '❌ Missing'}`);
  if (part5Element) {
    console.log(`  Length: ${part5Element.data.length} chars`);
    console.log(`  Content: "${part5Element.data.substring(0, 80)}..."`);
  }
  
  console.log(`\n📈 IMPROVEMENT GOAL:`);
  console.log(`Current: ${page2.elements.length} elements`);
  console.log(`Target: 5 semantic parts (without headers)`);
  console.log(`Reduction needed: ${page2.elements.length - 5} elements`);
  
})();
