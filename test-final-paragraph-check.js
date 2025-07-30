import { decomposePdf } from './dist/index.js';

(async () => {
  console.log('🎯 FINAL PARAGRAPH TEST...\n');
  
  const result = await decomposePdf('./scripts/test-input/demo.pdf', {
    elementComposer: true,
    assetPath: './test-final-paragraph'
  });
  
  const page2 = result.find(p => p.pageNumber === 2);
  if (!page2) return;
  
  console.log(`📊 Total elements: ${page2.elements.length}`);
  console.log('\n=== ALL ELEMENTS ===');
  
  page2.elements.forEach((el, index) => {
    const preview = el.data.substring(0, 70).replace(/\\s+/g, ' ').replace(/\\n/g, ' ').trim();
    console.log(`[${index + 1}] ${el.data.length} chars: "${preview}${el.data.length > 70 ? '...' : ''}"`);
  });
  
  console.log('\n=== TARGET PARAGRAPHS VALIDATION ===');
  
  // Part 1: Full opening paragraph
  const fullPart1 = page2.elements.find(el => 
    el.data.includes('In the midst of Saudi Arabia') && 
    el.data.includes('of The Point\'s Journey')
  );
  console.log(`Part 1 Complete: ${fullPart1 ? '✅ YES' : '❌ NO'} ${fullPart1 ? `(${fullPart1.data.length} chars)` : ''}`);
  
  // Part 3: Full answer paragraph  
  const fullPart3 = page2.elements.find(el => 
    el.data.includes('My path into the shopping') && 
    el.data.includes('engagement with industry')
  );
  console.log(`Part 3 Complete: ${fullPart3 ? '✅ YES' : '❌ NO'} ${fullPart3 ? `(${fullPart3.data.length} chars)` : ''}`);
  
  // Part 5: Full bio paragraph
  const fullPart5 = page2.elements.find(el => 
    el.data.includes('With over 30 years') && 
    el.data.includes('conferences, and seminars')
  );
  console.log(`Part 5 Complete: ${fullPart5 ? '✅ YES' : '❌ NO'} ${fullPart5 ? `(${fullPart5.data.length} chars)` : ''}`);
  
  const successCount = [fullPart1, fullPart3, fullPart5].filter(Boolean).length;
  console.log(`\\n🎯 SUCCESS RATE: ${successCount}/3 paragraphs properly composed`);
  
  if (successCount === 3) {
    console.log('🎉 ALL THREE MAIN PARAGRAPHS ARE NOW PROPERLY COMPOSED!');
  }
  
})();
