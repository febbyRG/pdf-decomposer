import { decomposePdf } from './dist/index.js';

(async () => {
  console.log('🎯 ANALYZING 5 ELEMENTS STRUCTURE...\n');
  
  const result = await decomposePdf('./scripts/test-input/demo.pdf', {
    elementComposer: true,
    assetPath: './test-5-elements'
  });
  
  const page2 = result.find(p => p.pageNumber === 2);
  if (!page2) return;
  
  console.log(`Total elements: ${page2.elements.length}`);
  
  page2.elements.forEach((el, index) => {
    console.log(`\n=== ELEMENT [${index + 1}] - ${el.data.length} chars ===`);
    const preview = el.data.substring(0, 100);
    const ending = el.data.length > 100 ? el.data.substring(el.data.length - 100) : '';
    
    console.log(`Start: "${preview}${el.data.length > 100 ? '...' : ''}"`);
    if (ending) {
      console.log(`End: "...${ending}"`);
    }
    
    // Check which parts this element contains
    const parts = [];
    if (el.data.includes('In the midst of Saudi Arabia')) parts.push('Part 1 start');
    if (el.data.includes('of The Point\'s Journey')) parts.push('Part 1 end');
    if (el.data.includes('Can you share a brief')) parts.push('Part 2 start');
    if (el.data.includes('retail industry?')) parts.push('Part 2 end');
    if (el.data.includes('My path into the shopping')) parts.push('Part 3 start');
    if (el.data.includes('ICSC and')) parts.push('Part 3 content');
    if (el.data.includes('MOHAMMAD ALAWI')) parts.push('Part 4 (names)');
    if (el.data.includes('With over 30 years')) parts.push('Part 5 start');
    if (el.data.includes('conferences, and seminars')) parts.push('Part 5 end');
    
    if (parts.length > 0) {
      console.log(`Contains: ${parts.join(', ')}`);
    }
  });
  
  console.log('\n🎯 TARGET STATUS:');
  const part1Full = page2.elements.find(el => 
    el.data.includes('In the midst of Saudi Arabia') && 
    el.data.includes('of The Point\'s Journey') &&
    !el.data.includes('Can you share')
  );
  console.log(`Part 1 isolated: ${part1Full ? '✅ YES' : '❌ NO'}`);
  
  const part2Full = page2.elements.find(el => 
    el.data.includes('Can you share a brief') && 
    el.data.includes('retail industry?') &&
    !el.data.includes('My path into')
  );
  console.log(`Part 2 isolated: ${part2Full ? '✅ YES' : '❌ NO'}`);
  
  const part3Full = page2.elements.find(el => 
    el.data.includes('My path into the shopping') && 
    el.data.includes('ICSC and') &&
    !el.data.includes('MOHAMMAD ALAWI') &&
    !el.data.includes('With over 30')
  );
  console.log(`Part 3 isolated: ${part3Full ? '✅ YES' : '❌ NO'}`);
  
  const part5Full = page2.elements.find(el => 
    el.data.includes('With over 30 years') && 
    el.data.includes('conferences, and seminars') &&
    !el.data.includes('My path into')
  );
  console.log(`Part 5 isolated: ${part5Full ? '✅ YES' : '❌ NO'}`);
  
})();
